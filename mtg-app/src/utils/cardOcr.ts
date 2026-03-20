/**
 * Extract card name from a cropped card image using Tesseract.js.
 * PSM 7 (single line). Prétraitement adapté aux cartes MTG : texte noir sur fond gris, ou texte blanc sur fond noir.
 */

import Tesseract from 'tesseract.js';

/** Name region on a standard MTG card: x%, y%, width%, height% (from top-left). Exporté pour afficher le cadre dans le wizard. */
export const CARD_NAME_REGION = { x: 0.06, y: 0.03, width: 0.69, height: 0.08 };

export type NameRegion = { x: number; y: number; width: number; height: number };

const MIN_HEIGHT_FOR_OCR = 80;

/**
 * Create an off-screen image from a data URL and return dimensions.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Crop a region from the image to a new canvas (for better OCR on just the name zone).
 */
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

/** Options for preprocessing: forceInvert overrides auto detection when set. */
function preprocessForOCR(
  source: HTMLCanvasElement,
  options?: { forceInvert?: boolean }
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const scale = h < MIN_HEIGHT_FOR_OCR ? MIN_HEIGHT_FOR_OCR / h : 1;
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

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    sum += gray;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  const mean = len > 0 ? sum / len : 128;
  const invert =
    options?.forceInvert !== undefined ? options.forceInvert : mean < 128;

  for (let i = 0; i < data.length; i += 4) {
    let v = data[i];
    if (invert) {
      v = 255 - v;
    } else {
      v = Math.min(255, Math.max(0, (v - 128) * 1.15 + 128));
    }
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function normalizeOcrText(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export interface OCRNameResult {
  /** Best guess from confidence (auto or inverted). */
  text: string;
  /** Raw OCR with auto preprocessing. */
  textAuto: string;
  /** Raw OCR with inverted preprocessing. */
  textInverted: string;
}

/**
 * Extract the card name from a cropped card image (data URL).
 * Runs OCR twice (auto preprocessing + opposite inversion) and returns both variants plus the confidence winner.
 * Uses PSM 7 (single line), eng+fra. MIN_HEIGHT_FOR_OCR ensures sufficient resolution for Tesseract.
 */
export async function extractCardNameWithOCR(
  cardImageDataUrl: string,
  region: NameRegion = CARD_NAME_REGION
): Promise<OCRNameResult> {
  const img = await loadImage(cardImageDataUrl);
  const cropped = cropToRegion(img, region);
  const preprocessedAuto = preprocessForOCR(cropped);
  const preprocessedInverted = preprocessForOCR(cropped, { forceInvert: true });

  const worker = await Tesseract.createWorker('eng+fra', 1, { logger: () => {} });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '7', // PSM 7 = SINGLE_LINE
    } as Record<string, unknown>);

    const [resultAuto, resultInverted] = await Promise.all([
      worker.recognize(preprocessedAuto),
      worker.recognize(preprocessedInverted),
    ]);

    const textAuto = normalizeOcrText(resultAuto.data?.text ?? '');
    const textInverted = normalizeOcrText(resultInverted.data?.text ?? '');
    const confAuto = resultAuto.data?.confidence ?? 0;
    const confInverted = resultInverted.data?.confidence ?? 0;

    const text =
      textInverted && confInverted > confAuto ? textInverted : textAuto || textInverted;
    return { text, textAuto, textInverted };
  } finally {
    await worker.terminate();
  }
}
