/**
 * Benchmark OCR webcam : photos de cartes sur papier quadrillé.
 * 1) Détecte/crop la carte (fond clair)
 * 2) OCR zone titre + matching dictionnaire
 *
 * Usage: node scripts/scan-ocr-webcam-benchmark.mjs [--runs=10]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixturesDir = path.join(root, 'test-fixtures', 'scan-cards-webcam');
const dictPath = path.join(root, 'public', 'scryfall-card-dictionary.json');
const debugDir = path.join(fixturesDir, 'debug');

const CARD_NAME_REGION = { x: 0.04, y: 0.02, width: 0.74, height: 0.1 };
const MIN_HEIGHT_FOR_OCR = 180;

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

function normalizeAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanOcrKey(s) {
  return (s ?? '')
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindowInt = Math.max(0, Math.floor(Math.max(len1, len2) / 2 - 1));
  const s1Match = new Array(len1).fill(false);
  const s2Match = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindowInt);
    const end = Math.min(i + matchWindowInt + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Match[j] || s1[i] !== s2[j]) continue;
      s1Match[i] = true;
      s2Match[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Match[i]) continue;
    while (!s2Match[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return Math.min(1, jaro + prefixLen * 0.1 * (1 - jaro));
}

function tokenize(s) {
  return normalizeAccents(s.toLowerCase())
    .split(/[\s'\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreNameMatch(ocrText, cardName, lang) {
  const ocr = cleanOcrKey(ocrText);
  if (!ocr || !cardName) return 0;
  const oNorm = normalizeAccents(ocr.toLowerCase());
  const nNorm = normalizeAccents(cardName.toLowerCase());
  if (oNorm === nNorm) return 1;

  const jw = Math.max(
    jaroWinkler(oNorm, nNorm),
    jaroWinkler(ocr.toLowerCase(), cardName.toLowerCase())
  );

  const oTokens = tokenize(ocr);
  const nTokens = tokenize(cardName);
  let tokenHits = 0;
  const significantO = oTokens.filter((t) => t.length >= 3);
  for (const ot of significantO) {
    const hit = nTokens.some(
      (nt) =>
        nt === ot ||
        (ot.length >= 4 && (nt.includes(ot) || ot.includes(nt))) ||
        jaroWinkler(ot, nt) >= 0.88
    );
    if (hit) tokenHits++;
  }
  const tokenDenom = Math.max(
    significantO.length,
    nTokens.filter((t) => t.length >= 3).length,
    1
  );
  const tokenScore = tokenHits / tokenDenom;
  const lenRatio =
    Math.min(oNorm.length, nNorm.length) / Math.max(oNorm.length, nNorm.length, 1);
  const wordCountPenalty =
    oTokens.length >= 3 && nTokens.length === 1 && tokenScore < 0.5 ? 0.15 : 0;

  let score = 0.4 * jw + 0.5 * tokenScore + 0.1 * lenRatio - wordCountPenalty;
  if (
    lang === 'fr' &&
    (/[àâäéèêëïîôùûüçœæ]/i.test(ocr) || /\b(des|de|la|le|du)\b/i.test(ocr))
  ) {
    score += 0.03;
  }

  const ocrHasA = /\bà\b/i.test(ocr) || /(^|\s)a(\s|$)/i.test(normalizeAccents(ocr));
  const nameHasA = /\bà\b/i.test(cardName);
  if (ocrHasA && nameHasA) score += 0.1;
  if (ocrHasA && !nameHasA) score -= 0.1;

  let containmentBonus = 0;
  for (const ot of significantO) {
    if (ot.length < 4) continue;
    for (const nt of nTokens) {
      if (nt.length > ot.length && nt.includes(ot)) {
        containmentBonus = Math.max(containmentBonus, 0.08 * (ot.length / nt.length));
      }
    }
  }
  score += containmentBonus;
  return Math.max(0, Math.min(1, score));
}

function loadDictionary() {
  const raw = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const byLength = new Map();
  for (let i = 0; i < raw.length; i++) {
    const len = (raw[i].name ?? '').length;
    if (!byLength.has(len)) byLength.set(len, []);
    byLength.get(len).push(i);
  }
  return { entries: raw, byLength };
}

function getCandidateIndices(byLength, keyLen, wordCount) {
  let minLen;
  let maxLen;
  if (keyLen <= 6) {
    minLen = 0;
    maxLen = Math.min(60, keyLen + 25);
  } else {
    const maxLenDiff = Math.max(12, Math.floor(keyLen * 0.7));
    minLen = Math.max(0, keyLen - maxLenDiff);
    maxLen = keyLen + maxLenDiff + (wordCount >= 3 ? 10 : 0);
  }
  const indices = [];
  for (let len = minLen; len <= maxLen; len++) {
    const bucket = byLength.get(len);
    if (bucket) indices.push(...bucket);
  }
  return indices;
}

function resolveOcrToDictionary(ocrText, entries, byLength) {
  const key = cleanOcrKey(ocrText ?? '');
  if (!key || key.length < 2) return null;
  const keyLower = key.toLowerCase();
  const keyNorm = normalizeAccents(keyLower);
  const wordCount = tokenize(key).length;

  for (const e of entries) {
    if (!e.name) continue;
    const nameLower = e.name.toLowerCase();
    if (nameLower === keyLower || normalizeAccents(nameLower) === keyNorm) return e;
  }

  const candidateIndices = getCandidateIndices(byLength, key.length, wordCount);
  let best = null;
  for (const i of candidateIndices) {
    const e = entries[i];
    if (!e.name) continue;
    const score = scoreNameMatch(key, e.name, e.lang);
    if (!best || score > best.score) best = { entry: e, score };
  }
  return best ? best.entry : null;
}

function resolveBestOf(candidates, entries, byLength) {
  let globalBest = null;
  const cleaned = [...new Set(candidates.map(cleanOcrKey).filter((c) => c.length >= 2))];
  for (const ocrText of cleaned) {
    const entry = resolveOcrToDictionary(ocrText, entries, byLength);
    if (!entry) continue;
    const score = scoreNameMatch(ocrText, entry.name, entry.lang);
    if (!globalBest || score > globalBest.score) globalBest = { entry, score };
  }
  return globalBest ? globalBest.entry : null;
}

/**
 * Détecte la carte sombre sur fond clair (papier) via bbox des pixels sombres.
 */
