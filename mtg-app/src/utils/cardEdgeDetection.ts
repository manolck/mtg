/**
 * Card edge detection using OpenCV.js (loaded from CDN).
 * Returns the four corners of the detected card contour when proportions match MTG (63×88 mm).
 * - Gère les cartes à bord blanc et à bord noir (pass normal + pass image inversée).
 * - Gère la perspective (trapèze) : quand la caméra n'est pas à 90° de la carte, le bord
 *   proche paraît plus grand et le bord éloigné plus petit ; on accepte un ratio du rectangle
 *   englobant dans une plage élargie (~0.44 à 1.0) et on vérifie que les côtés du quad ne
 *   sont pas trop déséquilibrés (rapport max/min < 3.2).
 * S'il n'y a pas de carte détectée, la recherche continue à chaque frame (pas de contour affiché).
 */

import { loadOpenCV } from './loadOpenCV';

export interface Quadrilateral {
  /** Four points [x, y] in image coordinates (top-left, top-right, bottom-right, bottom-left order) */
  points: [number, number][];
  /** True only when the quad matches MTG card proportions (63×88 mm); false when aucune carte trouvée */
  hasCardProportions?: boolean;
}

/** Official Magic: The Gathering card dimensions (Wizards of the Coast): 63 mm × 88 mm */
const CARD_ASPECT_RATIO = 63 / 88; // ≈ 0.7159
/** Large tolerance: sous un angle (trapèze), le rectangle englobant a un ratio qui s'éloigne de 0.716 */
const ASPECT_TOLERANCE = 0.28; // ~±28% → ratio accepté ~0.44 à 1.0 (vue face ~0.72, trapèze incliné ~0.5–0.95)
const MIN_AREA_RATIO = 0.02; // contour area must be at least 2% of image
/** En perspective le bord proche est plus long que le bord éloigné ; rapport max acceptable entre côtés */
const MAX_SIDE_LENGTH_RATIO = 3.2; // longest side / shortest side (carte très inclinée peut donner ~2–2.5)

/**
 * Returns the four corners of the canvas (full frame) as a quadrilateral (hasCardProportions: false).
 */
function fullFrameQuad(canvas: HTMLCanvasElement): Quadrilateral {
  const w = canvas.width;
  const h = canvas.height;
  return {
    points: [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    hasCardProportions: false,
  };
}

/**
 * Compute aspect ratio (width/height) of a quad's axis-aligned bounding box.
 * Sous un angle, la carte forme un trapèze : ce ratio s'éloigne de 63/88, d'où une tolérance large.
 */
function quadAspectRatio(points: [number, number][]): number {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return h > 0 ? w / h : 0;
}

/** Distance entre deux points [x,y]. */
function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Côtés du quad (ordre: p0-p1, p1-p2, p2-p3, p3-p0).
 * Retourne le rapport max(sides)/min(sides). Pour une carte en perspective, ce rapport reste raisonnable.
 */
function quadSideLengthRatio(points: [number, number][]): number {
  if (points.length !== 4) return Infinity;
  const sides = [
    dist(points[0], points[1]),
    dist(points[1], points[2]),
    dist(points[2], points[3]),
    dist(points[3], points[0]),
  ];
  const minS = Math.min(...sides);
  const maxS = Math.max(...sides);
  return minS > 0 ? maxS / minS : Infinity;
}

/**
 * Ensure points are in consistent order (top-left, top-right, bottom-right, bottom-left).
 */
function orderQuadPoints(points: [number, number][]): [number, number][] {
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  const withAngle = points.map((p) => ({
    p,
    angle: Math.atan2(p[1] - cy, p[0] - cx),
  }));
  withAngle.sort((a, b) => a.angle - b.angle);
  return withAngle.map((x) => x.p) as [number, number][];
}

/** Centroid of the quad. */
function quadCentroid(points: [number, number][]): [number, number] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [cx, cy];
}

/**
 * Order 4 points as TL, TR, BR, BL (top-left, top-right, bottom-right, bottom-left).
 */
function orderCornersTLTRBRBL(points: [number, number][]): [number, number][] {
  if (points.length !== 4) return points;
  const byY = [...points].sort((a, b) => a[1] - b[1]);
  const [top0, top1] = byY.slice(0, 2);
  const [bot0, bot1] = byY.slice(2, 4);
  const tl = top0[0] < top1[0] ? top0 : top1;
  const tr = top0[0] < top1[0] ? top1 : top0;
  const bl = bot0[0] < bot1[0] ? bot0 : bot1;
  const br = bot0[0] < bot1[0] ? bot1 : bot0;
  return [tl, tr, br, bl];
}

