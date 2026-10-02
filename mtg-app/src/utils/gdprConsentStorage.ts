const STORAGE_PREFIX = 'mtg-gdpr-consent:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function hasLocalGdprConsent(userId: string | null | undefined): boolean {
  if (!userId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function rememberLocalGdprConsent(userId: string): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function forgetLocalGdprConsent(userId: string | null | undefined): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; statusCode?: number; response?: { code?: number } };
  return err.status === 404 || err.statusCode === 404 || err.response?.code === 404;
}
