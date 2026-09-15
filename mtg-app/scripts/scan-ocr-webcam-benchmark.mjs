/**
 * Benchmark OCR webcam — photos floues sur papier quadrillé.
 * Usage: node scripts/scan-ocr-webcam-benchmark.mjs [--runs=10]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import {
  cleanOcrKey,
  normalizeAccents,
  resolveBestOf,
  scoreNameMatch,
} from './ocr-match-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixturesDir = path.join(root, 'test-fixtures', 'scan-cards-webcam');
const dictPath = path.join(root, 'public', 'scryfall-card-dictionary.json');
const debugDir = path.join(fixturesDir, 'debug');

const NAME_REGIONS = [
  { x: 0.05, y: 0.02, width: 0.72, height: 0.09 },
  { x: 0.04, y: 0.03, width: 0.78, height: 0.1 },
  { x: 0.06, y: 0.035, width: 0.7, height: 0.08 },
  { x: 0.03, y: 0.015, width: 0.82, height: 0.13 },
];

const CARDS = [
  { file: '01-obscure-faveur.png', expected: 'Obscure faveur' },
  { file: '02-ombre-dailenuit.png', expected: "Ombre d'ailenuit" },
  { file: '03-rodeur-de-manteaubrune.png', expected: 'Rôdeur de Manteaubrune' },
  { file: '04-horrible-decouverte.png', expected: 'Horrible découverte' },
  { file: '05-goule-patricienne.png', expected: 'Goule patricienne' },
  { file: '06-ombre-de-la-nuit-perenne.png', expected: 'Ombre de la nuit pérenne' },
  { file: '07-negociants-en-cadavres.png', expected: 'Négociants en cadavres' },
  { file: '08-faconneur-de-peste.png', expected: 'Façonneur de peste' },
];

function letterScore(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const words = text.split(/\s+/).filter((w) => /[\p{L}]{3,}/u.test(w)).length;
  return letters + words * 4;
}

/** Crop the dark card from light graph paper; prefer card-like aspect ratio. */
async function cropCardFromWebcam(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const w = meta.width;
  const h = meta.height;
  const detW = 420;
  const detH = Math.round((h / w) * detW);
  const { data } = await sharp(imagePath)
    .resize(detW, detH)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  // Card is darker than paper; threshold relative to mean
  const thr = Math.min(130, Math.max(60, mean * 0.72));

  let minX = detW;
  let minY = detH;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < detH; y++) {
    for (let x = 0; x < detW; x++) {
      if (data[y * detW + x] < thr) {
        count++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const sx = w / detW;
  const sy = h / detH;
  let left;
  let top;
  let width;
  let height;

  if (count < 500 || maxX <= minX) {
    width = Math.floor(w * 0.7);
    height = Math.floor(h * 0.88);
    left = Math.floor((w - width) / 2);
    top = Math.floor((h - height) / 2);
  } else {
    // Shrink bbox to card-like ratio (~0.716) if blob is too square (includes paper shadow)
    let bw = maxX - minX + 1;
    let bh = maxY - minY + 1;
    const targetRatio = 63 / 88;
    const ratio = bw / bh;
    if (ratio > targetRatio * 1.15) {
      const newW = Math.floor(bh * targetRatio);
      const cx = (minX + maxX) / 2;
      minX = Math.floor(cx - newW / 2);
      maxX = Math.floor(cx + newW / 2);
      bw = maxX - minX + 1;
    } else if (ratio < targetRatio * 0.75) {
      const newH = Math.floor(bw / targetRatio);
      const cy = (minY + maxY) / 2;
      minY = Math.floor(cy - newH / 2);
      maxY = Math.floor(cy + newH / 2);
      bh = maxY - minY + 1;
    }
    const padX = Math.max(2, Math.floor(bw * 0.02));
    const padY = Math.max(2, Math.floor(bh * 0.02));
    left = Math.max(0, Math.floor((minX - padX) * sx));
    top = Math.max(0, Math.floor((minY - padY) * sy));
    width = Math.min(w - left, Math.ceil((bw + 2 * padX) * sx));
    height = Math.min(h - top, Math.ceil((bh + 2 * padY) * sy));
  }

  return sharp(imagePath)
    .extract({ left, top, width, height })
    .resize(700, 980, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function preprocessHard(buf) {
  return sharp(buf)
    .resize({ height: 400, fit: 'inside' })
    .normalize()
    .modulate({ brightness: 1.3 })
    .sharpen({ sigma: 2 })
    .greyscale()
    .linear(1.8, -40)
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

async function preprocessSoft(buf) {
  return sharp(buf)
    .resize({ height: 320, fit: 'inside' })
    .normalize()
    .greyscale()
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

async function preprocessEnhance(buf) {
  const { data, info } = await sharp(buf)
    .resize({ height: 360, fit: 'inside' })
    .normalize()
    .modulate({ brightness: 1.2 })
    .sharpen({ sigma: 1.5 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  const doInvert = mean < 115;
  const sorted = Uint8Array.from(data).sort((a, b) => a - b);
  const pLow = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const pHigh = sorted[Math.floor(sorted.length * 0.95)] ?? 255;
  const range = Math.max(1, pHigh - pLow);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    let v = ((data[i] - pLow) / range) * 255;
    v = Math.min(255, Math.max(0, (v - 128) * 1.7 + 128));
    if (doInvert) v = 255 - v;
    out[i] = v;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

async function ocrCrop(worker, cropBuf) {
  const variants = await Promise.all([
    preprocessHard(cropBuf),
    preprocessEnhance(cropBuf),
    preprocessSoft(cropBuf),
  ]);
  const texts = [];
  for (const psm of ['6', '7']) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    for (const v of variants) {
      const r = await worker.recognize(v);
      const text = cleanOcrKey(r.data?.text ?? '');
      if (text.length >= 2 && letterScore(text) >= 4) texts.push(text);
    }
  }
  return texts;
}

async function ocrCard(worker, cardBuf, frEntries) {
  const meta = await sharp(cardBuf).metadata();
  const candidates = [];
  const rotations = [0, 2, -2, 4, -4, 6, -6];

  for (const region of NAME_REGIONS) {
    const left = Math.floor(region.x * meta.width);
    const top = Math.floor(region.y * meta.height);
    const width = Math.max(8, Math.floor(region.width * meta.width));
    const height = Math.max(8, Math.floor(region.height * meta.height));
    if (left + width > meta.width || top + height > meta.height) continue;

    const baseCrop = await sharp(cardBuf)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();

    for (const rot of rotations) {
      // Rotate the name strip (not the full card) — matches successful hard-OCR combos
      const crop =
        rot === 0
          ? baseCrop
          : await sharp(baseCrop)
              .rotate(rot, { background: { r: 255, g: 255, b: 255 } })
              .png()
              .toBuffer();
      candidates.push(...(await ocrCrop(worker, crop)));
    }

    const best = resolveBestOf(candidates, frEntries);
    if (
      best &&
      best.score >= 0.98 &&
      (best.coverage ?? 0) >= 0.7 &&
      (best.ocr?.length ?? 0) >= 12
    ) {
      return { candidates: [...new Set(candidates)], resolved: best };
    }
  }

  return {
    candidates: [...new Set(candidates)],
    resolved: resolveBestOf(candidates, frEntries),
  };
}

function namesEqual(a, b) {
  return normalizeAccents((a ?? '').toLowerCase()) === normalizeAccents((b ?? '').toLowerCase());
}

async function main() {
  const runsArg = process.argv.find((a) => a.startsWith('--runs='));
  const runs = runsArg ? Number(runsArg.split('=')[1]) : 1;
  fs.mkdirSync(debugDir, { recursive: true });

  console.log('Loading dictionary...');
  const entries = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const frEntries = entries.filter((e) => e.lang === 'fr' && e.name);

  console.log('Creating Tesseract worker (fra)...');
  const worker = await createWorker('fra', 1, { logger: () => {} });

  let consecutivePerfect = 0;
  let bestStreak = 0;

  try {
    for (let run = 1; run <= runs; run++) {
      console.log(`\n=== RUN ${run}/${runs} ===`);
      let ok = 0;
      let runFailed = false;

      for (const card of CARDS) {
        const imagePath = path.join(fixturesDir, card.file);
        const cardBuf = await cropCardFromWebcam(imagePath);
        if (run === 1) {
          await sharp(cardBuf).toFile(path.join(debugDir, `crop-${card.file}`));
        }
        const { candidates, resolved } = await ocrCard(worker, cardBuf, frEntries);
        const got = resolved?.entry?.name ?? '(null)';
        const pass = namesEqual(got, card.expected);
        if (pass) ok++;
        else runFailed = true;
        const top = [...candidates].sort((a, b) => letterScore(b) - letterScore(a)).slice(0, 3);
        console.log(
          `${pass ? '✓' : '✗'} ${card.expected} → ${got} | OCR: ${top.map((c) => `"${c}"`).join(' / ')}`
        );
        if (!pass && top[0]) {
          console.log(
            `    score expected=${scoreNameMatch(top[0], card.expected, 'fr').toFixed(3)} got=${scoreNameMatch(top[0], got, 'fr').toFixed(3)} resolve=${resolved?.score?.toFixed(3) ?? 'n/a'} via="${resolved?.ocr ?? ''}"`
          );
        }
      }

      if (!runFailed && ok === CARDS.length) {
        consecutivePerfect++;
        bestStreak = Math.max(bestStreak, consecutivePerfect);
      } else {
        consecutivePerfect = 0;
      }
      console.log(
        `Score: ${ok}/${CARDS.length} | streak: ${consecutivePerfect} | best: ${bestStreak}`
      );
    }
  } finally {
    await worker.terminate();
  }

  console.log(`\nBest consecutive perfect streak: ${bestStreak}/${runs}`);
  process.exit(bestStreak >= runs ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
