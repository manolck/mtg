import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgPath = join(publicDir, 'vite.svg');
const sizes = [192, 512];

const svg = readFileSync(svgPath);
await Promise.all(
  sizes.map((size) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(publicDir, `icon-${size}.png`))
  )
);
console.log('PWA icons generated: icon-192.png, icon-512.png');
