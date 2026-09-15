/**
 * Quick matching test — uses ocr-match-lib (source of truth).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveBestOf } from './ocr-match-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dictPath = path.join(__dirname, '..', 'public', 'scryfall-card-dictionary.json');

const cases = [
  { expected: 'Obscure faveur', ocrs: ['0 a obscure faveur reel', 'Ohseure faveur'] },
  { expected: "Ombre d'ailenuit", ocrs: ["Crmtyre d'ailemauit 48", 'therbre d wilenunt', "MOmbred'aiienan La"] },
  { expected: 'Rôdeur de Manteaubrune', ocrs: ['Rodeur de Manteaubrune', 'pee Rodeur de Manteaubrune'] },
  { expected: 'Horrible découverte', ocrs: ['Horrible decouverte'] },
  { expected: 'Goule patricienne', ocrs: ['Goule patricienne', 'LGoule patricienne'] },
  { expected: 'Ombre de la nuit pérenne', ocrs: ['Ombre de La nuit pereny', 'Ombre de la nuit pérenne'] },
  { expected: 'Négociants en cadavres', ocrs: ['pee sante ve atavres', 'ogous on catenins', 'Négociants en cadavres'] },
  { expected: 'Façonneur de peste', ocrs: ['lac reineur de pos', 'reeneur de peste', 'Façonneur de peste'] },
  { expected: 'Golem à relique', ocrs: ['Golem a relique', 'Golem à relique'] },
  { expected: 'Voleur des vents ondin', ocrs: ['Voleur des vents ondin', 'Voleur des vents'] },
  { expected: 'Lightning Bolt', ocrs: ['Lightning Bolt', 'Lightning Boit'] },
  { expected: 'Sol Ring', ocrs: ['Sol Ring'] },
  { expected: null, ocrs: ['Cavalier cruel', '3 Cavalier cruel'] },
];

const entries = JSON.parse(fs.readFileSync(dictPath, 'utf8')).filter(
  (e) => (e.lang === 'fr' || e.lang === 'en') && e.name
);
let ok = 0;
for (const c of cases) {
  const best = resolveBestOf(c.ocrs, entries);
  const got = best?.entry?.name ?? null;
  const pass = got === c.expected;
  if (pass) ok++;
  console.log(
    `${pass ? '✓' : '✗'} ${c.expected ?? '(null)'} → ${got} (${best?.score?.toFixed(3) ?? '—'} via "${best?.ocr ?? ''}")`
  );
}
console.log(`\n${ok}/${cases.length}`);
process.exit(ok === cases.length ? 0 : 1);
