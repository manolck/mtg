#!/usr/bin/env node
/**
 * Build a unified card name dictionary from Scryfall "All Cards" bulk JSON.
 * Input: all-cards-YYYYMMDDHHMMSS.json (array of card objects with oracle_id, lang, name, printed_name)
 * Output: scryfall-card-dictionary.json — array of { oracle_id, lang, name }, one per (oracle_id, lang).
 * Uses printed_name when present (localized name on the card), otherwise name (canonical).
 *
 * Usage: node scripts/build-scryfall-dictionary.cjs [input.json] [output.json]
 *        npm run build-scryfall-dictionary
 * Default input: all-cards-*.json (first match in cwd) or all-cards-20260204223057.json
 * Default output: public/scryfall-card-dictionary.json
 * Note: Large heap needed for the 2.5 GB input; use node --max-old-space-size=8192 if OOM.
 */

const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const streamJson = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');

const projectRoot = path.resolve(__dirname, '..');

function findInputFile() {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => !a.startsWith('--'));
  if (inputArg) return path.isAbsolute(inputArg) ? inputArg : path.join(projectRoot, inputArg);
  const defaultName = 'all-cards-20260204223057.json';
  const defaultPath = path.join(projectRoot, defaultName);
  if (fs.existsSync(defaultPath)) return defaultPath;
  const dir = fs.readdirSync(projectRoot);
  const match = dir.find((f) => f.startsWith('all-cards-') && f.endsWith('.json'));
  return match ? path.join(projectRoot, match) : null;
}

function getOutputPath(inputPath) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length >= 2) return path.isAbsolute(args[1]) ? args[1] : path.join(projectRoot, args[1]);
  return path.join(projectRoot, 'public', 'scryfall-card-dictionary.json');
}

const inputPath = findInputFile();
const outputPath = getOutputPath(inputPath);

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/build-scryfall-dictionary.cjs [input.json] [output.json]');
  console.error('Input file not found. Place all-cards-*.json in project root or pass path.');
  process.exit(1);
}

console.log('Input:', inputPath);
console.log('Output:', outputPath);

const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outStream = fs.createWriteStream(outputPath, { flags: 'w', encoding: 'utf8' });
outStream.write('[');

const seen = new Set(); // key = oracle_id + \0 + lang
let count = 0;
let first = true;

const pipeline = chain([
  fs.createReadStream(inputPath),
  streamJson.parser(),
  streamArray(),
]);

pipeline.on('data', ({ value }) => {
  if (!value || typeof value !== 'object') return;
  const oracleId = value.oracle_id;
  const lang = value.lang;
  const printedName =
    value.printed_name && typeof value.printed_name === 'string' && value.printed_name.trim();
  const name = printedName ? value.printed_name.trim() : value.name;
  if (!oracleId || !lang || !name) return;
  const key = oracleId + '\0' + lang;
  if (seen.has(key)) return;
  seen.add(key);
  const entry = JSON.stringify({ oracle_id: oracleId, lang, name });
  outStream.write(first ? entry : ',' + entry);
  first = false;
  count++;
  if (count % 50000 === 0) console.log('Processed', count, 'unique entries...');
});

pipeline.on('end', () => {
  outStream.write(']');
  outStream.end();
  console.log('Total unique (oracle_id, lang) entries:', count);
  console.log('Written to', outputPath);
});

pipeline.on('error', (err) => {
  console.error('Error:', err);
  outStream.destroy();
  process.exit(1);
});

outStream.on('error', (err) => {
  console.error('Write error:', err);
  process.exit(1);
});
