#!/usr/bin/env node
/**
 * Build compact Scryfall indexes for the Python scan sidecar.
 *
 * Outputs:
 *   public/scan-indexes/prints.json  — map "set|cn" → [{ oracle_id, lang, name, printed_name, scryfall_id }]
 *   public/scan-indexes/names.json   — map normalized FR/EN name → [{ oracle_id, lang, name, printed_name, scryfall_id?, set?, cn? }]
 *
 * Input (first match):
 *   1. CLI arg path to all-cards / default-cards (.json array or .jsonl / .jsonl.gz)
 *   2. Local all-cards-*.json(l)(.gz) or default-cards-* in project root
 *   3. Download Scryfall bulk JSONL.gz (default_cards; use --all for all_cards FR+EN)
 *   4. --names-only: names from public/scryfall-card-dictionary.json (prints empty)
 *
 * Usage:
 *   npm run build-scan-indexes
 *   npm run build-scan-indexes -- --download
 *   npm run build-scan-indexes -- --download --all
 *   npm run build-scan-indexes -- --names-only
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chain } = require('stream-chain');
const streamJson = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'public', 'scan-indexes');
const LANGS = new Set(['en', 'fr']);

function normalizeNameKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    namesOnly: args.includes('--names-only'),
    forceDownload: args.includes('--download'),
    useAllCards: args.includes('--all'),
    input: args.find((a) => !a.startsWith('--')) || null,
  };
}

function findLocalBulk() {
  const dir = fs.readdirSync(projectRoot);
  const prefer = [
    ...dir.filter((f) => /^default-cards-.*\.(jsonl\.gz|jsonl|json)$/i.test(f)),
    ...dir.filter((f) => /^all-cards-.*\.(jsonl\.gz|jsonl|json)$/i.test(f)),
  ];
  return prefer.length ? path.join(projectRoot, prefer[0]) : null;
}

async function resolveBulkDownloadUri(useAllCards) {
  const res = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { Accept: 'application/json', 'User-Agent': 'MTGCollectionApp/1.0' },
  });
  if (!res.ok) throw new Error(`Scryfall bulk-data HTTP ${res.status}`);
  const data = await res.json();
  const want = useAllCards ? 'all_cards' : 'default_cards';
  const entry =
    (data.data || []).find((d) => d.type === want) ||
    (data.data || []).find((d) => d.type === 'default_cards') ||
    (data.data || []).find((d) => d.type === 'all_cards');
  const uri = entry?.jsonl_download_uri || entry?.download_uri;
  if (!uri) throw new Error('No bulk download URI (jsonl_download_uri / download_uri)');
  return {
    uri,
    type: entry.type,
    size: entry.compressed_size || entry.size || 0,
  };
}

async function downloadBulk(uri, destPath) {
  console.log('Downloading Scryfall bulk…');
  console.log('  URI:', uri);
  console.log('  →', destPath);
  const res = await fetch(uri, {
    headers: { 'User-Agent': 'MTGCollectionApp/1.0' },
  });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const out = createWriteStream(destPath);
  let received = 0;
  let lastLog = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    received += chunk.length;
    const now = Date.now();
    if (now - lastLog > 2000) {
      lastLog = now;
      const pct = total ? ((100 * received) / total).toFixed(1) : '?';
      console.log(`  … ${(received / 1e6).toFixed(1)} MB (${pct}%)`);
    }
  });
  await pipeline(body, out);
  console.log('Download complete:', (received / 1e6).toFixed(1), 'MB');
}

function pushMap(map, key, entry) {
  if (!key) return;
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  const id = entry.scryfall_id || `${entry.oracle_id}|${entry.lang}|${entry.name}`;
  if (arr.some((e) => (e.scryfall_id || `${e.oracle_id}|${e.lang}|${e.name}`) === id)) return;
  arr.push(entry);
  if (arr.length > 12) arr.length = 12;
}

function ingestCard(value, prints, names) {
  if (!value || typeof value !== 'object') return false;
  const lang = value.lang;
  if (!LANGS.has(lang)) return false;
  const oracleId = value.oracle_id;
  const set = (value.set || '').toLowerCase();
  const cn = String(value.collector_number || '').trim();
  const name = (value.name || '').trim();
  const printed =
    value.printed_name && String(value.printed_name).trim()
      ? String(value.printed_name).trim()
      : name;
  const scryfallId = value.id || null;
  if (!oracleId || !name) return false;
  const entry = {
    oracle_id: oracleId,
    lang,
    name,
    printed_name: printed,
    scryfall_id: scryfallId,
    set: set || undefined,
    cn: cn || undefined,
  };
  if (set && cn) {
    pushMap(prints, `${set}|${cn}`, entry);
  }
  for (const label of [name, printed]) {
    const key = normalizeNameKey(label);
    if (key.length >= 2) pushMap(names, key, entry);
    const base = label.split(/\s*\/\/\s*/)[0].trim();
    if (base && base !== label) {
      const bk = normalizeNameKey(base);
      if (bk.length >= 2) pushMap(names, bk, entry);
    }
  }
  return true;
}

