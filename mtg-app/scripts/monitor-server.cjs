#!/usr/bin/env node
/**
 * Admin monitoring: machine stats + live journalctl for critical units.
 * Bind 127.0.0.1 only. Auth = PocketBase admin session (X-PocketBase-Auth).
 *
 * Env:
 *   PORT              default 9091
 *   POCKETBASE_URL    required (auth + optional health)
 *   ALLOWED_ORIGIN    optional CORS origin
 *   MONITOR_UNITS     comma list (default: play-sync,coturn,nginx,pocketbase)
 *   PLAY_SYNC_HEALTH  default http://127.0.0.1:8091/health
 *   DISK_PATH         default /
 *
 * Example:
 *   POCKETBASE_URL=http://127.0.0.1:8090 node scripts/monitor-server.cjs
 *
 * Front: VITE_MONITOR_URL=https://mtg-app.duckdns.org/monitor
 *
 * journalctl: add the service user to group systemd-journal
 *   sudo usermod -aG systemd-journal www-data
 */

const http = require('http');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PORT = parseInt(process.env.PORT || '9091', 10);
const POCKETBASE_URL = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '').trim();
const MONITOR_UNITS = (process.env.MONITOR_UNITS || 'play-sync,coturn,nginx,pocketbase')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PLAY_SYNC_HEALTH = process.env.PLAY_SYNC_HEALTH || 'http://127.0.0.1:8091/health';
const DISK_PATH = process.env.DISK_PATH || '/';

if (!POCKETBASE_URL) {
  console.error('Erreur: POCKETBASE_URL est requis.');
  process.exit(1);
}

