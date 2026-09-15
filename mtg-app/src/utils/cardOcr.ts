/**
 * Extract card name from a cropped card image using Tesseract.js.
 * Plusieurs prétraitements + PSM 6/7 ; le meilleur texte non vide gagne.
 */

import Tesseract from 'tesseract.js';

/** Name region on a standard MTG card: x%, y%, width%, height% (from top-left). Exporté pour afficher le cadre dans le wizard. */
export const CARD_NAME_REGION = { x: 0.05, y: 0.025, width: 0.72, height: 0.09 };

export type NameRegion = { x: number; y: number; width: number; height: number };

const MIN_HEIGHT_FOR_OCR = 160;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function cropToRegion(
  img: HTMLImageElement,
  region: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const x = Math.floor(region.x * w);
  const y = Math.floor(region.y * h);
  const rw = Math.max(1, Math.floor(region.width * w));
  const rh = Math.max(1, Math.floor(region.height * h));
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(img, x, y, rw, rh, 0, 0, rw, rh);
  return canvas;
}

function preprocessForOCR(
  source: HTMLCanvasElement,
  options?: { forceInvert?: boolean; binarize?: boolean }
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const scale = h < MIN_HEIGHT_FOR_OCR ? MIN_HEIGHT_FOR_OCR / h : Math.max(1, 120 / h);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h, 0, 0, outW, outH);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  const data = imageData.data;
  let sum = 0;
  const len = data.length / 4;
  const grayValues: number[] = new Array(len);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayValues[p] = gray;
    sum += gray;
  }

  const mean = len > 0 ? sum / len : 128;
  const invert =
    options?.forceInvert !== undefined ? options.forceInvert : mean < 128;
  const binarize = options?.binarize ?? false;

  const sorted = [...grayValues].sort((a, b) => a - b);
  const thresholdSrc = sorted[Math.floor(sorted.length * 0.42)] ?? 128;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let v = grayValues[p];
    if (invert) v = 255 - v;
    else v = Math.min(255, Math.max(0, (v - 128) * 1.4 + 128));

    if (binarize) {
      const thr = invert ? 255 - thresholdSrc : Math.min(thresholdSrc + 20, 190);
      v = v < thr ? 0 : 255;
    }

    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Nettoie le texte brut OCR (artefacts | ( [ etc.). */
export function cleanOcrText(text: string): string {
  return (text ?? '')
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[_~`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OCRNameResult {
  /** Best guess from confidence among non-empty variants. */
  text: string;
  /** Primary OCR candidate. */
  textAuto: string;
  /** Alternate OCR candidate. */
  textInverted: string;
}

/**
 * Extract the card name from a cropped card image (data URL).
 * Variantes soft/binarized × invert + PSM 6/7.
 */
export async function extractCardNameWithOCR(
  cardImageDataUrl: string,
  region: NameRegion = CARD_NAME_REGION
): Promise<OCRNameResult> {
  const img = await loadImage(cardImageDataUrl);
  const cropped = cropToRegion(img, region);

  const variants = [
    preprocessForOCR(cropped, { forceInvert: false, binarize: false }),
    preprocessForOCR(cropped, { forceInvert: true, binarize: false }),
    preprocessForOCR(cropped, { forceInvert: false, binarize: true }),
    preprocessForOCR(cropped, { forceInvert: true, binarize: true }),
  ];

  const worker = await Tesseract.createWorker('eng+fra', 1, { logger: () => {} });
  try {
    const scored: { text: string; confidence: number }[] = [];
    for (const psm of ['6', '7'] as const) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
      } as Record<string, unknown>);
      const results = await Promise.all(variants.map((v) => worker.recognize(v)));
      for (const r of results) {
        const text = cleanOcrText(r.data?.text ?? '');
        if (text.length >= 2) {
          scored.push({ text, confidence: r.data?.confidence ?? 0 });
        }
      }
    }

    scored.sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length);
    const texts = [...new Set(scored.map((s) => s.text))];
    return {
      text: scored[0]?.text ?? '',
      textAuto: texts[0] ?? '',
      textInverted: texts[1] ?? texts[0] ?? '',
    };
  } finally {
    await worker.terminate();
  }
}
