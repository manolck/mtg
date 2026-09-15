/**
 * Bench RapidOCR + matching (même stratégie que live-webcam-server).
 * Prérequis: python scripts/rapidocr_sidecar.py
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { cleanOcrKey, resolveBestOf, buildMatchIndex } from './ocr-match-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dictPath = path.join(root, 'public', 'scryfall-card-dictionary.json');
const RAPIDOCR_URL = process.env.RAPIDOCR_URL || 'http://127.0.0.1:5201';

const CASES = [
  { file: 'test-fixtures/live-webcam/crop-retry-faconneur.png', expect: 'Façonneur de peste' },
  { file: 'test-fixtures/live-webcam/crop-goule-v2.png', expect: 'Goule patricienne' },
  { file: 'test-fixtures/live-webcam/crop-1789465670980.png', expect: 'Horrible découverte' },
  { file: 'test-fixtures/live-webcam/crop-1789465847326.png', expect: 'Essaim de krauls' },
  { file: 'test-fixtures/live-webcam/crop-1789465616459.png', expect: 'Goule patricienne' },
  { file: 'test-fixtures/scan-cards-webcam/01-obscure-faveur.png', expect: 'Obscure faveur' },
  { file: 'test-fixtures/scan-cards-webcam/02-ombre-dailenuit.png', expect: "Ombre d'Ailenuit" },
  { file: 'test-fixtures/scan-cards-webcam/03-rodeur-de-manteaubrune.png', expect: 'Rôdeur de Manteaubrune' },
  { file: 'test-fixtures/scan-cards-webcam/04-horrible-decouverte.png', expect: 'Horrible découverte' },
  { file: 'test-fixtures/scan-cards-webcam/05-goule-patricienne.png', expect: 'Goule patricienne' },
  { file: 'test-fixtures/scan-cards-webcam/06-ombre-de-la-nuit-perenne.png', expect: 'Ombre de la nuit pérenne' },
  { file: 'test-fixtures/scan-cards-webcam/07-negociants-en-cadavres.png', expect: 'Négociants en cadavres' },
  { file: 'test-fixtures/scan-cards-webcam/08-faconneur-de-peste.png', expect: 'Façonneur de peste' },
];

async function rapidOcr(buf) {
  const res = await fetch(`${RAPIDOCR_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function letterScore(text) {
  return [...text].filter((c) => /\p{L}/u.test(c)).length;
}

async function candidatesFromCrop(cardBuf, entries) {
  const set = new Set();
  const add = (t) => {
    const c = cleanOcrKey(t ?? '');
    if (c.length >= 4 && letterScore(c) >= 6) set.add(c);
  };
  const strong = () => {
    const r = resolveBestOf([...set], entries);
    if (!r || r.score < 0.98 || (r.coverage ?? 0) < 0.6) return false;
    const o = (r.ocr || '').toLowerCase();
    if (
      /\b(creature|cr[eé]ature|humain|gredin|zombie|guerrier|shamane)\b/.test(o) &&
      !/\b(de|des|d'|the|of)\b/.test(o)
    ) {
      return false;
    }
    return true;
  };

  const meta = await sharp(cardBuf).metadata();
  const region = { x: 0.04, y: 0.015, width: 0.8, height: 0.12 };
  const left = Math.floor(region.x * meta.width);
  const top = Math.floor(region.y * meta.height);
  const width = Math.max(8, Math.floor(region.width * meta.width));
  const height = Math.max(8, Math.floor(region.height * meta.height));
  if (left + width <= meta.width && top + height <= meta.height) {
    const crop = await sharp(cardBuf)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    const r = await rapidOcr(crop);
    for (const t of r.name_texts?.length ? r.name_texts : r.texts || []) add(t);
    if (r.name_joined) add(r.name_joined);
    else if (r.joined) add(r.joined);
    if (meta.height >= 500 && strong()) return [...set];
  }

  const fullPng =
    cardBuf[0] === 0x89 && cardBuf[1] === 0x50
      ? cardBuf
      : await sharp(cardBuf).png().toBuffer();
  const full = await rapidOcr(fullPng);
  const nameTexts = full.name_texts?.length ? full.name_texts : (full.texts || []).slice(0, 1);
  for (const t of nameTexts) add(t);
  if (nameTexts.length >= 2) add(nameTexts.slice(0, 2).join(' '));
  if (full.name_joined) add(full.name_joined);
  return [...set];
}

async function main() {
  const health = await fetch(`${RAPIDOCR_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`RapidOCR sidecar down: ${RAPIDOCR_URL}`);
    process.exit(1);
  }
  const entries = JSON.parse(fs.readFileSync(dictPath, 'utf8')).filter(
    (e) => (e.lang === 'fr' || e.lang === 'en') && e.name
  );
  buildMatchIndex(entries);

  let ok = 0;
  let totalMs = 0;
  const present = CASES.filter((c) => fs.existsSync(path.join(root, c.file)));
  for (const c of present) {
    const buf = fs.readFileSync(path.join(root, c.file));
    const t0 = Date.now();
    const cands = await candidatesFromCrop(buf, entries);
    const resolved = resolveBestOf(cands, entries);
    const ms = Date.now() - t0;
    totalMs += ms;
    const name = resolved?.entry?.name ?? null;
    const hit =
      name && name.localeCompare(c.expect, 'fr', { sensitivity: 'accent' }) === 0;
    if (hit) ok++;
    console.log(
      `${hit ? 'OK' : 'KO'}  expect="${c.expect}"  got="${name}"  score=${(resolved?.score ?? 0).toFixed(3)}  ${ms}ms`
    );
    console.log(`     OCR: ${cands.slice(0, 4).map((t) => `"${t}"`).join(' / ')}`);
  }
  console.log(`\n${ok}/${present.length} OK  avg ${(totalMs / present.length).toFixed(0)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
