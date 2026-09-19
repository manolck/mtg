/**
 * Localisation carte par blob sombre (ratio ~63/88) — port navigateur du live-webcam-server.
 */

export interface CardCropBox {
  left: number;
  top: number;
  width: number;
  height: number;
  score: number;
}

export interface AdaptiveCropResult {
  canvas: HTMLCanvasElement;
  box: CardCropBox | null;
  dataUrl: string;
}

function findCardBBox(
  data: Uint8ClampedArray | Uint8Array,
  detW: number,
  detH: number,
  thr: number
): { minX: number; maxX: number; minY: number; maxY: number; score: number } | null {
  const visited = new Uint8Array(detW * detH);
  const targetRatio = 63 / 88;
  let best: { minX: number; maxX: number; minY: number; maxY: number; score: number } | null =
    null;

  for (let y = 0; y < detH; y++) {
    for (let x = 0; x < detW; x++) {
      const start = y * detW + x;
      if (visited[start] || data[start] >= thr) continue;

      const stack = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length) {
        const idx = stack.pop()!;
        const cx = idx % detW;
        const cy = (idx / detW) | 0;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const n of [idx - 1, idx + 1, idx - detW, idx + detW]) {
          if (n < 0 || n >= visited.length) continue;
          const nx = n % detW;
          const ny = (n / detW) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (visited[n] || data[n] >= thr) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }

      if (count < 600) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < 35 || bh < 50) continue;
      const ratio = bw / bh;
      const ratioScore = 1 - Math.min(1, Math.abs(ratio - targetRatio) / 0.4);
      if (ratioScore < 0.15) continue;
      const fill = count / (bw * bh);
      if (fill < 0.25) continue;
      const areaFrac = (bw * bh) / (detW * detH);
      if (areaFrac < 0.04 || areaFrac > 0.9) continue;
      const sizeScore =
        areaFrac < 0.15 ? areaFrac / 0.15 : areaFrac > 0.7 ? (1 - areaFrac) / 0.3 : 1;
      const score = ratioScore * 0.5 + fill * 0.25 + sizeScore * 0.25;
      if (!best || score > best.score) best = { minX, maxX, minY, maxY, score };
    }
  }
  return best;
}

function toGrayData(source: HTMLCanvasElement, detW: number, detH: number): {
  data: Uint8Array;
  mean: number;
} {
  const tmp = document.createElement('canvas');
  tmp.width = detW;
  tmp.height = detH;
  const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, detW, detH);
  const { data: rgba } = ctx.getImageData(0, 0, detW, detH);
  const data = new Uint8Array(detW * detH);
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const g = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    data[p] = g;
    sum += g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  // normalize-ish
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(((data[i] - min) / range) * 255);
  }
  return { data, mean: sum / data.length };
}

/**
 * Localise la carte dans le frame webcam et renvoie un canvas normalisé 350×490.
 */
export function adaptiveCropCard(
  source: HTMLCanvasElement,
  outW = 350,
  outH = 490
): AdaptiveCropResult {
  const w = source.width;
  const h = source.height;
  const detW = 480;
  const detH = Math.max(1, Math.round((h / w) * detW));
  const { data, mean } = toGrayData(source, detW, detH);

  const thresholds = [
    Math.min(110, Math.max(50, mean * 0.55)),
    Math.min(95, Math.max(40, mean * 0.45)),
  ];

  let best: ReturnType<typeof findCardBBox> = null;
  for (const thr of thresholds) {
    const box = findCardBBox(data, detW, detH, thr);
    if (box && (!best || box.score > best.score)) best = box;
    if (best && best.score >= 0.85) break;
  }

  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;
  let score = 0;

  if (best) {
    ({ minX, maxX, minY, maxY } = best);
    score = best.score;
  } else {
    const thr = Math.min(110, Math.max(50, mean * 0.55));
    const rowDark = new Array(detH).fill(0);
    const colDark = new Array(detW).fill(0);
    for (let y = 0; y < detH; y++) {
      for (let x = 0; x < detW; x++) {
        if (data[y * detW + x] < thr) {
          rowDark[y]++;
          colDark[x]++;
        }
      }
    }
    const rowMin = Math.floor(detW * 0.12);
    const colMin = Math.floor(detH * 0.12);
    minY = 0;
    maxY = detH - 1;
    minX = 0;
    maxX = detW - 1;
    while (minY < detH && rowDark[minY] < rowMin) minY++;
    while (maxY > minY && rowDark[maxY] < rowMin) maxY--;
    while (minX < detW && colDark[minX] < colMin) minX++;
    while (maxX > minX && colDark[maxX] < colMin) maxX--;
  }

  let bw = maxX - minX + 1;
  let bh = maxY - minY + 1;
  const sx = w / detW;
  const sy = h / detH;

  if (bw < 40 || bh < 55) {
    const width = Math.floor(w * 0.55);
    const height = Math.floor(width / (63 / 88));
    const left = Math.floor((w - width) / 2);
    const top = Math.floor((h - height) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      source,
      Math.max(0, left),
      Math.max(0, top),
      Math.min(w, width),
      Math.min(h, height),
      0,
      0,
      outW,
      outH
    );
    return {
      canvas,
      box: null,
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    };
  }

  const expandX = Math.max(8, Math.floor(bw * 0.08));
  const expandY = Math.max(10, Math.floor(bh * 0.06));
  minX = Math.max(0, minX - expandX);
  maxX = Math.min(detW - 1, maxX + expandX);
  minY = Math.max(0, minY - expandY);
  maxY = Math.min(detH - 1, maxY + expandY);
  bw = maxX - minX + 1;
  bh = maxY - minY + 1;

  const targetRatio = 63 / 88;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let finalW = bw;
  let finalH = bh;
  const curRatio = bw / bh;
  if (curRatio > targetRatio) {
    finalH = Math.round(bw / targetRatio);
  } else {
    finalW = Math.round(bh * targetRatio);
  }
  let left = Math.round(cx - finalW / 2);
  let top = Math.round(cy - finalH / 2);
  left = Math.max(0, Math.min(detW - finalW, left));
  top = Math.max(0, Math.min(detH - finalH, top));
  finalW = Math.min(finalW, detW - left);
  finalH = Math.min(finalH, detH - top);

  const srcLeft = Math.floor(left * sx);
  const srcTop = Math.floor(top * sy);
  const srcW = Math.max(1, Math.floor(finalW * sx));
  const srcH = Math.max(1, Math.floor(finalH * sy));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, srcLeft, srcTop, srcW, srcH, 0, 0, outW, outH);

  return {
    canvas,
    box: { left: srcLeft, top: srcTop, width: srcW, height: srcH, score },
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
  };
}
