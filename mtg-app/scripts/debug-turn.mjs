/**
 * Probe TURN/STUN hosts from VITE_ICE_SERVERS or CLI args.
 * Does not print credentials. Usage:
 *   node scripts/debug-turn.mjs
 *   node scripts/debug-turn.mjs turn.mtg-app.duckdns.org
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import dgram from 'node:dgram';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvIceServers() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return process.env.VITE_ICE_SERVERS || '';
  const text = readFileSync(envPath, 'utf8');
  const line = text.split(/\r?\n/).find((row) => row.startsWith('VITE_ICE_SERVERS='));
  if (!line) return process.env.VITE_ICE_SERVERS || '';
  return line.slice('VITE_ICE_SERVERS='.length).trim().replace(/^['"]|['"]$/g, '');
}

function hostsFromIceJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const hosts = [];
    for (const server of parsed) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      for (const url of urls) {
        if (typeof url !== 'string') continue;
        const match = /^(turns?):(?:\/\/)?([^:/?]+)(?::(\d+))?/i.exec(url.trim());
        if (!match) continue;
        hosts.push({
          scheme: match[1].toLowerCase(),
          host: match[2],
          port: Number(match[3] || (match[1].toLowerCase() === 'turns' ? 5349 : 3478)),
          url: url.split('?')[0],
        });
      }
    }
    return hosts;
  } catch {
    return [];
  }
}

function tcpProbe(host, port, timeoutMs = 4000) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolveProbe(false);
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolveProbe(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolveProbe(false);
    });
  });
}

function stunBinding(host, port, timeoutMs = 4000) {
  return new Promise((resolveProbe) => {
    const tx = Buffer.alloc(20);
    tx.writeUInt16BE(0x0001, 0);
    tx.writeUInt16BE(0x0000, 2);
    tx.writeUInt32BE(0x2112a442, 4);
    for (let i = 8; i < 20; i += 1) tx[i] = Math.floor(Math.random() * 256);
    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      resolveProbe(false);
    }, timeoutMs);
    socket.on('message', (msg) => {
      clearTimeout(timer);
      socket.close();
      resolveProbe(msg.length >= 20 && msg.readUInt16BE(0) === 0x0101);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolveProbe(false);
    });
    socket.send(tx, port, host);
  });
}

const cliHost = process.argv[2];
const iceRaw = loadEnvIceServers();
const fromEnv = hostsFromIceJson(iceRaw);
const targets = cliHost
  ? [
      { scheme: 'turn', host: cliHost, port: 3478, url: `turn:${cliHost}:3478` },
      { scheme: 'turns', host: cliHost, port: 5349, url: `turns:${cliHost}:5349` },
    ]
  : fromEnv;

console.log('VITE_ICE_SERVERS:', iceRaw ? 'présent (.env.local)' : 'absent (STUN public seulement)');
if (!targets.length) {
  console.log('Aucun hôte TURN à tester. Passez un hostname: node scripts/debug-turn.mjs turn.example.com');
  process.exit(fromEnv.length || iceRaw ? 1 : 0);
}

for (const target of targets) {
  let ip = '';
  try {
    const looked = await dns.lookup(target.host);
    ip = looked.address;
  } catch (error) {
    console.log(`${target.url}  DNS FAIL  ${error.message}`);
    continue;
  }
  const tcp = await tcpProbe(target.host, target.port);
  const udp = target.scheme === 'turns' ? 'n/a' : (await stunBinding(target.host, target.port)) ? 'ok' : 'fail';
  console.log(
    `${target.url}  ${ip}:${target.port}  tcp=${tcp ? 'ok' : 'fail'}  udp-stun=${udp}`,
  );
}
