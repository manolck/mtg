/**
 * Rate limiter pour les requêtes API
 * Empêche le spam et respecte les limites des APIs externes
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Vérifie si une requête peut être effectuée
   * @param key Identifiant unique (ex: userId, IP)
   * @param config Configuration du rate limit
   * @returns true si la requête est autorisée
   */
  canMakeRequest(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Nettoyer les requêtes anciennes
    const recentRequests = requests.filter(
      (timestamp) => now - timestamp < config.windowMs
    );

    // Vérifier la limite
    if (recentRequests.length >= config.maxRequests) {
      return false;
    }

    // Ajouter la nouvelle requête
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  /**
   * Réinitialise le rate limiter pour une clé
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Nettoie les entrées anciennes
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(
        (timestamp) => now - timestamp < 60000 // Garder 1 minute
      );
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }
}

// Instance globale
export const rateLimiter = new RateLimiter();

// Nettoyage périodique
if (typeof window !== 'undefined') {
  setInterval(() => {
    rateLimiter.cleanup();
  }, 60000); // Toutes les minutes
}

// Configurations par défaut
export const RATE_LIMITS = {
  // Import CSV : 10 imports par heure
  IMPORT: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 heure
  },
  // API Scryfall : 50 requêtes par minute
  SCRYFALL: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  },
  // Login : 5 tentatives par 15 minutes
  LOGIN: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
} as const;


