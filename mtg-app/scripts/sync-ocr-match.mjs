import fs from 'fs';

let s = fs.readFileSync('scripts/ocr-match-lib.mjs', 'utf8');
s = s.replace(
  /^\/\*[\s\S]*?\*\/\s*/,
  '/** OCR↔dictionary matching — keep in sync with scripts/ocr-match-lib.mjs */\n\nexport interface OcrMatchEntry {\n  oracle_id: string;\n  lang: string;\n  name: string;\n}\n\n'
);
s = s.replace(
  'export function normalizeAccents(s)',
  'export function normalizeAccents(s: string)'
);
s = s.replace('export function cleanOcrKey(s)', 'export function cleanOcrKey(s: string)');
s = s.replace('function jaroWinkler(s1, s2)', 'function jaroWinkler(s1: string, s2: string)');
s = s.replace('export function tokenize(s)', 'export function tokenize(s: string)');
s = s.replace('function tokensFuzzyEqual(a, b)', 'function tokensFuzzyEqual(a: string, b: string)');
s = s.replace(
  'export function looksLikeTypeLine(ocr)',
  'export function looksLikeTypeLine(ocr: string)'
);
s = s.replace(
  'export function expandOcrCandidates(raw)',
  'export function expandOcrCandidates(raw: string)'
);
s = s.replace(
  'export function scoreNameMatch(ocrText, cardName, lang)',
  'export function scoreNameMatch(ocrText: string, cardName: string, lang?: string)'
);
s = s.replace(
  'export function detectOcrLangHint(ocr)',
  'export function detectOcrLangHint(ocr: string): "fr" | "en" | null'
);
s = s.replace(
  'export function buildMatchIndex(entries)',
  'export function buildMatchIndex(entries: OcrMatchEntry[])'
);
s = s.replace(
  'export function resolveBestOf(candidates, entries)',
  'export function resolveBestOf(candidates: string[], entries: OcrMatchEntry[])'
);
s = s.replace('const isJunk = (t) =>', 'const isJunk = (t: string) =>');
s = s.replace(
  'let best = null;',
  'let best: { entry: OcrMatchEntry; score: number; ocr: string; coverage: number } | null = null;'
);
s = s.replace(
  /const lastJwFor = \(name, ocr\) =>/g,
  'const lastJwFor = (name: string, ocr: string) =>'
);
s = s.replace(
  /const firstJwFor = \(name, ocr\) =>/g,
  'const firstJwFor = (name: string, ocr: string) =>'
);
s = s.replace(
  /const enScore = \(name, ocr\) =>/g,
  'const enScore = (name: string, ocr: string) =>'
);
s = s.replace(
  /const gJw = \(name, ocr\) =>/g,
  'const gJw = (name: string, ocr: string) =>'
);

fs.writeFileSync('src/utils/ocrMatch.ts', s);
console.log('wrote src/utils/ocrMatch.ts', s.length);
