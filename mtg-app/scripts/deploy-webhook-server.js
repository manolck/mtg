#!/usr/bin/env node
/**
 * Serveur webhook pour déclencher le script de déploiement mtg-app (build + reload nginx).
 * À lancer sur le serveur Linux (systemd ou pm2). Bind 127.0.0.1 uniquement.
 *
 * Auth obligatoire : session PocketBase admin (header X-PocketBase-Auth).
 * Ne jamais exposer de secret de déploiement dans le frontend (pas de VITE_DEPLOY_TOKEN).
 *
 * Variables d'environnement :
 *   PORT            - Port d'écoute (défaut: 9090)
 *   SCRIPT_PATH     - Chemin du script (défaut: /usr/local/bin/mtg-app-update.sh)
 *   POCKETBASE_URL  - Requis. URL PocketBase pour vérifier le rôle admin
 *   ALLOWED_ORIGIN  - Optionnel. Origin CORS exacte si le SPA n'est pas same-origin
 *   DEPLOY_TOKEN    - Optionnel. Si défini, nginx doit injecter Authorization: Bearer <token>
 *                     (jamais envoyé par le navigateur)
 *
 * Exemple :
 *   POCKETBASE_URL=http://127.0.0.1:8090 PORT=9090 node scripts/deploy-webhook-server.js
 *
 * Côté app (build) : VITE_DEPLOY_HOOK_URL=https://votre-domaine.com/deploy
 */

const http = require('http');
const { exec } = require('child_process');

const PORT = parseInt(process.env.PORT || '9090', 10);
const SCRIPT_PATH = process.env.SCRIPT_PATH || '/usr/local/bin/mtg-app-update.sh';
const POCKETBASE_URL = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '').trim();
const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN;

if (!POCKETBASE_URL) {
  console.error('Erreur: POCKETBASE_URL est requis (vérification admin PocketBase).');
  process.exit(1);
}

function setCors(req, res) {
  if (!ALLOWED_ORIGIN) return;
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PocketBase-Auth');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getOptionalServerToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(ALLOWED_ORIGIN && req.headers.origin === ALLOWED_ORIGIN ? 204 : 403);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  if (DEPLOY_TOKEN) {
    const presented = getOptionalServerToken(req);
    if (presented !== DEPLOY_TOKEN) {
      json(res, 401, { ok: false, message: 'Non autorisé' });
      return;
    }
  }

  const pbAuth = req.headers['x-pocketbase-auth'];
  if (!pbAuth || typeof pbAuth !== 'string') {
    json(res, 403, { ok: false, message: 'Accès réservé aux administrateurs. Connexion requise.' });
    return;
  }

  try {
    const r = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pbAuth}` },
    });
    if (!r.ok) {
      json(res, 403, { ok: false, message: 'Session invalide ou expirée. Reconnectez-vous.' });
      return;
    }
    const data = await r.json();
    const record = data.record || data;
    const roles = Array.isArray(record.roles) ? record.roles : (record.role ? [record.role] : []);
    if (!roles.includes('admin')) {
      json(res, 403, { ok: false, message: 'Accès réservé aux administrateurs.' });
      return;
    }
  } catch (e) {
    console.error('PocketBase auth check failed:', e);
    json(res, 503, { ok: false, message: 'Impossible de vérifier les droits.' });
    return;
  }

  exec(`sudo "${SCRIPT_PATH}"`, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    if (err) {
      console.error('Deploy script failed:', err.message);
      json(res, 500, { ok: false, message: 'Le script de déploiement a échoué.' });
      return;
    }
    json(res, 200, { ok: true, message: 'Déploiement terminé avec succès.' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Deploy webhook listening on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
