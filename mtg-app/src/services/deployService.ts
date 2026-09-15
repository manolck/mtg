/**
 * Triggers a server build/reload via webhook.
 * Configure VITE_DEPLOY_HOOK_URL at build time (public URL only).
 * Auth is the PocketBase admin session (X-PocketBase-Auth) — never a VITE_* secret.
 */

import { pb } from './pocketbase';

const DEPLOY_HOOK_URL = import.meta.env.VITE_DEPLOY_HOOK_URL as string | undefined;

export interface DeployResult {
  ok: boolean;
  message: string;
}

export function isDeployConfigured(): boolean {
  return Boolean(DEPLOY_HOOK_URL?.trim());
}

export async function triggerDeploy(): Promise<DeployResult> {
  if (!DEPLOY_HOOK_URL?.trim()) {
    return { ok: false, message: 'Déploiement non configuré (VITE_DEPLOY_HOOK_URL manquant).' };
  }

  const pbToken = pb.authStore.token;
  if (!pbToken) {
    return { ok: false, message: 'Session expirée. Reconnectez-vous.' };
  }

  try {
    const res = await fetch(DEPLOY_HOOK_URL.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PocketBase-Auth': pbToken,
      },
      signal: AbortSignal.timeout(120_000),
    });

    const text = await res.text();
    let data: { ok?: boolean; message?: string };
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: res.ok ? 'Déploiement terminé.' : `Erreur serveur ${res.status}` };
    }

    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Erreur serveur ${res.status}`,
      };
    }

    return {
      ok: data.ok ?? true,
      message: data.message ?? 'Déploiement terminé.',
    };
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return {
      ok: false,
      message: isAbort ? 'Délai dépassé (timeout).' : 'Erreur réseau.',
    };
  }
}
