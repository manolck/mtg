#!/usr/bin/env node
/**
 * Serveur webhook pour déclencher le script de déploiement mtg-app (build + reload nginx).
 * À lancer sur le serveur Linux (ex: systemd ou pm2).
 *
 * Variables d'environnement :
 *   PORT            - Port d'écoute (défaut: 9090)
 *   DEPLOY_TOKEN    - Token requis dans Authorization: Bearer <token> ou body { token: "..." }
 *   SCRIPT_PATH     - Chemin du script (défaut: /usr/local/bin/mtg-app-update.sh)
 *   POCKETBASE_URL  - (optionnel) Si défini, exige un header X-PocketBase-Auth et vérifie que l'utilisateur a le rôle admin
 *
 * Exemple :
 *   DEPLOY_TOKEN=secret PORT=9090 node scripts/deploy-webhook-server.js
 *
 * Côté app (build) : VITE_DEPLOY_HOOK_URL=https://votre-domaine.com:9090/deploy VITE_DEPLOY_TOKEN=secret
 */

const http = require('http');
const { exec } = require('child_process');

const PORT = parseInt(process.env.PORT || '9090', 10);
const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN;
const SCRIPT_PATH = process.env.SCRIPT_PATH || '/usr/local/bin/mtg-app-update.sh';
const POCKETBASE_URL = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');

if (!DEPLOY_TOKEN || DEPLOY_TOKEN.length < 8) {
  console.error('Erreur: définir DEPLOY_TOKEN (au moins 8 caractères)');
  process.exit(1);
}

function getTokenFromRequest(req, body) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  try {
    const data = body && JSON.parse(body);
    if (data && typeof data.token === 'string') return data.token;
  } catch (_) {}
  return null;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS pour appels depuis le navigateur (même origine ou autre domaine)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PocketBase-Auth');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
    return;
  }

  let body = '';
  try {
    body = await collectBody(req);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: 'Error reading body', error: String(e) }));
    return;
  }

  const token = getTokenFromRequest(req, body);
  if (token !== DEPLOY_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: 'Token invalide ou manquant' }));
    return;
  }

  if (POCKETBASE_URL) {
    const pbAuth = req.headers['x-pocketbase-auth'];
    if (!pbAuth || typeof pbAuth !== 'string') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Accès réservé aux administrateurs. Connexion requise.' }));
      return;
    }
    try {
      const r = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pbAuth}` },
      });
      if (!r.ok) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Session invalide ou expirée. Reconnectez-vous.' }));
        return;
      }
      const data = await r.json();
      const record = data.record || data;
      const roles = Array.isArray(record.roles) ? record.roles : (record.role ? [record.role] : []);
      if (!roles.includes('admin')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Accès réservé aux administrateurs.' }));
        return;
      }
    } catch (e) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Impossible de vérifier les droits (PocketBase indisponible).', error: String(e) }));
      return;
    }
  }

  exec(`sudo "${SCRIPT_PATH}"`, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
    const output = [stdout, stderr].filter(Boolean).join('\n').trim() || undefined;
    if (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        message: 'Le script a échoué',
        error: err.message,
        output: output || undefined,
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      message: 'Déploiement terminé avec succès.',
      output: output || undefined,
    }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Deploy webhook listening on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
