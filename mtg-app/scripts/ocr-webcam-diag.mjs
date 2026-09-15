/**
 * Dump OCR raw results for webcam name crops (debug).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugDir = path.join(__dirname, '..', 'test-fixtures', 'scan-cards-webcam', 'debug');

async function preprocess(buf, { invert, binarize, sharpen, height }) {
  let pipeline = sharp(buf).resize({ height, fit: 'inside' }).normalize().greyscale();
  if (sharpen) pipeline = pipeline.sharpen({ sigma: 1.2 });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  const doInvert = invert ?? mean < 140;
  const sorted = Uint8Array.from(data).sort((a, b) => a - b);
  const thrSrc = sorted[Math.floor(sorted.length * 0.4)] ?? 128;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    let v = data[i];
    if (doInvert) v = 255 - v;
    else v = Math.min(255, Math.max(0, (v - 128) * 1.6 + 128));
    if (binarize) {
      const thr = doInvert ? 255 - thrSrc : Math.min(thrSrc + 30, 200);
      v = v < thr ? 0 : 255;
    }
    out[i] = v;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

async function main() {
  const files = fs.readdirSync(debugDir).filter((f) => f.startsWith('name-') && f.endsWith('.png'));
  const worker = await createWorker('eng+fra', 1, { logger: () => {} });

  const configs = [
    { name: 'soft180', invert: false, binarize: false, sharpen: false, height: 180 },
    { name: 'soft240s', invert: false, binarize: false, sharpen: true, height: 240 },
    { name: 'inv240s', invert: true, binarize: false, sharpen: true, height: 240 },
    { name: 'bin240s', invert: false, binarize: true, sharpen: true, height: 240 },
    { name: 'invbin240s', invert: true, binarize: true, sharpen: true, height: 240 },
    { name: 'soft300s', invert: false, binarize: false, sharpen: true, height: 300 },
  ];

  try {
    for (const file of files) {
      console.log('\n====', file);
      const buf = fs.readFileSync(path.join(debugDir, file));
      // Also try inner crop: trim black borders
      const meta = await sharp(buf).metadata();
      const inner = await sharp(buf)
        .extract({
          left: Math.floor(meta.width * 0.04),
          top: Math.floor(meta.height * 0.22),
          width: Math.floor(meta.width * 0.7),
          height: Math.floor(meta.height * 0.55),
        })
        .png()
        .toBuffer();

      for (const srcName of ['full', 'inner']) {
        const src = srcName === 'full' ? buf : inner;
        for (const cfg of configs) {
          const pre = await preprocess(src, cfg);
          for (const psm of ['6', '7', '8']) {
            await worker.setParameters({
              tessedit_pageseg_mode: psm,
              tessedit_char_whitelist:
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÆÇÉÈÊËÎÏÔŒÙÛÜŸàâäæçéèêëîïôœùûüÿ' -",
            });
            const r = await worker.recognize(pre);
            const text = (r.data?.text ?? '').replace(/\s+/g, ' ').trim();
            if (text.length >= 3) {
              console.log(
                `  ${srcName} ${cfg.name} psm${psm} conf=${(r.data.confidence ?? 0).toFixed(0)}: "${text}"`
              );
            }
          }
        }
      }
    }
  } finally {
    await worker.terminate();
  }
}

main().catch(console.error);