/**
 * Régularise un quad en un rectangle parfait : même centre et dimensions moyennes,
 * mais bords parfaitement horizontaux (haut/bas) et verticaux (gauche/droite) dans l’orientation de la carte.
 */
function regularizeQuadToRectangle(points: [number, number][]): [number, number][] {
  if (points.length !== 4) return points;
  const [tl, tr, br, bl] = orderCornersTLTRBRBL(points);
  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
  const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
  const widthTop = dist(tl, tr);
  const widthBot = dist(bl, br);
  const width = (widthTop + widthBot) / 2;
  const heightLeft = dist(tl, bl);
  const heightRight = dist(tr, br);
  const height = (heightLeft + heightRight) / 2;
  const angle = Math.atan2(
    (tr[1] - tl[1] + br[1] - bl[1]) / 2,
    (tr[0] - tl[0] + br[0] - bl[0]) / 2
  );
  const rx = Math.cos(angle);
  const ry = Math.sin(angle);
  const dx = -ry;
  const dy = rx;
  const w2 = width / 2;
  const h2 = height / 2;
  return [
    [cx - w2 * rx - h2 * dx, cy - w2 * ry - h2 * dy],
    [cx + w2 * rx - h2 * dx, cy + w2 * ry - h2 * dy],
    [cx + w2 * rx + h2 * dx, cy + w2 * ry + h2 * dy],
    [cx - w2 * rx + h2 * dx, cy - w2 * ry + h2 * dy],
  ] as [number, number][];
}

/**
 * Expand the quad away from its centroid (scale > 1) to include an outer border.
 * Used when we detected the inner edge of a white-bordered card and want the outer edge.
 */
function expandQuadFromCenter(
  points: [number, number][],
  scale: number
): [number, number][] {
  const [cx, cy] = quadCentroid(points);
  return points.map(([px, py]) => [
    cx + (px - cx) * scale,
    cy + (py - cy) * scale,
  ]) as [number, number][];
}

/**
 * Sample luminance in the zone just OUTSIDE the detected contour (toward the background).
 * If the card has a white border on a dark background, we detect the inner edge (content/border);
 * the area outside that edge is the white border. High luminance there => carte à bord blanc.
 */