function setCors(req, res) {
  if (!ALLOWED_ORIGIN) return;
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PocketBase-Auth');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function requireAdmin(req, res) {
  const pbAuth = req.headers['x-pocketbase-auth'];
  if (!pbAuth || typeof pbAuth !== 'string') {
    json(res, 403, { ok: false, message: 'Accès réservé aux administrateurs. Connexion requise.' });
    return false;
  }
  try {
    const r = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pbAuth}` },
    });
    if (!r.ok) {
      json(res, 403, { ok: false, message: 'Session invalide ou expirée. Reconnectez-vous.' });
      return false;
    }
    const data = await r.json();
    const record = data.record || data;
    const roles = Array.isArray(record.roles) ? record.roles : record.role ? [record.role] : [];
    if (!roles.includes('admin')) {
      json(res, 403, { ok: false, message: 'Accès réservé aux administrateurs.' });
      return false;
    }
    return true;
  } catch (e) {
    console.error('PocketBase auth check failed:', e);
    json(res, 503, { ok: false, message: 'Impossible de vérifier les droits.' });
    return false;
  }
}

function readMemInfo() {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return m ? parseInt(m[1], 10) * 1024 : 0;
    };
    const total = get('MemTotal');
    const available = get('MemAvailable') || get('MemFree');
    const used = Math.max(0, total - available);
    return { totalBytes: total, usedBytes: used, availableBytes: available };
  } catch {
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
  }
}

function readLoad() {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
    return {
      load1: parseFloat(parts[0]) || 0,
      load5: parseFloat(parts[1]) || 0,
      load15: parseFloat(parts[2]) || 0,
    };
  } catch {
    return { load1: 0, load5: 0, load15: 0 };
  }
}

function readCpuCount() {
  try {
    const raw = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const n = (raw.match(/^processor\s*:/gm) || []).length;
    return n || 1;
  } catch {
    return 1;
  }
}

function readTempC() {
  const paths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/hwmon/hwmon0/temp1_input',
  ];
  for (const p of paths) {
    try {
      const n = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
      if (Number.isFinite(n)) return n > 1000 ? n / 1000 : n;
    } catch {
      /* next */
    }
  }
  return null;
}

function readUptimeSec() {
  try {
    const raw = fs.readFileSync('/proc/uptime', 'utf8');
    return parseFloat(raw.split(/\s+/)[0]) || 0;
  } catch {
    return 0;
  }
}

async function readDisk(path) {
  try {
    const { stdout } = await execFileAsync('df', ['-B1', '--output=size,used,avail,pcent,target', path], {
      timeout: 3000,
    });
    const line = stdout.trim().split('\n').pop() || '';
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return null;
    return {
      path,
      totalBytes: parseInt(parts[0], 10) || 0,
      usedBytes: parseInt(parts[1], 10) || 0,
      availableBytes: parseInt(parts[2], 10) || 0,
      usedPercent: parseInt(String(parts[3]).replace('%', ''), 10) || 0,
    };
  } catch {
    return null;
  }
}

async function unitActive(unit) {
  try {
    const { stdout } = await execFileAsync('systemctl', ['is-active', unit], { timeout: 3000 });
    return stdout.trim();
  } catch (err) {
    const out = (err.stdout && String(err.stdout).trim()) || '';
    return out || 'unknown';
  }
}

async function probeUrl(url) {
  const started = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return { ok: r.ok, status: r.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: e instanceof Error ? e.message : 'error' };
  }
}

async function collectStats() {
  const [disk, services, playSync, pocketBase] = await Promise.all([
    readDisk(DISK_PATH),
    Promise.all(
      MONITOR_UNITS.map(async (unit) => ({
        unit,
        active: await unitActive(unit),
      })),
    ),
    probeUrl(PLAY_SYNC_HEALTH),
    probeUrl(`${POCKETBASE_URL}/api/health`),
  ]);

  const mem = readMemInfo();
  const load = readLoad();
  const cpus = readCpuCount();

  return {
    ok: true,
    at: new Date().toISOString(),
    host: {
      hostname: require('os').hostname(),
      platform: process.platform,
      uptimeSec: readUptimeSec(),
      cpus,
    },
    cpu: {
      ...load,
      loadPerCpu: cpus ? load.load1 / cpus : load.load1,
    },
    memory: {
      ...mem,
      usedPercent: mem.totalBytes ? Math.round((mem.usedBytes / mem.totalBytes) * 1000) / 10 : 0,
    },
    temperatureC: readTempC(),
    disk,
    services,
    health: {
      playSync,
      pocketBase,
    },
  };
}

function parseUnits(url) {
  try {
    const u = new URL(url, 'http://localhost');
    const raw = u.searchParams.get('units');
    if (!raw) return MONITOR_UNITS;
    const requested = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => MONITOR_UNITS.includes(s));
    return requested.length ? requested : MONITOR_UNITS;
  } catch {
    return MONITOR_UNITS;
  }
}

function streamLogs(req, res, units) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('meta', { units, at: new Date().toISOString() });

  const args = ['-f', '-n', '80', '-o', 'short-iso', '--no-pager'];
  for (const unit of units) {
    args.push('-u', unit);
  }

  let child;
  try {
    child = spawn('journalctl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    send('error', { message: e instanceof Error ? e.message : 'journalctl spawn failed' });
    res.end();
    return;
  }

  let buf = '';
  const onChunk = (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) send('log', { line, at: new Date().toISOString() });
    }
  };

  child.stdout.on('data', onChunk);
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim();
    if (text) send('error', { message: text });
  });
  child.on('error', (err) => {
    send('error', { message: err.message });
  });
  child.on('close', (code) => {
    send('meta', { closed: true, code });
    res.end();
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(ALLOWED_ORIGIN && req.headers.origin === ALLOWED_ORIGIN ? 204 : 403);
    res.end();
    return;
  }

  const path = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && (path === '/health' || path === '/monitor/health')) {
    json(res, 200, { ok: true, service: 'monitor' });
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  if (!(await requireAdmin(req, res))) return;

  if (path === '/stats' || path === '/monitor/stats') {
    try {
      const stats = await collectStats();
      json(res, 200, stats);
    } catch (e) {
      console.error('stats failed', e);
      json(res, 500, { ok: false, message: 'Impossible de collecter les stats.' });
    }
    return;
  }

  if (path === '/logs' || path === '/monitor/logs') {
    streamLogs(req, res, parseUnits(req.url || '/'));
    return;
  }

  json(res, 404, { ok: false, message: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Monitor listening on http://127.0.0.1:${PORT}`);
  console.log(`Units: ${MONITOR_UNITS.join(', ')}`);
});
