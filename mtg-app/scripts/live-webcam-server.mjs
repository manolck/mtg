/**
 * Live webcam OCR test harness (RapidOCR sidecar + matching dictionnaire).
 * Prérequis: python scripts/rapidocr_sidecar.py
 * Usage: node scripts/live-webcam-server.mjs
 * Open http://localhost:5199
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { cleanOcrKey, resolveBestOf, buildMatchIndex } from './ocr-match-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dictPath = path.join(root, 'public', 'scryfall-card-dictionary.json');
const outDir = path.join(root, 'test-fixtures', 'live-webcam');
const resultsPath = path.join(outDir, 'results.jsonl');
const PORT = 5199;
const RAPIDOCR_URL = process.env.RAPIDOCR_URL || 'http://127.0.0.1:5201';

const NAME_REGIONS = [
  { x: 0.04, y: 0.015, width: 0.8, height: 0.12 },
  { x: 0.03, y: 0.01, width: 0.85, height: 0.14 },
];
const SAVE_FIXTURES = process.env.SAVE_FIXTURES !== '0';

const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live RapidOCR Webcam — MTG</title>
  <style>
    :root { color-scheme: dark; font-family: "Segoe UI", system-ui, sans-serif; }
    body { margin: 0; background: #0f1218; color: #e8ecf4; min-height: 100vh; }
    main { max-width: 920px; margin: 0 auto; padding: 1.25rem; }
    h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
    p.hint { color: #9aa3b5; margin: 0 0 1rem; font-size: 0.95rem; }
    .stage { position: relative; background: #000; border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; }
    video, canvas.snap { width: 100%; height: 100%; object-fit: contain; display: block; background: #111; }
    canvas.snap { display: none; }
    .row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; align-items: center; }
    button {
      appearance: none; border: 0; border-radius: 10px; padding: 0.85rem 1.25rem;
      font-size: 1rem; font-weight: 650; cursor: pointer;
    }
    #scan { background: #3d8bfd; color: #fff; }
    #scan:disabled { opacity: 0.5; cursor: wait; }
    #again { background: #2a3140; color: #e8ecf4; }
    #result {
      margin-top: 1rem; padding: 1rem 1.1rem; border-radius: 12px;
      background: #171c26; border: 1px solid #2a3140; min-height: 4.5rem;
    }
    #result .name { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.01em; }
    #result .meta { color: #9aa3b5; margin-top: 0.4rem; font-size: 0.9rem; word-break: break-word; }
    .ok { color: #5dde8a; } .busy { color: #f0c14a; } .err { color: #ff7b7b; }
  </style>
</head>
<body>
  <main>
    <h1>Test RapidOCR webcam (live)</h1>
    <p class="hint">RapidOCR local (sidecar :5201). Cartes FR ou EN. Place-la, clique <strong>Scanner</strong>, puis dis OK ou KO.</p>
    <div class="stage">
      <video id="video" playsinline autoplay muted></video>
      <canvas id="snap" class="snap"></canvas>
    </div>
    <div class="row">
      <button id="scan" type="button">Scanner</button>
      <button id="again" type="button">Relancer caméra</button>
      <span id="status" class="busy">Initialisation…</span>
    </div>
    <div id="result"><div class="meta">En attente d’un scan.</div></div>
  </main>
  <script>
    const video = document.getElementById('video');
    const snap = document.getElementById('snap');
    const scanBtn = document.getElementById('scan');
    const againBtn = document.getElementById('again');
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    let stream = null;

    async function startCam() {
      status.textContent = 'Demande accès caméra…';
      status.className = 'busy';
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      status.textContent = 'Caméra prête — place une carte';
      status.className = 'ok';
      scanBtn.disabled = false;
    }

    againBtn.onclick = () => startCam().catch(e => {
      status.textContent = 'Erreur caméra: ' + e.message;
      status.className = 'err';
    });

    scanBtn.onclick = async () => {
      if (!video.videoWidth) return;
      scanBtn.disabled = true;
      status.textContent = 'OCR en cours…';
      status.className = 'busy';
      snap.width = video.videoWidth;
      snap.height = video.videoHeight;
      snap.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(r => snap.toBlob(r, 'image/jpeg', 0.92));
      try {
        const res = await fetch('/api/scan', { method: 'POST', body: blob });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'scan failed');
        result.innerHTML =
          '<div class="name">' + (data.name || '(aucune correspondance)') +
          (data.lang ? ' <span class="meta">[' + data.lang + ']</span>' : '') + '</div>' +
          '<div class="meta">score ' + (data.score ?? 0).toFixed(3) +
          ' · coverage ' + (data.coverage ?? 0).toFixed(2) +
          (data.box ? ' · box ' + data.box.width + '×' + data.box.height + ' @' + data.box.left + ',' + data.box.top : '') +
          '<br/>OCR: ' + (data.ocrTop || []).map(t => '"' + t + '"').join(' / ') + '</div>';
        status.textContent = data.name ? 'Résultat prêt — dis OK ou KO à l’agent' : 'Pas de match';
        status.className = data.name ? 'ok' : 'err';
      } catch (e) {
        result.innerHTML = '<div class="meta err">' + e.message + '</div>';
        status.textContent = 'Échec';
        status.className = 'err';
      } finally {
        scanBtn.disabled = false;
      }
    };

    startCam().catch(e => {
      status.textContent = 'Autorise la caméra dans le navigateur. ' + e.message;
      status.className = 'err';
    });
  </script>
</body>
</html>`;

function letterScore(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const words = text.split(/\s+/).filter((w) => /[\p{L}]{3,}/u.test(w)).length;
  return letters + words * 4;
}

function isGarbageOcr(text) {
  const t = cleanOcrKey(text);
  if (t.length < 6) return true;
  const letters = (t.match(/\p{L}/gu) || []).length;
  const digits = (t.match(/\p{N}/gu) || []).length;
  const words = t.split(/\s+/).filter(Boolean);
  const goodWords = words.filter((w) => /[\p{L}]{4,}/u.test(w));
  if (letters < 8) return true;
  if (digits > letters * 0.8) return true;
  if (goodWords.length < 1) return true;
  if (words.length >= 6 && goodWords.length / words.length < 0.35) return true;
  const junk = words.filter((w) => w.length <= 2).length;
  if (junk >= 4 && junk / words.length > 0.4) return true;
  return false;
}

/**
 * Trouve la carte n'importe où dans le cadre (blob sombre + ratio ~63/88).
 * Ne suppose pas que la carte est centrée.
 */
