/**
 * Check a deployed SPA for baked TURN hosts. Does not print credentials.
 *   node scripts/check-prod-turn.mjs
 *   node scripts/check-prod-turn.mjs https://mtg-app.duckdns.org
 */
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';

function get(url) {
  const lib = url.startsWith('http://') ? http : https;
  return new Promise((resolve, reject) => {
    lib
      .get(url, { headers: { 'User-Agent': 'mtg-turn-check', 'Accept-Encoding': 'gzip, deflate, br' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'] || 'identity';
          let decoded = raw;
          try {
            if (encoding.includes('br')) decoded = zlib.brotliDecompressSync(raw);
            else if (encoding.includes('gzip')) decoded = zlib.gunzipSync(raw);
            else if (encoding.includes('deflate')) decoded = zlib.inflateSync(raw);
          } catch {
            decoded = raw;
          }
          resolve({
            status: res.statusCode,
            encoding,
            location: res.headers.location,
            body: decoded.toString('utf8'),
          });
        });
      })
      .on('error', reject);
  });
}

const origin = (process.argv[2] || 'https://mtg-app.duckdns.org').replace(/\/$/, '');
const page = await get(`${origin}/`);
console.log('html', page.status, page.encoding, page.body.length, 'bytes');
const fromHtml = [
  ...page.body.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g),
].map((m) => (m[1].startsWith('http') ? m[1] : `${origin}${m[1].startsWith('/') ? '' : '/'}${m[1]}`));
const unique = [...new Set(fromHtml)];
console.log('js from html', unique.length ? unique.map((u) => u.replace(origin, '')).join(' ') : '(none)');
const seen = new Set();
const texts = [page.body];

async function addJs(url) {
  if (seen.has(url)) return;
  seen.add(url);
  const js = await get(url);
  console.log('fetch', url.replace(origin, ''), js.status, js.encoding, js.body.length);
  texts.push(js.body);
}

for (const url of unique) {
  await addJs(url);
}
for (const text of [...texts]) {
  for (const match of text.matchAll(/assets\/[A-Za-z0-9._-]+\.js/g)) {
    await addJs(`${origin}/${match[0]}`);
  }
}
const blob = texts.join('\n');
const foundTransport = blob.includes('3478?transport');
const foundDotHost = blob.includes('turn.mtg-app.duckdns.org');
const foundHyphenHost = blob.includes('turn-mtg-app.duckdns.org');
const foundGoogleStun = blob.includes('stun.l.google.com');
const foundRelayFallback = blob.includes('forcing TURN relay');
const foundCloudflareStun = blob.includes('stun.cloudflare.com');

const ice =
  foundDotHost || foundHyphenHost || foundTransport
    ? 'TURN baked'
    : foundCloudflareStun
      ? 'STUN default only (no VITE_ICE_SERVERS)'
      : foundGoogleStun
        ? 'Google STUN present, no turn host'
        : 'ICE strings not found (cache / other origin?)';

console.log(
  JSON.stringify({
    ice,
    foundTurnDotHost: foundDotHost,
    foundTurnHyphenHost: foundHyphenHost,
    foundTurnTransport: foundTransport,
    foundRelayFallback,
    foundGoogleStun,
    foundCloudflareStun,
  }),
);
