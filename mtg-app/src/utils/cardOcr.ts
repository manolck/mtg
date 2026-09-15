/**
 * Extract card name from a cropped card image using Tesseract.js.
 * Webcam-friendly: multi-region, light deskew, contrast enhance, PSM 6/7.
 */

import Tesseract from 'tesseract.js';

/** Name region on a standard MTG card: x%, y%, width%, height% (from top-left). Exporté pour afficher le cadre dans le wizard. */
export const CARD_NAME_REGION = { x: 0.05, y: 0.025, width: 0.72, height: 0.09 };

export type NameRegion = { x: number; y: number; width: number; height: number };

const MIN_HEIGHT_FOR_OCR = 200;
const TARGET_HEIGHT_ENHANCE = 320;

const NAME_REGIONS: NameRegion[] = [
  CARD_NAME_REGION,
  { x: 0.04, y: 0.02, width: 0.78, height: 0.11 },
  { x: 0.03, y: 0.015, width: 0.82, height: 0.13 },
];

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
  region: { x: number; y: number; width: number; height: number },
  rotateDeg = 0
): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const x = Math.floor(region.x * w);
  const y = Math.floor(region.y * h);
  const rw = Math.max(1, Math.floor(region.width * w));
  const rh = Math.max(1, Math.floor(region.height * h));

  if (!rotateDeg) {
    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, x, y, rw, rh, 0, 0, rw, rh);
    return canvas;
  }

  // Rotate full card around center, then crop (approximate deskew for webcam tilt)
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rwFull = Math.ceil(w * cos + h * sin);
  const rhFull = Math.ceil(w * sin + h * cos);
  const rotated = document.createElement('canvas');
  rotated.width = rwFull;
  rotated.height = rhFull;
  const rctx = rotated.getContext('2d');
  if (!rctx) {
    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    return canvas;
  }
  rctx.translate(rwFull / 2, rhFull / 2);
  rctx.rotate(rad);
  rctx.drawImage(img, -w / 2, -h / 2);
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const ox = (rwFull - w) / 2;
    const oy = (rhFull - h) / 2;
    ctx.drawImage(rotated, x + ox, y + oy, rw, rh, 0, 0, rw, rh);
  }
  return canvas;
}

type PreprocessOptions = {
  forceInvert?: boolean;
  binarize?: boolean;
  enhance?: boolean;
  targetHeight?: number;
};

function preprocessForOCR(
  source: HTMLCanvasElement,
  options?: PreprocessOptions
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const targetH = options?.targetHeight ?? (options?.enhance ? TARGET_HEIGHT_ENHANCE : MIN_HEIGHT_FOR_OCR);
  const scale = h < targetH ? targetH / h : Math.max(1, targetH / h);
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
  const enhance = options?.enhance ?? false;

  const sorted = [...grayValues].sort((a, b) => a - b);
  const thresholdSrc = sorted[Math.floor(sorted.length * 0.42)] ?? 128;
  const pLow = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const pHigh = sorted[Math.floor(sorted.length * 0.95)] ?? 255;
  const stretchRange = Math.max(1, pHigh - pLow);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let v = grayValues[p];
    if (enhance) {
      v = ((v - pLow) / stretchRange) * 255;
      v = Math.min(255, Math.max(0, (v - 128) * 1.75 + 128));
    }
    if (invert) v = 255 - v;
    else if (!enhance) v = Math.min(255, Math.max(0, (v - 128) * 1.4 + 128));

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

function letterScore(text: string): number {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const words = text.split(/\s+/).filter((w) => /[\p{L}]{3,}/u.test(w)).length;
  return letters + words * 4;
}

function isWeakOcr(scored: { text: string; confidence: number }[]): boolean {
  if (!scored.length) return true;
  const best = scored[0];
  return letterScore(best.text) < 12 || best.confidence < 35;
}

export interface OCRNameResult {
  /** Best guess from confidence among non-empty variants. */
  text: string;
  /** Primary OCR candidate. */
  textAuto: string;
  /** Alternate OCR candidate. */
  textInverted: string;
  /** All unique OCR strings worth matching (webcam / fuzzy). */
  candidates: string[];
}

async function recognizeVariants(
  worker: Tesseract.Worker,
  canvases: HTMLCanvasElement[]
): Promise<{ text: string; confidence: number }[]> {
  const scored: { text: string; confidence: number }[] = [];
  for (const psm of ['6', '7'] as const) {
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
    } as Record<string, unknown>);
    const results = await Promise.all(canvases.map((v) => worker.recognize(v)));
    for (const r of results) {
      const text = cleanOcrText(r.data?.text ?? '');
      if (text.length >= 2 && letterScore(text) >= 4) {
        scored.push({ text, confidence: r.data?.confidence ?? 0 });
      }
    }
  }
  return scored;
}

/**
 * Extract the card name from a cropped card image (data URL).
 * Pass 1 rapide ; pass 2 (deskew + régions élargies) si OCR faible (webcam).
 */
export async function extractCardNameWithOCR(
  cardImageDataUrl: string,
  region: NameRegion = CARD_NAME_REGION
): Promise<OCRNameResult> {
  const img = await loadImage(cardImageDataUrl);
  const worker = await Tesseract.createWorker('eng+fra', 1, { logger: () => {} });
  try {
    const allScored: { text: string; confidence: number }[] = [];

    const primaryCrop = cropToRegion(img, region);
    const pass1 = [
      preprocessForOCR(primaryCrop, { forceInvert: false, binarize: false, enhance: true }),
      preprocessForOCR(primaryCrop, { forceInvert: false, binarize: false }),
      preprocessForOCR(primaryCrop, { forceInvert: true, binarize: false }),
      preprocessForOCR(primaryCrop, { forceInvert: false, binarize: true }),
    ];
    allScored.push(...(await recognizeVariants(worker, pass1)));
    allScored.sort((a, b) => letterScore(b.text) - letterScore(a.text) || b.confidence - a.confidence);

    if (isWeakOcr(allScored)) {
      const pass2Canvases: HTMLCanvasElement[] = [];
      const regions = [region, ...NAME_REGIONS.filter((r) => r !== region)];
      const rotations = [0, 3, -3, 5, -5];
      for (const reg of regions.slice(0, 3)) {
        for (const rot of rotations) {
          const crop = cropToRegion(img, reg, rot);
          pass2Canvases.push(
            preprocessForOCR(crop, { forceInvert: false, binarize: false, enhance: true }),
            preprocessForOCR(crop, { forceInvert: false, binarize: false }),
            preprocessForOCR(crop, { forceInvert: false, binarize: true, enhance: true })
          );
        }
      }
      // Cap work: recognize in chunks of 8
      for (let i = 0; i < pass2Canvases.length; i += 8) {
        const chunk = pass2Canvases.slice(i, i + 8);
        allScored.push(...(await recognizeVariants(worker, chunk)));
      }
    }

    allScored.sort(
      (a, b) =>
        letterScore(b.text) - letterScore(a.text) ||
        b.confidence - a.confidence ||
        b.text.length - a.text.length
    );
    const texts = [...new Set(allScored.map((s) => s.text))];
    return {
      text: allScored[0]?.text ?? '',
      textAuto: texts[0] ?? '',
      textInverted: texts[1] ?? texts[0] ?? '',
      candidates: texts.slice(0, 24),
    };
  } finally {
    await worker.terminate();
  }
}
