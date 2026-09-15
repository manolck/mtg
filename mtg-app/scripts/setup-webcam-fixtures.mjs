import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'd-Dev-mtg-mtg-app',
  'assets'
);
const dstDir = path.join(root, 'test-fixtures', 'scan-cards-webcam');
fs.mkdirSync(dstDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter((f) => f.includes('image-') && f.endsWith('.png'));
console.log('Available assets:', files.length);
for (const f of files) console.log(' ', f.slice(-60));

// Map by unique image id suffixes from the user message
const mapping = [
  ['282743a4-ea1e-4048-846e-762d9c969e1e', '01-obscure-faveur.png', 'Obscure faveur'],
  ['2eefef86-ffdf-4596-bcb0-6b684ab73837', '02-ombre-dailenuit.png', "Ombre d'ailenuit"],
  ['73f37a88-9a2e-420b-ab6b-c8c9ac4f3f28', '03-rodeur-de-manteaubrune.png', 'Rôdeur de Manteaubrune'],
  ['c4ea49df-d773-41a1-a6d7-b8e719b9ba58', '04-horrible-decouverte.png', 'Horrible découverte'],
  ['5ea22f1b-c216-4a21-86c0-29b81f847f31', '05-goule-patricienne.png', 'Goule patricienne'],
  ['6f983e9f-c199-4cd2-a8fd-568fdee22615', '06-ombre-de-la-nuit-perenne.png', 'Ombre de la nuit pérenne'],
  ['bcb13648-a8f4-433d-a8ec-e331208ae365', '07-negociants-en-cadavres.png', 'Négociants en cadavres'],
  ['837adf33-187d-47f8-bfe6-db0834714340', '08-faconneur-de-peste.png', 'Façonneur de peste'],
];

for (const [id, dest, expected] of mapping) {
  const found = files.find((f) => f.includes(id));
  if (!found) {
    // try shorter unique prefix
    const short = id.slice(0, 8);
    const found2 = files.find((f) => f.includes(short));
    if (!found2) {
      console.log('MISSING', id, expected);
      continue;
    }
    fs.copyFileSync(path.join(srcDir, found2), path.join(dstDir, dest));
    console.log('OK', dest, '<-', found2.slice(-40));
    continue;
  }
  fs.copyFileSync(path.join(srcDir, found), path.join(dstDir, dest));
  console.log('OK', dest);
}

const dict = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'scryfall-card-dictionary.json'), 'utf8')
);
for (const [, , expected] of mapping) {
  const hit = dict.find((e) => e.name === expected);
  if (hit) console.log('DICT OK', expected);
  else {
    const near = dict
      .filter(
        (e) =>
          e.lang === 'fr' &&
          e.name &&
          e.name.toLowerCase().includes(expected.slice(0, 5).toLowerCase())
      )
      .slice(0, 5)
      .map((e) => e.name);
    console.log('DICT MISSING', expected, 'near:', near);
  }
}