async function cropCardFromWebcam(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const w = meta.width;
  const h = meta.height;

  // Downscale for detection
  const detW = 320;
  const detH = Math.round((h / w) * detW);
  const { data } = await sharp(imagePath)
    .resize(detW, detH)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Adaptive threshold: paper is bright, card border is dark
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  const thr = Math.min(120, Math.max(60, mean * 0.55));

  let minX = detW;
  let minY = detH;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < detH; y++) {
    for (let x = 0; x < detW; x++) {
      const v = data[y * detW + x];
      if (v < thr) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback: center crop if detection failed
  const scaleX = w / detW;
  const scaleY = h / detH;
  let left;
  let top;
  let width;
  let height;
  const areaRatio = count / (detW * detH);
  if (count < 500 || areaRatio < 0.05 || maxX <= minX || maxY <= minY) {
    width = Math.floor(w * 0.72);
    height = Math.floor(h * 0.9);
    left = Math.floor((w - width) / 2);
    top = Math.floor((h - height) / 2);
  } else {
    // Expand slightly then map to full res
    const pad = 4;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(detW - 1, maxX + pad);
    maxY = Math.min(detH - 1, maxY + pad);
    left = Math.floor(minX * scaleX);
    top = Math.floor(minY * scaleY);
    width = Math.max(1, Math.floor((maxX - minX + 1) * scaleX));
    height = Math.max(1, Math.floor((maxY - minY + 1) * scaleY));
    // Clamp
    if (left + width > w) width = w - left;
    if (top + height > h) height = h - top;
  }

  const buf = await sharp(imagePath)
    .extract({ left, top, width, height })
    .resize({ width: 500, height: 700, fit: 'inside' })
    .png()
    .toBuffer();

  return buf;
}

async function preprocessBuffer(pngBuffer, forceInvert, binarize = false) {
  const meta = await sharp(pngBuffer).metadata();
  const scale =
    meta.height < MIN_HEIGHT_FOR_OCR
      ? MIN_HEIGHT_FOR_OCR / meta.height
      : Math.max(1, 140 / meta.height);
  const outW = Math.round(meta.width * scale);
  const outH = Math.round(meta.height * scale);

  const { data, info } = await sharp(pngBuffer)
    .resize(outW, outH)
    .normalize()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = data.length ? sum / data.length : 128;
  const invert = forceInvert !== undefined ? forceInvert : mean < 140;

  const sorted = Uint8Array.from(data).sort((a, b) => a - b);
  const thresholdSrc = sorted[Math.floor(sorted.length * 0.4)] ?? 128;

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    let v = data[i];
    if (invert) v = 255 - v;
    else v = Math.min(255, Math.max(0, (v - 128) * 1.5 + 128));
    if (binarize) {
      const thr = invert ? 255 - thresholdSrc : Math.min(thresholdSrc + 25, 195);
      v = v < thr ? 0 : 255;
    }
    out[i] = v;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

async function cropNameRegionFromCard(cardPngBuffer) {
  const meta = await sharp(cardPngBuffer).metadata();
  const w = meta.width;
  const h = meta.height;
  const left = Math.floor(CARD_NAME_REGION.x * w);
  const top = Math.floor(CARD_NAME_REGION.y * h);
  const width = Math.max(1, Math.floor(CARD_NAME_REGION.width * w));
  const height = Math.max(1, Math.floor(CARD_NAME_REGION.height * h));
  return sharp(cardPngBuffer).extract({ left, top, width, height }).png().toBuffer();
}

async function ocrCardBuffer(worker, cardPngBuffer) {
  const cropped = await cropNameRegionFromCard(cardPngBuffer);
  const variants = await Promise.all([
    preprocessBuffer(cropped, false, false),
    preprocessBuffer(cropped, true, false),
    preprocessBuffer(cropped, false, true),
    preprocessBuffer(cropped, true, true),
  ]);

  const scored = [];
  for (const psm of ['6', '7']) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const results = await Promise.all(variants.map((buf) => worker.recognize(buf)));
    for (const r of results) {
      const text = cleanOcrKey(r.data?.text ?? '');
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
    confAuto: scored[0]?.confidence ?? 0,
    confInverted: scored[1]?.confidence ?? 0,
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
  const { entries, byLength } = loadDictionary();
  for (const c of CARDS) {
    const hit = entries.find((e) => e.name === c.expected);
    console.log(`  dict ${c.expected}: ${hit ? `OK (${hit.lang})` : 'MISSING'}`);
  }

  console.log('Creating Tesseract worker...');
  const worker = await createWorker('eng+fra', 1, { logger: () => {} });

  let consecutivePerfect = 0;
  let bestStreak = 0;

  try {
    for (let run = 1; run <= runs; run++) {
      console.log(`\n=== RUN ${run}/${runs} ===`);
      let ok = 0;

      for (const card of CARDS) {
        const imagePath = path.join(fixturesDir, card.file);
        if (!fs.existsSync(imagePath)) {
          console.log(`✗ ${card.expected} → FILE MISSING`);
          consecutivePerfect = 0;
          continue;
        }

        const cardBuf = await cropCardFromWebcam(imagePath);
        if (run === 1) {
          await sharp(cardBuf).toFile(path.join(debugDir, `crop-${card.file}`));
          const nameCrop = await cropNameRegionFromCard(cardBuf);
          await sharp(nameCrop).toFile(path.join(debugDir, `name-${card.file}`));
        }

        const ocr = await ocrCardBuffer(worker, cardBuf);
        const resolved = resolveBestOf(
          [ocr.textAuto, ocr.textInverted, ocr.text].filter(Boolean),
          entries,
          byLength
        );
        const got = resolved?.name ?? '(null)';
        const pass = namesEqual(got, card.expected);
        if (pass) ok++;
        else consecutivePerfect = -1; // mark broken this run

        console.log(
          `${pass ? '✓' : '✗'} ${card.expected} → ${got} | OCR: "${ocr.textAuto}" / "${ocr.textInverted}" (${ocr.confAuto.toFixed(0)}/${ocr.confInverted.toFixed(0)})`
        );
        if (!pass) {
          console.log(
            `    score expected=${scoreNameMatch(ocr.textAuto || ocr.text, card.expected, 'fr').toFixed(3)} got=${scoreNameMatch(ocr.textAuto || ocr.text, got, 'fr').toFixed(3)}`
          );
        }
      }

      const perfect = ok === CARDS.length;
      if (perfect) {
        if (consecutivePerfect < 0) consecutivePerfect = 0;
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
  process.exit(bestStreak >= runs && consecutivePerfect >= runs ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