function findCardBBox(data, detW, detH, thr) {
  const visited = new Uint8Array(detW * detH);
  const targetRatio = 63 / 88;
  let best = null;

  for (let y = 0; y < detH; y++) {
    for (let x = 0; x < detW; x++) {
      const start = y * detW + x;
      if (visited[start] || data[start] >= thr) continue;

      // Flood-fill 4-connexe
      const stack = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length) {
        const idx = stack.pop();
        const cx = idx % detW;
        const cy = (idx / detW) | 0;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [idx - 1, idx + 1, idx - detW, idx + detW];
        for (const n of neighbors) {
          if (n < 0 || n >= visited.length) continue;
          const nx = n % detW;
          const ny = (n / detW) | 0;
          // Évite de sauter de ligne avec idx±1
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (visited[n] || data[n] >= thr) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }

      if (count < 600) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < 35 || bh < 50) continue;
      const ratio = bw / bh;
      const ratioScore = 1 - Math.min(1, Math.abs(ratio - targetRatio) / 0.4);
      if (ratioScore < 0.15) continue;
      const fill = count / (bw * bh);
      if (fill < 0.25) continue;
      const areaFrac = (bw * bh) / (detW * detH);
      if (areaFrac < 0.04 || areaFrac > 0.9) continue;
      // Préfère blobs bien remplis, bon ratio, taille raisonnable
      const sizeScore = areaFrac < 0.15 ? areaFrac / 0.15 : areaFrac > 0.7 ? (1 - areaFrac) / 0.3 : 1;
      const score = ratioScore * 0.5 + fill * 0.25 + sizeScore * 0.25;
      if (!best || score > best.score) {
        best = { minX, maxX, minY, maxY, score, count, thr };
      }
    }
  }
  return best;
}

