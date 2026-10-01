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
/** Reject frame-filling false positives (glare / table). */
const MAX_AREA_RATIO = 0.55;
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
 * Convert a contour to 4 corner points (approxPolyDP or minAreaRect).
 * OpenCV.js APIs for boxPoints vary by build — try several strategies.
 */
function contourToQuadPoints(cv: any, contour: any): [number, number][][] {
  const out: [number, number][][] = [];
  const approx = new cv.Mat();
  try {
    const epsilon = 0.025 * cv.arcLength(contour, true);
    cv.approxPolyDP(contour, approx, epsilon, true);
    if (approx.rows === 4) {
      const points: [number, number][] = [];
      for (let r = 0; r < 4; r++) {
        points.push([approx.data32S[r * 2], approx.data32S[r * 2 + 1]]);
      }
      out.push(points);
    }
  } finally {
    approx.delete();
  }

  try {
    const rect = cv.minAreaRect(contour);
    let pts: [number, number][] | null = null;
    if (cv.RotatedRect && typeof cv.RotatedRect.points === 'function') {
      const rp = cv.RotatedRect.points(rect);
      if (rp?.length >= 4) {
        pts = rp.slice(0, 4).map((p: { x: number; y: number }) => [p.x, p.y]);
      }
    }
    if (!pts && typeof cv.boxPoints === 'function') {
      try {
        const box = cv.boxPoints(rect);
        if (box && typeof box.rows === 'number') {
          const data = box.data32F;
          if (data && data.length >= 8) {
            pts = [];
            for (let r = 0; r < 4; r++) pts.push([data[r * 2], data[r * 2 + 1]]);
          }
          box.delete?.();
        }
      } catch {
        const outMat = new cv.Mat();
        cv.boxPoints(rect, outMat);
        const data = outMat.data32F;
        if (data && data.length >= 8) {
          pts = [];
          for (let r = 0; r < 4; r++) pts.push([data[r * 2], data[r * 2 + 1]]);
        }
        outMat.delete();
      }
    }
    if (!pts && rect?.size && rect?.center) {
      const angle = ((rect.angle || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hw = (rect.size.width || 0) / 2;
      const hh = (rect.size.height || 0) / 2;
      const cx = rect.center.x;
      const cy = rect.center.y;
      pts = (
        [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as [number, number][]
      ).map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    if (pts) out.push(pts);
  } catch {
    /* minAreaRect unavailable */
  }
  return out;
}

/**
 * Reject quads that don't look like a card on the table (glare, empty desk, UI).
 * Especially rejects oversized boxes where the real card sits in a corner.
 */
function isPlausibleCardQuad(canvas: HTMLCanvasElement, points: [number, number][]): boolean {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 10 || h < 10 || points.length !== 4) return false;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw < 40 || bh < 60) return false;
  const areaRatio = (bw * bh) / (w * h);
  if (areaRatio < 0.05 || areaRatio > MAX_AREA_RATIO) return false;
  const aspect = bw / bh;
  if (Math.abs(aspect - CARD_ASPECT_RATIO) > ASPECT_TOLERANCE) return false;

  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const lumAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  // Sample ring outside AABB first (baseline for "desk")
  const step = Math.max(2, Math.floor(Math.min(bw, bh) / 28));
  let outSum = 0;
  let outN = 0;
  const pad = Math.max(8, Math.floor(Math.min(bw, bh) * 0.1));
  const ox0 = Math.max(0, minX - pad);
  const ox1 = Math.min(w - 1, maxX + pad);
  const oy0 = Math.max(0, minY - pad);
  const oy1 = Math.min(h - 1, maxY + pad);
  for (let y = oy0; y <= oy1; y += step) {
    for (let x = ox0; x <= ox1; x += step) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
      outSum += lumAt(x, y);
      outN++;
    }
  }
  const outMean = outN > 0 ? outSum / outN : 0;
  // Relative threshold: on a dark table, card face is only modestly brighter
  const contentThresh = Math.max(outMean + 8, Math.min(70, outMean + 18));

  const ix0 = Math.floor(minX + bw * 0.08);
  const ix1 = Math.ceil(maxX - bw * 0.08);
  const iy0 = Math.floor(minY + bh * 0.08);
  const iy1 = Math.ceil(maxY - bh * 0.08);
  let inSum = 0;
  let inSum2 = 0;
  let inContent = 0;
  let inN = 0;
  let massX = 0;
  let massY = 0;
  for (let y = iy0; y < iy1; y += step) {
    for (let x = ix0; x < ix1; x += step) {
      const L = lumAt(x, y);
      inSum += L;
      inSum2 += L * L;
      inN++;
      if (L >= contentThresh) {
        inContent++;
        massX += x;
        massY += y;
      }
    }
  }
  if (inN < 20) return false;
  const inMean = inSum / inN;
  const inStd = Math.sqrt(Math.max(0, inSum2 / inN - inMean * inMean));
  const contentRatio = inContent / inN;

  // Contenu doit remplir une part significative du cadre (évite carte coincée dans un coin)
  if (contentRatio < 0.18) return false;
  if (inContent >= 8) {
    const cxMass = massX / inContent;
    const cyMass = massY / inContent;
    const boxCx = (minX + maxX) / 2;
    const boxCy = (minY + maxY) / 2;
    const offsetX = Math.abs(cxMass - boxCx) / bw;
    const offsetY = Math.abs(cyMass - boxCy) / bh;
    if (offsetX > 0.22 || offsetY > 0.22) return false;
  }

  const brighter = inMean > outMean + 4;
  const textured = inStd > 10;
  const darkScene = outMean < 55;
  // Scène sombre : accepter un contraste plus faible si le contenu est bien rempli
  if (darkScene) {
    return (brighter && textured && contentRatio > 0.18) || (inStd > 14 && contentRatio > 0.25);
  }
  return (brighter && textured && contentRatio > 0.2) || (inStd > 18 && contentRatio > 0.22);
}

/** Expand a content bounding box to MTG card proportions, clamped to the frame. */
function contentRectToCardQuad(
  r: { x: number; y: number; width: number; height: number },
  imageW: number,
  imageH: number,
  expandX = 1.18,
  expandY = 1.16
): [number, number][] {
  let bw = r.width * expandX;
  let bh = r.height * expandY;
  let cx = r.x + r.width / 2;
  let cy = r.y + r.height / 2;
  if (bw / bh > CARD_ASPECT_RATIO) bh = bw / CARD_ASPECT_RATIO;
  else bw = bh * CARD_ASPECT_RATIO;
  if (bw > imageW * 0.92) {
    bw = imageW * 0.9;
    bh = bw / CARD_ASPECT_RATIO;
  }
  if (bh > imageH * 0.92) {
    bh = imageH * 0.9;
    bw = bh * CARD_ASPECT_RATIO;
  }
  cx = Math.min(Math.max(cx, bw / 2), imageW - bw / 2);
  cy = Math.min(Math.max(cy, bh / 2), imageH - bh / 2);
  return [
    [cx - bw / 2, cy - bh / 2],
    [cx + bw / 2, cy - bh / 2],
    [cx + bw / 2, cy + bh / 2],
    [cx - bw / 2, cy + bh / 2],
  ];
}

/**
 * Black-border card on dark background: find the solid bright face blob
 * (title / art / text), expand to MTG aspect. Scores all candidates.
 */
function findCardQuadFromBrightContent(
  cv: any,
  gray: any,
  imageW: number,
  imageH: number,
  canvas: HTMLCanvasElement
): { bestQuad: [number, number][] | null; bestArea: number } {
  const imageArea = imageW * imageH;
  const enhanced = new cv.Mat();
  const blur = new cv.Mat();
  try {
    if (typeof cv.CLAHE === 'function') {
      const clahe = new cv.CLAHE(3.5, new cv.Size(8, 8));
      clahe.apply(gray, enhanced);
      clahe.delete();
    } else {
      gray.copyTo(enhanced);
    }
  } catch {
    gray.copyTo(enhanced);
  }
  cv.GaussianBlur(enhanced, blur, new cv.Size(5, 5), 0);

  let bestQuad: [number, number][] | null = null;
  let bestScore = -1;

  const considerContour = (contour: any) => {
    const area = cv.contourArea(contour);
    const areaRatio = area / imageArea;
    // Contenu clair seul (sans bordure) : plus petit qu'une carte entière
    if (areaRatio < 0.035 || areaRatio > 0.42) return;
    const r = cv.boundingRect(contour);
    if (r.height < 45 || r.width < 30) return;
    const fill = area / (r.width * r.height + 1e-6);
    if (fill < 0.28) return;
    const contentAspect = r.width / r.height;
    if (contentAspect < 0.4 || contentAspect > 1.15) return;

    const points = contentRectToCardQuad(r, imageW, imageH);
    if (!isPlausibleCardQuad(canvas, points)) return;
    const aspectFit = 1 - Math.min(1, Math.abs(contentAspect - CARD_ASPECT_RATIO) / 0.4);
    const score = fill * 2.5 + areaRatio * 1.5 + aspectFit + Math.min(areaRatio, 0.25);
    if (score > bestScore) {
      bestScore = score;
      bestQuad = points;
    }
  };

  const mean = cv.mean(blur)[0] as number;
  const thresholds: number[] = [];
  // Otsu si dispo
  try {
    const otsuMask = new cv.Mat();
    const otsuT = cv.threshold(blur, otsuMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    otsuMask.delete();
    if (typeof otsuT === 'number' && otsuT > 15 && otsuT < 180) {
      thresholds.push(otsuT * 0.85, otsuT, otsuT * 1.1);
    }
  } catch {
    /* Otsu unavailable */
  }
  for (const delta of [12, 18, 25, 35, 45]) {
    thresholds.push(Math.max(28, Math.min(140, mean + delta)));
  }
  thresholds.push(40, 50, 60, 75);

  const uniqueT = [...new Set(thresholds.map((t) => Math.round(t)))].sort((a, b) => a - b);

  for (const t of uniqueT) {
    const mask = new cv.Mat();
    cv.threshold(blur, mask, t, 255, cv.THRESH_BINARY);
    const closed = new cv.Mat();
    const k =
      typeof cv.getStructuringElement === 'function'
        ? cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))
        : cv.Mat.ones(9, 9, cv.CV_8U);
    cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, k);
    const openK =
      typeof cv.getStructuringElement === 'function'
        ? cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
        : cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(closed, closed, cv.MORPH_OPEN, openK);

    const contours = new (cv as any).MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      considerContour(contour);
      contour.delete();
    }
    contours.delete();
    hierarchy.delete();
    mask.delete();
    closed.delete();
    k.delete();
    openK.delete();
  }

  // Pass complémentaire : seuillage adaptatif sur image CLAHE (carte très sombre)
  try {
    const thr = new cv.Mat();
    cv.adaptiveThreshold(
      blur,
      thr,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      51,
      -8
    );
    const closed = new cv.Mat();
    const k =
      typeof cv.getStructuringElement === 'function'
        ? cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11))
        : cv.Mat.ones(11, 11, cv.CV_8U);
    cv.morphologyEx(thr, closed, cv.MORPH_CLOSE, k);
    const contours = new (cv as any).MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      considerContour(contour);
      contour.delete();
    }
    contours.delete();
    hierarchy.delete();
    thr.delete();
    closed.delete();
    k.delete();
  } catch {
    /* adaptive unavailable */
  }

  enhanced.delete();
  blur.delete();
  return { bestQuad, bestArea: bestQuad ? bestScore : 0 };
}

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

  const tryQuad = (points: [number, number][], area: number) => {
    if (points.length !== 4) return;
    const areaRatio = area / imageArea;
    if (areaRatio > MAX_AREA_RATIO) return;
    const aspect = quadAspectRatio(points);
    const aspectDiff = Math.abs(aspect - CARD_ASPECT_RATIO);
    if (aspectDiff > ASPECT_TOLERANCE) return;
    const sideRatio = quadSideLengthRatio(points);
    if (sideRatio > MAX_SIDE_LENGTH_RATIO) return;
    if (area > bestArea) {
      bestArea = area;
      bestQuad = orderQuadPoints(points);
    }
  };

  for (let i = 0; i < (contours as any).size(); i++) {
    const contour = (contours as any).get(i);
    const area = cv.contourArea(contour);
    if (area < imageArea * MIN_AREA_RATIO) {
      contour.delete();
      continue;
    }
    // Toujours tester approx ET minAreaRect (approx 4 pts peut être un mauvais landscape)
    for (const points of contourToQuadPoints(cv, contour)) {
      tryQuad(points, area);
    }
    contour.delete();
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
    cv.Canny(blurred, edges, 40, 120);
    const dilateK =
      typeof cv.getStructuringElement === 'function'
        ? cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
        : cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, dilateK);
    let { bestQuad, bestArea } = findBestCardQuadFromEdges(cv, edges, imageArea);
    if (bestQuad && !isPlausibleCardQuad(canvas, bestQuad)) {
      bestQuad = null;
      bestArea = 0;
    }

    const meanLum = cv.mean(gray)[0] as number;
    const darkScene = meanLum < 70;

    // Pass 2: si rien trouvé, essayer image inversée (bord noir sur fond clair)
    if (!bestQuad || bestArea === 0) {
      inverted = new cv.Mat();
      cv.bitwise_not(gray, inverted);
      blurredInv = new cv.Mat();
      cv.GaussianBlur(inverted, blurredInv, ksize, 0);
      edgesInv = new cv.Mat();
      cv.Canny(blurredInv, edgesInv, 40, 120);
      cv.dilate(edgesInv, edgesInv, dilateK);
      const result2 = findBestCardQuadFromEdges(cv, edgesInv, imageArea);
      if (result2.bestQuad && result2.bestArea > bestArea && isPlausibleCardQuad(canvas, result2.bestQuad)) {
        bestQuad = result2.bestQuad;
        bestArea = result2.bestArea;
      }
    }

    // Pass 3: Canny plus permissif + adaptive threshold (bords noirs grainés)
    if (!bestQuad || bestArea === 0) {
      const edgesLoose = new cv.Mat();
      cv.Canny(blurred, edgesLoose, 20, 70);
      cv.dilate(edgesLoose, edgesLoose, dilateK);
      const result3 = findBestCardQuadFromEdges(cv, edgesLoose, imageArea);
      edgesLoose.delete();
      if (result3.bestQuad && result3.bestArea > bestArea && isPlausibleCardQuad(canvas, result3.bestQuad)) {
        bestQuad = result3.bestQuad;
        bestArea = result3.bestArea;
      }
    }
    if (!bestQuad || bestArea === 0) {
      const thr = new cv.Mat();
      cv.adaptiveThreshold(
        blurred,
        thr,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        31,
        8
      );
      const closed = new cv.Mat();
      const closeK =
        typeof cv.getStructuringElement === 'function'
          ? cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
          : cv.Mat.ones(5, 5, cv.CV_8U);
      cv.morphologyEx(thr, closed, cv.MORPH_CLOSE, closeK);
      const result4 = findBestCardQuadFromEdges(cv, closed, imageArea);
      thr.delete();
      closed.delete();
      closeK.delete();
      if (result4.bestQuad && result4.bestArea > bestArea && isPlausibleCardQuad(canvas, result4.bestQuad)) {
        bestQuad = result4.bestQuad;
        bestArea = result4.bestArea;
      }
    }
    dilateK.delete();

    // Pass 4: bord noir / fond noir — blob clair (toujours en scène sombre, sinon en fallback)
    if (!bestQuad || bestArea === 0 || darkScene) {
      const bright = findCardQuadFromBrightContent(cv, gray, w, h, canvas);
      if (bright.bestQuad) {
        // En scène sombre, préférer le contenu clair (les bords Canny sont souvent des reflets)
        if (!bestQuad || darkScene || bright.bestArea > bestArea) {
          bestQuad = bright.bestQuad;
          bestArea = bright.bestArea;
        }
      }
    }

    if (bestQuad && bestQuad.length === 4) {
      if (isWhiteBorderedCard(canvas, bestQuad)) {
        bestQuad = expandQuadFromCenter(bestQuad, WHITE_BORDER_EXPAND_SCALE);
      }
      bestQuad = regularizeQuadToRectangle(bestQuad);
      if (!isPlausibleCardQuad(canvas, bestQuad)) {
        return fallback();
      }
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
  style: { strokeStyle?: string; lineWidth?: number; fillStyle?: string } = {}
): void {
  const { strokeStyle = '#22c55e', lineWidth = 4, fillStyle } = style;
  const [p0, p1, p2, p3] = quad.points;
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Coins plus visibles
  const r = Math.max(5, lineWidth + 2);
  for (const [x, y] of quad.points) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = strokeStyle;
    ctx.fill();
  }
}
