/**
 * Cache LRU (Least Recently Used) générique
 * Limite la taille du cache et supprime automatiquement les entrées les moins récemment utilisées
 */
export class LRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }>;
  private maxSize: number;
  private ttl?: number; // Time to live en millisecondes (optionnel)

  constructor(maxSize: number, ttl?: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Récupère une valeur du cache
   * Retourne null si la clé n'existe pas ou si l'entrée a expiré
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Déplacer l'entrée à la fin (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Ajoute ou met à jour une valeur dans le cache
   */
  set(key: K, value: V): void {
    // Si la clé existe déjà, la mettre à jour et la déplacer à la fin
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Si le cache est plein, supprimer l'entrée la moins récemment utilisée (la première)
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Ajouter la nouvelle entrée à la fin
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Supprime une entrée du cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Vide le cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Retourne la taille actuelle du cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Nettoie les entrées expirées
   * Utile pour appeler périodiquement si TTL est utilisé
   */
  cleanup(): number {
    if (!this.ttl) {
      return 0;
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Retourne toutes les clés du cache
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Retourne toutes les valeurs du cache
   */
  values(): IterableIterator<V> {
    return Array.from(this.cache.values()).map(entry => entry.value).values();
  }
}


