#!/usr/bin/env node
/**
 * Creates or updates play_* PocketBase collections from pocketbase/play-collections.json.
 *
 * Superuser credentials (one of):
 *   PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD
 *   PB_ADMIN_TOKEN (Authorization: TOKEN)
 *
 * URL:
 *   PB_URL or VITE_POCKETBASE_URL (default http://127.0.0.1:8090)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const collections = JSON.parse(readFileSync(join(root, 'pocketbase/play-collections.json'), 'utf8'));
const url = (process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const email = process.env.PB_ADMIN_EMAIL || '';
const password = process.env.PB_ADMIN_PASSWORD || '';
const tokenEnv = process.env.PB_ADMIN_TOKEN || '';

function mergeSchemaExport() {
  const exportPath = join(root, 'pocketbase_schema_export.json');
  const exported = JSON.parse(readFileSync(exportPath, 'utf8'));
  const merged = [...exported.filter((c) => !collections.some((p) => p.name === c.name)), ...collections];
  writeFileSync(exportPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Merged ${collections.length} play collections into pocketbase_schema_export.json`);
}

mergeSchemaExport();

if (process.argv.includes('--schema-only')) {
  process.exit(0);
}

async function authToken() {
  if (tokenEnv) return tokenEnv;
  if (!email || !password) {
    throw new Error(
      'Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (or PB_ADMIN_TOKEN) to apply play collections.'
    );
  }
  const res = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Superuser auth failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.token;
}

async function listCollections(token) {
  const res = await fetch(`${url}/api/collections?perPage=200`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`List collections failed (${res.status})`);
  const data = await res.json();
  return data.items || [];
}

async function upsert(token, col, existingByName) {
  const current = existingByName.get(col.name);
  const method = current ? 'PATCH' : 'POST';
  const endpoint = current ? `${url}/api/collections/${current.id}` : `${url}/api/collections`;
  const body = current ? { ...col, id: current.id } : col;
  const res = await fetch(endpoint, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${col.name} failed (${res.status}): ${text}`);
  }
  console.log(`${current ? 'Updated' : 'Created'} collection ${col.name}`);
}

const token = await authToken();
const existing = await listCollections(token);
const existingByName = new Map(existing.map((c) => [c.name, c]));
for (const col of collections) {
  await upsert(token, col, existingByName);
}
