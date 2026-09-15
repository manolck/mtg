// src/services/pocketbase.ts
import PocketBase from 'pocketbase';

/**
 * PocketBase URL is required at build/dev time (VITE_POCKETBASE_URL).
 * No hardcoded production hostname or LAN IP fallback.
 */
function getPocketBaseUrl(): string {
  const envUrl = import.meta.env.VITE_POCKETBASE_URL?.trim();
  if (!envUrl) {
    throw new Error(
      'VITE_POCKETBASE_URL is required. Copy .env.example to .env.local (dev) or set the variable at build time (prod).'
    );
  }
  return envUrl;
}

const POCKETBASE_URL = getPocketBaseUrl();

export const pb = new PocketBase(POCKETBASE_URL);

pb.autoCancellation(false);

export default pb;
