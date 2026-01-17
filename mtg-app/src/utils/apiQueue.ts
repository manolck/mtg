/**
 * Système de queue pour les requêtes API avec gestion des priorités
 * 
 * - Limite le nombre de requêtes simultanées
 * - Traite les requêtes par ordre de priorité
 * - S'intègre avec fetchWithRetry pour le retry automatique
 */

export type Priority = 'high' | 'normal' | 'low';

interface QueuedRequest {
  id: string;
  priority: Priority;
  execute: () => Promise<Response>;
  resolve: (value: Response) => void;
  reject: (error: unknown) => void;
  createdAt: number;
}

class APIQueue {
  private queue: QueuedRequest[] = [];
  private running: Set<string> = new Set();
  private maxConcurrency: number;
  private requestIdCounter = 0;

  constructor(maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Priorité numérique (plus élevé = plus prioritaire)
   */
  private getPriorityValue(priority: Priority): number {
    switch (priority) {
      case 'high': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * Trie la queue par priorité (high > normal > low) puis par date de création
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDiff = this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt; // Plus ancien en premier si même priorité
    });
  }

  /**
   * Traite la prochaine requête dans la queue
   */
  private async processNext(): Promise<void> {
    // Si on a atteint la limite de concurrence, ne rien faire
    if (this.running.size >= this.maxConcurrency) {
      return;
    }

    // Trier la queue par priorité
    this.sortQueue();

    // Prendre la première requête disponible
    const request = this.queue.shift();
    if (!request) {
      return; // Plus de requêtes en attente
    }

    // Marquer comme en cours d'exécution
    this.running.add(request.id);

    try {
      // Exécuter la requête
      const response = await request.execute();
      request.resolve(response);
    } catch (error) {
      request.reject(error);
    } finally {
      // Retirer de la liste des requêtes en cours
      this.running.delete(request.id);
      
      // Traiter la prochaine requête
      this.processNext();
    }
  }

  /**
   * Ajoute une requête à la queue et la traite si possible
   * 
   * @param execute - Fonction qui exécute la requête fetch
   * @param priority - Priorité de la requête
   * @returns Promise<Response>
   */
  async enqueue(
    execute: () => Promise<Response>,
    priority: Priority = 'normal'
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req-${++this.requestIdCounter}`,
        priority,
        execute,
        resolve,
        reject,
        createdAt: Date.now(),
      };

      this.queue.push(request);
      this.processNext();
    });
  }

  /**
   * Retourne le nombre de requêtes en attente
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Retourne le nombre de requêtes en cours d'exécution
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Vide la queue (annule toutes les requêtes en attente)
   */
  clear(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

// Instance singleton pour toutes les requêtes Scryfall
export const scryfallQueue = new APIQueue(3); // Maximum 3 requêtes simultanées



