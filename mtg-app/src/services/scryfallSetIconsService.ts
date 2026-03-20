/**
 * Service pour récupérer les sets Scryfall et faire correspondre le logo
 * d'une carte scannée (zone définie) aux icônes des extensions.
 * Options modulaires activables pour améliorer la recherche.
 */

import { fetchWithRetry } from '../utils/fetchWithRetry';
import { scryfallQueue } from '../utils/apiQueue';

const SCRYFALL_API_BASE_URL = 'https://api.scryfall.com';

export interface ScryfallSetInfo {
  id: string;
  code: string;
  name: string;
  icon_svg_uri: string;
  set_type: string;
}

export interface SetMatch {
  set: { code: string; name: string; icon_svg_uri: string };
  score: number;
}

/** Options pour la recherche du logo d'extension (chaque passe activable à la demande). */
export interface LogoMatchOptions {
  /** Ne comparer qu'aux sets qui contiennent la carte (nom anglais). */
  useNameFilter: boolean;
  /** Normaliser luminosité/contraste avant comparaison. */
  useNormalization: boolean;
  /** Binariser (silhouette) pour comparer la forme uniquement. */
  useBinarization: boolean;
  /** Taille de l'icône pour la comparaison (32 ou 64). */
  iconSize: 32 | 64;
  /** Essayer plusieurs échelles/décalages et garder le meilleur score par set. */
  useMultiScale: boolean;
  /** Métrique de comparaison : mse (pixels) ou gradient (contours). */
  metric: 'mse' | 'gradient';
}

export const defaultLogoMatchOptions: LogoMatchOptions = {
  useNameFilter: true,
  useNormalization: false,
  useBinarization: false,
  iconSize: 32,
  useMultiScale: false,
  metric: 'mse',
};

let cachedSets: ScryfallSetInfo[] | null = null;

/**
 * Récupère les codes de set (extensions) qui contiennent une carte donnée (nom anglais).
 */
export async function getSetCodesForCardName(englishName: string): Promise<Set<string>> {
  if (!englishName?.trim()) return new Set();
  const name = englishName.trim().replace(/"/g, '\\"');
  const query = `!"${name}"`;
  const url = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
  const codes = new Set<string>();
  let nextUrl: string | null = url;
  try {
    while (nextUrl && codes.size < 300) {
      const response = await scryfallQueue.enqueue(
        () =>
          fetchWithRetry(
            nextUrl!,
            { headers: { Accept: 'application/json', 'User-Agent': 'MTGCollectionApp/1.0' } },
            { maxRetries: 2, initialDelay: 500, maxDelay: 4000, retryableStatuses: [429, 500, 502, 503, 504] }
          ),
        'normal'
      );
      if (!response.ok) break;
      const data = await response.json();
      const cards = data.data || [];
      for (const card of cards) {
        if (card.set) codes.add(String(card.set).toLowerCase());
      }
      nextUrl = data.has_more ? data.next_page : null;
    }
  } catch {
    // en cas d'erreur, on retourne un set vide → pas de filtre
  }
  return codes;
}

/**
 * Charge la liste des sets Scryfall (avec icône SVG).
 */
export async function fetchSetsWithIcons(): Promise<ScryfallSetInfo[]> {
  if (cachedSets) return cachedSets;
  const url = `${SCRYFALL_API_BASE_URL}/sets`;
  const response = await scryfallQueue.enqueue(
    () =>
      fetchWithRetry(
        url,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'MTGCollectionApp/1.0' },
        },
        { maxRetries: 3, initialDelay: 1000, maxDelay: 8000, retryableStatuses: [429, 500, 502, 503, 504] }
      ),
    'normal'
  );
  if (!response.ok) throw new Error('Failed to fetch Scryfall sets');
  const data = await response.json();
  const all: ScryfallSetInfo[] = (data.data || []).filter(
    (s: { icon_svg_uri?: string; set_type?: string }) => s.icon_svg_uri && s.set_type
  );
  const preferred = ['core', 'expansion', 'masters', 'commander', 'draft_innovation', 'funny', 'starter', 'arsenal', 'duel_deck', 'box'];
  cachedSets = [...all].sort((a, b) => {
    const ai = preferred.indexOf(a.set_type);
    const bi = preferred.indexOf(b.set_type);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  return cachedSets;
}

const iconRasterCache = new Map<string, ImageData>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function toGrayscaleImageData(
  imgOrCanvas: HTMLImageElement | HTMLCanvasElement,
  size: number
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  if (imgOrCanvas instanceof HTMLImageElement) {
    ctx.drawImage(imgOrCanvas, 0, 0, size, size);
  } else {
    ctx.drawImage(imgOrCanvas, 0, 0, imgOrCanvas.width, imgOrCanvas.height, 0, 0, size, size);
  }
  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = Math.round(g);
  }
  return imageData;
}

/** Passe : normalisation (moyenne 0, variance 1) pour insensibilité luminosité/contraste. */
function normalizeImageData(data: ImageData): ImageData {
  const d = data.data;
  let sum = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] - mean;
    varSum += v * v;
  }
  const std = Math.sqrt(varSum / n) || 1;
  const out = new ImageData(new Uint8ClampedArray(d), data.width, data.height);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const v = Math.round(((d[i] - mean) / std) * 50 + 128);
    o[i] = o[i + 1] = o[i + 2] = Math.max(0, Math.min(255, v));
  }
  return out;
}

/** Passe : binarisation (seuillage) pour comparer la forme uniquement. */
function binarizeImageData(data: ImageData, threshold: number = 128): ImageData {
  const d = data.data;
  const out = new ImageData(new Uint8ClampedArray(d), data.width, data.height);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0;
    o[i] = o[i + 1] = o[i + 2] = v;
  }
  return out;
}