function sampleOutsideBorderLuminance(
  canvas: HTMLCanvasElement,
  points: [number, number][],
  samplesPerEdge: number = 4,
  outwardRatio: number = 0.04
): number {
  const [cx, cy] = quadCentroid(points);
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  let sum = 0;
  let count = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    for (let k = 0; k < samplesPerEdge; k++) {
      const t = (k + 1) / (samplesPerEdge + 1);
      const x = p0[0] + t * (p1[0] - p0[0]);
      const y = p0[1] + t * (p1[1] - p0[1]);
      const outwardX = cx + (x - cx) * (1 + outwardRatio);
      const outwardY = cy + (y - cy) * (1 + outwardRatio);
      const ix = Math.round(outwardX);
      const iy = Math.round(outwardY);
      if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
        const idx = (iy * w + ix) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        sum += lum;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Threshold above which the zone outside the contour is considered white (bord blanc détecté). */
const WHITE_BORDER_LUMINANCE_THRESHOLD = 200;

/**
 * True when the area just outside the detected contour is white.
 * Then we know we've detected the inner edge (content/border) and must expand to the outer edge.
 */
function isWhiteBorderedCard(
  canvas: HTMLCanvasElement,
  points: [number, number][]
): boolean {
  const avgLum = sampleOutsideBorderLuminance(canvas, points);
  return avgLum >= WHITE_BORDER_LUMINANCE_THRESHOLD;
}

/** When white border detected (inner edge), expand quad outward to approximate outer card edge. */
const WHITE_BORDER_EXPAND_SCALE = 1.06;

/**
 * From an edges Mat, find the best quad that has MTG card proportions.
 * Returns { bestQuad, bestArea } or { bestQuad: null, bestArea: 0 }.
 */
function findBestCardQuadFromEdges(
  cv: any,
  edges: any,
  imageArea: number
): { bestQuad: [number, number][] | null; bestArea: number } {
  const contours = new (cv as any).MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let bestQuad: [number, number][] | null = null;
  let bestArea = 0;

  for (let i = 0; i < (contours as any).size(); i++) {
    const contour = (contours as any).get(i);
    const area = cv.contourArea(contour);
    if (area < imageArea * MIN_AREA_RATIO) {
      contour.delete();
      continue;
    }

    const approx = new cv.Mat();
    const epsilon = 0.02 * cv.arcLength(contour, true);
    cv.approxPolyDP(contour, approx, epsilon, true);

    if (approx.rows !== 4) {
      approx.delete();
      contour.delete();
      continue;
    }

    const points: [number, number][] = [];
    for (let r = 0; r < 4; r++) {
      const x = approx.data32S[r * 2];
      const y = approx.data32S[r * 2 + 1];
      points.push([x, y]);
    }
    approx.delete();
    contour.delete();

      const aspect = quadAspectRatio(points);
      const aspectDiff = Math.abs(aspect - CARD_ASPECT_RATIO);
      if (aspectDiff > ASPECT_TOLERANCE) continue;

      // Rejeter les quadrilatères trop allongés (pas une carte, même en perspective)
      const sideRatio = quadSideLengthRatio(points);
      if (sideRatio > MAX_SIDE_LENGTH_RATIO) continue;

      if (area > bestArea) {
      bestArea = area;
      bestQuad = orderQuadPoints(points);
    }
  }

  (contours as any).delete();
  hierarchy.delete();
  return { bestQuad, bestArea };
}

/**
 * Detect card contour from a canvas (video frame).
 * Tries normal grayscale first (bord blanc / fond sombre), then inverted grayscale (bord noir / fond clair).
 * Returns a quad with hasCardProportions: true only when a shape matching MTG proportions is found;
 * otherwise returns fallback with hasCardProportions: false (la recherche continue à la prochaine frame).
 */
export async function detectCardEdges(canvas: HTMLCanvasElement): Promise<Quadrilateral> {
  const fallback = () => fullFrameQuad(canvas);

  try {
    await loadOpenCV();
  } catch {
    return fallback();
  }

  const cv = (typeof window !== 'undefined' && window.cv) ? window.cv : null;
  if (!cv) return fallback();

  const w = canvas.width;
  const h = canvas.height;
  if (w < 10 || h < 10) return fallback();

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edges: any = null;
  let inverted: any = null;
  let blurredInv: any = null;
  let edgesInv: any = null;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const imageArea = w * h;
    const ksize = new cv.Size(5, 5);

    // Pass 1: image normale (bord blanc bien visible sur fond sombre)
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, ksize, 0);
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);
    let { bestQuad, bestArea } = findBestCardQuadFromEdges(cv, edges, imageArea);

    // Pass 2: si rien trouvé, essayer image inversée (bord noir sur fond clair → contraste inversé)
    if (!bestQuad || bestArea === 0) {
      inverted = new cv.Mat();
      cv.bitwise_not(gray, inverted);
      blurredInv = new cv.Mat();
      cv.GaussianBlur(inverted, blurredInv, ksize, 0);
      edgesInv = new cv.Mat();
      cv.Canny(blurredInv, edgesInv, 50, 150);
      const result2 = findBestCardQuadFromEdges(cv, edgesInv, imageArea);
      if (result2.bestQuad && result2.bestArea > bestArea) {
        bestQuad = result2.bestQuad;
        bestArea = result2.bestArea;
      }
    }

    if (bestQuad && bestQuad.length === 4) {
      if (isWhiteBorderedCard(canvas, bestQuad)) {
        bestQuad = expandQuadFromCenter(bestQuad, WHITE_BORDER_EXPAND_SCALE);
      }
      bestQuad = regularizeQuadToRectangle(bestQuad);
      return { points: bestQuad, hasCardProportions: true };
    }
  } catch (err) {
    console.warn('Card edge detection failed:', err);
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edges) edges.delete();
    if (inverted) inverted?.delete();
    if (blurredInv) blurredInv?.delete();
    if (edgesInv) edgesInv?.delete();
  }

  return fallback();
}

/**
 * Draw the detected quad on a 2D canvas context (e.g. overlay on video).
 */
export function drawQuadOnContext(
  ctx: CanvasRenderingContext2D,
  quad: Quadrilateral,
  style: { strokeStyle?: string; lineWidth?: number } = {}
): void {
  const { strokeStyle = '#00ff00', lineWidth = 3 } = style;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const [p0, p1, p2, p3] = quad.points;
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  ctx.stroke();
}