async function buildFromJsonl(inputPath) {
  const prints = new Map();
  const names = new Map();
  let processed = 0;
  let kept = 0;

  console.log('Streaming JSONL:', inputPath);
  const isGz = /\.gz$/i.test(inputPath);
  let input = createReadStream(inputPath);
  if (isGz) input = input.pipe(zlib.createGunzip());

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    processed++;
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (ingestCard(value, prints, names)) kept++;
    if (processed % 100000 === 0) {
      console.log(`  processed ${processed} lines, kept ${kept} en/fr…`);
    }
  }
  return { prints, names, processed, kept };
}

async function buildFromJsonArray(inputPath) {
  const prints = new Map();
  const names = new Map();
  let processed = 0;
  let kept = 0;

  console.log('Streaming JSON array:', inputPath);
  await new Promise((resolve, reject) => {
    const pipeline = chain([createReadStream(inputPath), streamJson.parser(), streamArray()]);
    pipeline.on('data', ({ value }) => {
      processed++;
      if (ingestCard(value, prints, names)) kept++;
      if (processed % 100000 === 0) {
        console.log(`  processed ${processed} cards, kept ${kept} en/fr…`);
      }
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });
  return { prints, names, processed, kept };
}

async function buildFromBulk(inputPath) {
  if (/\.jsonl(\.gz)?$/i.test(inputPath)) return buildFromJsonl(inputPath);
  return buildFromJsonArray(inputPath);
}

async function buildNamesFromDictionary() {
  const dictPath = path.join(projectRoot, 'public', 'scryfall-card-dictionary.json');
  if (!fs.existsSync(dictPath)) {
    throw new Error(`Dictionary not found: ${dictPath}`);
  }
  console.log('Building names from dictionary:', dictPath);
  const raw = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const names = new Map();
  let kept = 0;
  for (const row of raw) {
    if (!row || !LANGS.has(row.lang) || !row.name || !row.oracle_id) continue;
    kept++;
    const entry = {
      oracle_id: row.oracle_id,
      lang: row.lang,
      name: row.name,
      printed_name: row.name,
      scryfall_id: null,
    };
    const key = normalizeNameKey(row.name);
    if (key.length >= 2) pushMap(names, key, entry);
    const base = row.name.split(/\s*\/\/\s*/)[0].trim();
    if (base && base !== row.name) {
      const bk = normalizeNameKey(base);
      if (bk.length >= 2) pushMap(names, bk, entry);
    }
  }
  console.log(`  names entries from dict: ${kept} → ${names.size} keys`);
  return { prints: new Map(), names, processed: raw.length, kept };
}

/** Merge FR names from dictionary into names map (when bulk is EN-only default_cards). */
async function mergeDictionaryNames(names) {
  const dictPath = path.join(projectRoot, 'public', 'scryfall-card-dictionary.json');
  if (!fs.existsSync(dictPath)) return;
  console.log('Merging FR/EN names from dictionary…');
  const raw = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  let added = 0;
  for (const row of raw) {
    if (!row || !LANGS.has(row.lang) || !row.name || !row.oracle_id) continue;
    const before = names.get(normalizeNameKey(row.name))?.length || 0;
    pushMap(names, normalizeNameKey(row.name), {
      oracle_id: row.oracle_id,
      lang: row.lang,
      name: row.name,
      printed_name: row.name,
      scryfall_id: null,
    });
    const after = names.get(normalizeNameKey(row.name))?.length || 0;
    if (after > before) added++;
  }
  console.log(`  dictionary merge: ~${added} name keys touched`);
}

function mapToObject(map) {
  const obj = Object.create(null);
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  const mb = (fs.statSync(filePath).size / 1e6).toFixed(2);
  console.log(`Wrote ${filePath} (${mb} MB)`);
}

async function main() {
  const { namesOnly, forceDownload, useAllCards, input } = parseArgs();
  fs.mkdirSync(outDir, { recursive: true });

  let prints;
  let names;
  let stats;

  if (namesOnly) {
    stats = await buildNamesFromDictionary();
    prints = stats.prints;
    names = stats.names;
  } else {
    let inputPath = input
      ? path.isAbsolute(input)
        ? input
        : path.join(projectRoot, input)
      : findLocalBulk();

    if ((!inputPath || !fs.existsSync(inputPath)) || forceDownload) {
      if (forceDownload || !inputPath || !fs.existsSync(inputPath)) {
        const { uri, type } = await resolveBulkDownloadUri(useAllCards);
        const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const ext = uri.endsWith('.gz') ? '.jsonl.gz' : uri.includes('.jsonl') ? '.jsonl' : '.json';
        inputPath = path.join(projectRoot, `${type.replace(/_/g, '-')}-${stamp}${ext}`);
        await downloadBulk(uri, inputPath);
      }
    }

    if (!inputPath || !fs.existsSync(inputPath)) {
      console.warn('No bulk file found — falling back to --names-only from dictionary.');
      console.warn('Re-run: npm run build-scan-indexes -- --download');
      stats = await buildNamesFromDictionary();
      prints = stats.prints;
      names = stats.names;
    } else {
      stats = await buildFromBulk(inputPath);
      prints = stats.prints;
      names = stats.names;
      // default_cards is mostly EN — enrich FR names from dictionary
      if (!useAllCards) {
        await mergeDictionaryNames(names);
      }
    }
  }

  writeJson(path.join(outDir, 'prints.json'), mapToObject(prints));
  writeJson(path.join(outDir, 'names.json'), mapToObject(names));
  console.log(
    `Done. prints keys=${prints.size}, names keys=${names.size}, cards scanned=${stats.processed}, en/fr kept=${stats.kept}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
