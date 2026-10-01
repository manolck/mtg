/**
 * Safe access to Vite env that also works under Jest (CJS),
 * where a static `import.meta` is a SyntaxError.
 */
export type ViteEnvLike = {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  SSR?: boolean;
  BASE_URL?: string;
  VITE_SENTRY_DSN?: string;
  VITE_PRICE_API_URL?: string;
  VITE_POCKETBASE_URL?: string;
  VITE_RAPIDOCR_URL?: string;
  VITE_PLAY_WS_URL?: string;
  VITE_MONITOR_URL?: string;
  VITE_DEPLOY_HOOK_URL?: string;
  VITE_ICE_SERVERS?: string;
  [key: string]: unknown;
};

export function getViteEnv(): ViteEnvLike {
  try {
    // Built as a string so TypeScript/Jest CJS never parse a real import.meta token.
    return new Function('return import.meta.env')() as ViteEnvLike;
  } catch {
    const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const env = nodeProcess?.env || {};
    return {
      MODE: env.NODE_ENV || 'test',
      DEV: env.NODE_ENV !== 'production',
      PROD: env.NODE_ENV === 'production',
      SSR: false,
      BASE_URL: '/',
      VITE_SENTRY_DSN: env.VITE_SENTRY_DSN,
      VITE_PRICE_API_URL: env.VITE_PRICE_API_URL || '',
      VITE_POCKETBASE_URL: env.VITE_POCKETBASE_URL,
    };
  }
}
