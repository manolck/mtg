import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { join, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'test-fixtures/scan-cards/01-tigorille-feroce.png');
const outDir = join(root, 'test-fixtures/scan-debug');
mkdirSync(outDir, { recursive: true });

const meta = await sharp(path).metadata();
const region = { x: 0.06, y: 0.03, width: 0.69, height: 0.08 };
const left = Math.floor(region.x * meta.width);
const top = Math.floor(region.y * meta.height);
const width = Math.max(1, Math.floor(region.width * meta.width));
const height = Math.max(1, Math.floor(region.height * meta.height));
const cropped = await sharp(path).extract({ left, top, width, height }).png().toBuffer();

async function variants(buf) {
  const base = sharp(buf).greyscale().normalize();
  return {
    v1: await base.clone().resize({ height: 120, kernel: 'lanczos3' }).sharpen().png().withMetadata({ density: 300 }).toBuffer(),
    v2: await base.clone().resize({ height: 120 }).threshold(140).png().withMetadata({ density: 300 }).toBuffer(),
    v3: await base.clone().resize({ height: 160 }).linear(1.5, -40).png().withMetadata({ density: 300 }).toBuffer(),
    v4: await base.clone().resize({ height: 120 }).negate().png().withMetadata({ density: 300 }).toBuffer(),
    v5: await base.clone().resize({ height: 200 }).sharpen({ sigma: 1 }).png().withMetadata({ density: 300 }).toBuffer(),
  };
}

const vs = await variants(cropped);
for (const [k, v] of Object.entries(vs)) writeFileSync(join(outDir, `prep-${k}.png`), v);

const worker = await Tesseract.createWorker('fra+eng', 1, { logger: () => {} });
await worker.setParameters({
  tessedit_pageseg_mode: '7',
});
for (const [k, v] of Object.entries(vs)) {
  const r = await worker.recognize(v);
  console.log(k, JSON.stringify(r.data.text), 'conf', Math.round(r.data.confidence));
}
await worker.setParameters({ tessedit_pageseg_mode: '8' });
console.log('--- PSM 8 ---');
for (const [k, v] of Object.entries(vs)) {
  const r = await worker.recognize(v);
  console.log(k, JSON.stringify(r.data.text), 'conf', Math.round(r.data.confidence));
}
await worker.terminate();