/** Crop adaptatif : localise la carte où qu'elle soit, puis normalise en 700×980. */
async function cropCardBuffer(inputBuf) {
  const meta = await sharp(inputBuf).metadata();
  const w = meta.width;
  const h = meta.height;
  const detW = 480;
  const detH = Math.round((h / w) * detW);
  const { data } = await sharp(inputBuf)
    .resize(detW, detH)
    .greyscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;

  // 2 seuils + early stop si score élevé
  const thresholds = [
    Math.min(110, Math.max(50, mean * 0.55)),
    Math.min(95, Math.max(40, mean * 0.45)),
  ];

  let best = null;
  for (const thr of thresholds) {
    const box = findCardBBox(data, detW, detH, thr);
    if (box && (!best || box.score > best.score)) best = box;
    if (best && best.score >= 0.85) break;
  }

  let minX;
  let maxX;
  let minY;
  let maxY;
  if (best) {
    minX = best.minX;
    maxX = best.maxX;
    minY = best.minY;
    maxY = best.maxY;
  } else {
    // Fallback : projection globale (carte hors centre possible via densités)
    const thr = Math.min(110, Math.max(50, mean * 0.55));
    const rowDark = new Array(detH).fill(0);
    const colDark = new Array(detW).fill(0);
    for (let y = 0; y < detH; y++) {
      for (let x = 0; x < detW; x++) {
        if (data[y * detW + x] < thr) {
          rowDark[y]++;
          colDark[x]++;
        }
      }
    }
    const rowMin = Math.floor(detW * 0.12);
    const colMin = Math.floor(detH * 0.12);
    minY = 0;
    maxY = detH - 1;
    minX = 0;
    maxX = detW - 1;
    while (minY < detH && rowDark[minY] < rowMin) minY++;
    while (maxY > minY && rowDark[maxY] < rowMin) maxY--;
    while (minX < detW && colDark[minX] < colMin) minX++;
    while (maxX > minX && colDark[maxX] < colMin) maxX--;
  }

  let bw = maxX - minX + 1;
  let bh = maxY - minY + 1;
  if (bw < 40 || bh < 55) {
    // Dernier recours : fenêtre centrée (ne doit presque jamais arriver)
    const width = Math.floor(w * 0.55);
    const height = Math.floor(width / (63 / 88));
    const left = Math.floor((w - width) / 2);
    const top = Math.floor((h - height) / 2);
    return {
      buf: await sharp(inputBuf)
        .extract({
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: Math.min(w, width),
          height: Math.min(h, height),
        })
        .resize(700, 980, { fit: 'fill' })
        .png()
        .toBuffer(),
      box: null,
    };
  }

  // Marge autour du blob (nom en haut à gauche)
  const expandX = Math.max(8, Math.floor(bw * 0.08));
  const expandY = Math.max(10, Math.floor(bh * 0.06));
  minX = Math.max(0, minX - expandX);
  maxX = Math.min(detW - 1, maxX + expandX);
  minY = Math.max(0, minY - expandY);
  maxY = Math.min(detH - 1, maxY + expandY);
  bw = maxX - minX + 1;
  bh = maxY - minY + 1;

  // Ajuste vers ratio carte sans déplacer le centre du blob
  const targetRatio = 63 / 88;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let outW = bw;
  let outH = bh;
  if (bw / bh > targetRatio * 1.2) {
    outW = Math.floor(bh * targetRatio);
  } else if (bw / bh < targetRatio * 0.75) {
    outH = Math.floor(bw / targetRatio);
  }
  minX = Math.max(0, Math.floor(cx - outW / 2));
  maxX = Math.min(detW - 1, Math.floor(cx + outW / 2));
  minY = Math.max(0, Math.floor(cy - outH / 2));
  maxY = Math.min(detH - 1, Math.floor(cy + outH / 2));

  const sx = w / detW;
  const sy = h / detH;
  const left = Math.max(0, Math.floor(minX * sx));
  const top = Math.max(0, Math.floor(minY * sy));
  const width = Math.min(w - left, Math.ceil((maxX - minX + 1) * sx));
  const height = Math.min(h - top, Math.ceil((maxY - minY + 1) * sy));

  const buf = await sharp(inputBuf)
    .extract({ left, top, width, height })
    .resize(700, 980, { fit: 'fill' })
    .png()
    .toBuffer();

  return {
    buf,
    box: { left, top, width, height, score: best?.score ?? 0 },
  };
}