/** Passe : gradient (Sobel simplifié) pour comparer les contours. */
function gradientMagnitudeImageData(data: ImageData): ImageData {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const out = new ImageData(new Uint8ClampedArray(d.length), w, h);
  const o = out.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const gx =
        -d[((y - 1) * w + x - 1) * 4] +
        d[((y - 1) * w + x + 1) * 4] +
        -2 * d[(y * w + x - 1) * 4] +
        2 * d[(y * w + x + 1) * 4] +
        -d[((y + 1) * w + x - 1) * 4] +
        d[((y + 1) * w + x + 1) * 4];
      const gy =
        -d[((y - 1) * w + x - 1) * 4] -
        2 * d[((y - 1) * w + x) * 4] -
        d[((y - 1) * w + x + 1) * 4] +
        d[((y + 1) * w + x - 1) * 4] +
        2 * d[((y + 1) * w + x) * 4] +
        d[((y + 1) * w + x + 1) * 4];
      const mag = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy)));
      o[i] = o[i + 1] = o[i + 2] = mag;
      o[i + 3] = 255;
    }
  }
  return out;
}

function applyPreprocess(data: ImageData, opts: LogoMatchOptions): ImageData {
  let out = data;
  if (opts.useNormalization) out = normalizeImageData(out);
  if (opts.useBinarization) out = binarizeImageData(out);
  if (opts.metric === 'gradient') out = gradientMagnitudeImageData(out);
  return out;
}

async function getSetIconRaster(setInfo: ScryfallSetInfo, size: number): Promise<ImageData> {
  const key = `${setInfo.code}_${size}`;
  if (iconRasterCache.has(key)) return iconRasterCache.get(key)!;
  const img = await loadImage(setInfo.icon_svg_uri);
  const data = toGrayscaleImageData(img, size);
  iconRasterCache.set(key, data);
  return data;
}

function compareMSE(a: ImageData, b: ImageData): number {
  if (a.data.length !== b.data.length) return 0;
  let sum = 0;
  const n = a.data.length;
  for (let i = 0; i < n; i += 4) {
    const d = a.data[i] - b.data[i];
    sum += d * d;
  }
  const mse = sum / (n / 4);
  return 1 / (1 + mse / 256);
}

function compareImageData(a: ImageData, b: ImageData, metric: 'mse' | 'gradient'): number {
  if (metric === 'gradient') {
    const ga = gradientMagnitudeImageData(a);
    const gb = gradientMagnitudeImageData(b);
    return compareMSE(ga, gb);
  }
  return compareMSE(a, b);
}

export type LogoRegion = { x: number; y: number; width: number; height: number };

function extractLogoCrop(
  img: HTMLImageElement,
  region: LogoRegion,
  scale: number,
  shiftX: number,
  shiftY: number,
  size: number
): ImageData {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rw = Math.max(1, Math.floor(region.width * w));
  const rh = Math.max(1, Math.floor(region.height * h));
  const cx = region.x * w + rw / 2;
  const cy = region.y * h + rh / 2;
  const nw = rw * scale;
  const nh = rh * scale;
  let x = cx - nw / 2 + shiftX;
  let y = cy - nh / 2 + shiftY;
  x = Math.max(0, Math.min(w - nw, x));
  y = Math.max(0, Math.min(h - nh, y));
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(nw));
  crop.height = Math.max(1, Math.round(nh));
  const ctx = crop.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  ctx.drawImage(img, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return toGrayscaleImageData(crop, size);
}

/**
 * Extrait la zone logo, applique les passes activées, compare aux icônes des sets.
 * @param cardNameEnglish - Nom anglais de la carte (pour useNameFilter) ; optionnel.
 */
export async function matchCardLogoToSets(
  cardImageDataUrl: string,
  region: LogoRegion,
  topN: number = 10,
  options: LogoMatchOptions = defaultLogoMatchOptions,
  cardNameEnglish?: string | null
): Promise<SetMatch[]> {
  const opts = { ...defaultLogoMatchOptions, ...options };
  const size = opts.iconSize;

  const img = await loadImage(cardImageDataUrl);
  let sets = await fetchSetsWithIcons();

  if (opts.useNameFilter && cardNameEnglish?.trim()) {
    const allowedCodes = await getSetCodesForCardName(cardNameEnglish.trim());
    if (allowedCodes.size > 0) {
      sets = sets.filter((s) => allowedCodes.has(s.code.toLowerCase()));
    }
    if (sets.length === 0) sets = await fetchSetsWithIcons();
  }

  const variants: ImageData[] = [];
  if (opts.useMultiScale) {
    for (const scale of [0.95, 1, 1.05]) {
      for (const sx of [-2, 0, 2]) {
        for (const sy of [-2, 0, 2]) {
          variants.push(extractLogoCrop(img, region, scale, sx, sy, size));
        }
      }
    }
  } else {
    variants.push(extractLogoCrop(img, region, 1, 0, 0, size));
  }

  const preprocessedVariants = variants.map((v) => applyPreprocess(v, opts));

  const scores: SetMatch[] = [];
  for (const setInfo of sets) {
    try {
      const iconData = await getSetIconRaster(setInfo, size);
      const iconProcessed = applyPreprocess(iconData, opts);
      let best = 0;
      for (const cardVariant of preprocessedVariants) {
        const s = compareImageData(cardVariant, iconProcessed, opts.metric);
        if (s > best) best = s;
      }
      scores.push({
        set: { code: setInfo.code, name: setInfo.name, icon_svg_uri: setInfo.icon_svg_uri },
        score: best,
      });
    } catch {
      // ignorer les sets dont l'icône ne charge pas
    }
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN);
}
