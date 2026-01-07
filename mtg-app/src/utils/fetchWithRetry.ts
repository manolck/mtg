/**
 * Fonction fetch avec retry et backoff exponentiel
 * Gère automatiquement les erreurs réseau et les rate limits (429)
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 seconde
  maxDelay: 16000, // 16 secondes
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504], // Rate limit et erreurs serveur
};

/**
 * Calcule le délai pour le prochain retry avec backoff exponentiel
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelay);
}

/**
 * Vérifie si une erreur est retryable
 */
function isRetryableError(
  error: unknown,
  status?: number,
  retryableStatuses: number[] = DEFAULT_OPTIONS.retryableStatuses
): boolean {
  // Erreur réseau (pas de status)
  if (!status) {
    return error instanceof TypeError && error.message.includes('fetch');
  }
  
  // Erreur HTTP avec status retryable
  return retryableStatuses.includes(status);
}

/**
 * Effectue une requête fetch avec retry automatique et backoff exponentiel
 * 
 * @param url - URL à appeler
 * @param init - Options de fetch (identique à fetch standard)
 * @param options - Options de retry
 * @returns Promise<Response>
 * 
 * @example
 * const response = await fetchWithRetry('https://api.example.com/data', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Si la réponse est OK, la retourner directement
      if (response.ok) {
        return response;
      }

      // Si c'est une erreur non-retryable (404, 401, etc.), la retourner immédiatement
      if (!isRetryableError(null, response.status, opts.retryableStatuses)) {
        return response;
      }

      // Erreur retryable, préparer le retry
      lastStatus = response.status;
      
      // Si c'est le dernier essai, retourner la réponse d'erreur
      if (attempt === opts.maxRetries) {
        return response;
      }

      // Attendre avant de réessayer (backoff exponentiel)
      const delay = calculateDelay(attempt, opts);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Continuer la boucle pour réessayer
      continue;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Si ce n'est pas une erreur retryable, la propager immédiatement
      if (!isRetryableError(error)) {
        throw error;
      }

      // Si c'est le dernier essai, propager l'erreur
      if (attempt === opts.maxRetries) {
        throw error;
      }

      // Attendre avant de réessayer (backoff exponentiel)
      const delay = calculateDelay(attempt, opts);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Ne devrait jamais arriver ici, mais au cas où
  if (lastError) {
    throw lastError;
  }

  throw new Error(`Failed to fetch after ${opts.maxRetries + 1} attempts`);
}