async function rapidOcrImage(buf) {
  const res = await fetch(`${RAPIDOCR_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`RapidOCR ${res.status}: ${err}`);
  }
  return res.json();
}

async function checkRapidOcr() {
  try {
    const res = await fetch(`${RAPIDOCR_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** OCR carte : bandeau titre d'abord, full card seulement si match faible. */
async function ocrNameRapid(cardBuf, entries) {
  const primary = new Set();
  const secondary = new Set();
  const add = (set, t) => {
    const c = cleanOcrKey(t ?? '');
    if (c.length >= 4 && letterScore(c) >= 6 && !isGarbageOcr(c)) set.add(c);
  };
  const strong = (cands) => {
    if (!cands.length || !entries) return false;
    const r = resolveBestOf(cands, entries);
    if (!r || r.score < 0.98 || (r.coverage ?? 0) < 0.6) return false;
    // Évite de valider une type line (ex. "humain et gredin")
    const o = (r.ocr || '').toLowerCase();
    if (/\b(creature|cr[eé]ature|humain|gredin|zombie|guerrier|shamane)\b/.test(o) &&
        !/\b(de|des|d'|the|of)\b/.test(o)) {
      return false;
    }
    return true;
  };

  const meta = await sharp(cardBuf).metadata();
  const extractTitle = async (region) => {
    const left = Math.floor(region.x * meta.width);
    const top = Math.floor(region.y * meta.height);
    const width = Math.max(8, Math.floor(region.width * meta.width));
    const height = Math.max(8, Math.floor(region.height * meta.height));
    if (left + width > meta.width || top + height > meta.height) return null;
    return sharp(cardBuf)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
  };

  // 1) Bandeau titre (rapide) — early-exit seulement sur grandes crops nettes
  const titleBuf = await extractTitle(NAME_REGIONS[0]);
  if (titleBuf) {
    try {
      const r = await rapidOcrImage(titleBuf);
      for (const t of r.name_texts?.length ? r.name_texts : r.texts || []) add(primary, t);
      if (r.name_joined) add(primary, r.name_joined);
      else if (r.joined) add(primary, r.joined);
    } catch {
      /* ignore */
    }
  }
  if (meta.height >= 500 && strong([...primary])) return [...primary];

  // 2) Carte entière
  const fullPng = await sharp(cardBuf).png().toBuffer();
  const full = await rapidOcrImage(fullPng);
  const nameTexts = full.name_texts?.length ? full.name_texts : (full.texts || []).slice(0, 1);
  for (const t of nameTexts) add(primary, t);
  if (nameTexts.length >= 2) add(primary, nameTexts.slice(0, 2).join(' '));
  if (full.name_joined) add(primary, full.name_joined);
  if (meta.height >= 500 && strong([...primary])) return [...primary];

  // 3) 2e région titre si encore faible
  if (NAME_REGIONS[1]) {
    const buf = await extractTitle(NAME_REGIONS[1]);
    if (buf) {
      try {
        const r = await rapidOcrImage(buf);
        for (const t of r.name_texts?.length ? r.name_texts : r.texts || []) add(primary, t);
        if (r.name_joined) add(primary, r.name_joined);
        else if (r.joined) add(primary, r.joined);
      } catch {
        /* ignore */
      }
    }
  }

  if (primary.size === 0) {
    for (const t of (full.texts || []).slice(0, 2)) add(secondary, t);
  }
  return [...primary, ...secondary];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log('Loading dictionary…');
  const entries = JSON.parse(fs.readFileSync(dictPath, 'utf8')).filter(
    (e) => (e.lang === 'fr' || e.lang === 'en') && e.name
  );
  console.log(`Dictionary: ${entries.length} FR+EN names`);
  buildMatchIndex(entries); // warm index

  const ok = await checkRapidOcr();
  if (!ok) {
    console.error(
      `\nRapidOCR sidecar introuvable sur ${RAPIDOCR_URL}\n` +
        `Lance d'abord:  python scripts/rapidocr_sidecar.py\n`
    );
    process.exit(1);
  }
  console.log(`RapidOCR OK (${RAPIDOCR_URL})`);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }
    if (req.method === 'GET' && req.url === '/api/last') {
      let last = null;
      if (fs.existsSync(resultsPath)) {
        const lines = fs.readFileSync(resultsPath, 'utf8').trim().split('\n').filter(Boolean);
        if (lines.length) last = JSON.parse(lines[lines.length - 1]);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(last));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/scan') {
      try {
        const raw = await readBody(req);
        if (!raw.length) throw new Error('image vide');
        const ts = Date.now();
        const framePath = path.join(outDir, `frame-${ts}.jpg`);
        if (SAVE_FIXTURES) {
          fs.writeFile(framePath, raw, () => {});
        }
        const { buf: cardBuf, box } = await cropCardBuffer(raw);
        if (SAVE_FIXTURES) {
          sharp(cardBuf)
            .jpeg({ quality: 85 })
            .toFile(path.join(outDir, `crop-${ts}.jpg`))
            .catch(() => {});
        }
        const t0 = Date.now();
        const candidates = await ocrNameRapid(cardBuf, entries);
        const ocrMs = Date.now() - t0;
        const t1 = Date.now();
        const resolved = resolveBestOf(candidates, entries);
        const matchMs = Date.now() - t1;
        let final = resolved;
        if (final) {
          const goodWords = (final.ocr || '')
            .split(/\s+/)
            .filter((w) => /[\p{L}]{4,}/u.test(w)).length;
          if (final.score < 0.88 || (goodWords < 2 && final.score < 0.98)) {
            final = null;
          }
        }
        const top = [...candidates]
          .sort((a, b) => letterScore(b) - letterScore(a))
          .slice(0, 5);
        const payload = {
          ts,
          name: final?.entry?.name ?? null,
          lang: final?.entry?.lang ?? null,
          score: final?.score ?? 0,
          coverage: final?.coverage ?? 0,
          ocr: final?.ocr ?? null,
          ocrTop: top,
          ocrMs,
          matchMs,
          engine: 'rapidocr',
          frame: SAVE_FIXTURES ? framePath : null,
          box,
        };
        if (SAVE_FIXTURES) {
          fs.appendFile(resultsPath, JSON.stringify(payload) + '\n', () => {});
        }
        console.log(
          `\n→ ${payload.name ?? '(null)'}${payload.lang ? ` [${payload.lang}]` : ''}  score=${payload.score.toFixed(3)}  (ocr ${ocrMs}ms + match ${matchMs}ms)`
        );
        console.log(`  OCR: ${top.map((t) => `"${t}"`).join(' / ')}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  server.listen(PORT, () => {
    console.log(`\nLive OCR prêt: http://localhost:${PORT}`);
    console.log('Place une carte, clique Scanner, puis dis OK/KO dans le chat.\n');
  });

  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
