/**
 * Service pour déclencher un build/reload sur le serveur via un webhook.
 * Configure avec VITE_DEPLOY_HOOK_URL et VITE_DEPLOY_TOKEN (build time).
 * Si le webhook exige un admin, le token PocketBase est envoyé (X-PocketBase-Auth).
 */

import { pb } from './pocketbase';

const DEPLOY_HOOK_URL = import.meta.env.VITE_DEPLOY_HOOK_URL as string | undefined;
const DEPLOY_TOKEN = import.meta.env.VITE_DEPLOY_TOKEN as string | undefined;

export interface DeployResult {
  ok: boolean;
  message: string;
  output?: string;
  error?: string;
}

export function isDeployConfigured(): boolean {
  return Boolean(DEPLOY_HOOK_URL?.trim());
}

/**
 * Déclenche le script de mise à jour sur le serveur (git pull, npm install, build, reload nginx).
 * L'URL et le token doivent être configurés au build (variables d'environnement VITE_*).
 */
export async function triggerDeploy(): Promise<DeployResult> {
  if (!DEPLOY_HOOK_URL?.trim()) {
    return { ok: false, message: 'Déploiement non configuré (VITE_DEPLOY_HOOK_URL manquant).' };
  }

  const url = DEPLOY_HOOK_URL.trim();
  const token = DEPLOY_TOKEN?.trim();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Envoyer le token PocketBase pour que le webhook puisse vérifier que l'appelant est admin
    const pbToken = pb.authStore.token;
    if (pbToken) {
      headers['X-PocketBase-Auth'] = pbToken;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: token ? JSON.stringify({ token }) : undefined,
      signal: AbortSignal.timeout(120_000), // 2 min max
    });

    const text = await res.text();
    let data: { ok?: boolean; message?: string; output?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Erreur serveur ${res.status}`,
        error: data.error || text,
        output: data.output,
      };
    }

    return {
      ok: data.ok ?? true,
      message: data.message ?? 'Déploiement terminé.',
      output: data.output,
      error: data.error,
    };
  } catch (err: any) {
    const message = err.name === 'AbortError'
      ? 'Délai dépassé (timeout).'
      : (err.message || 'Erreur réseau.');
    return { ok: false, message, error: String(err) };
  }
}
