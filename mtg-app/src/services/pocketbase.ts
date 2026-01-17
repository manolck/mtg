// src/services/pocketbase.ts
import PocketBase from 'pocketbase';

/**
 * Détermine l'URL de PocketBase en fonction de l'environnement
 * - En production HTTPS, utilise HTTPS pour éviter les erreurs Mixed Content
 * - En développement, utilise HTTP local
 */
const getPocketBaseUrl = (): string => {
  // Priorité 1 : Variable d'environnement explicite
  const envUrl = import.meta.env.VITE_POCKETBASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // Priorité 2 : Détection automatique basée sur le protocole de la page
  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    
    if (isHttps) {
      // En production HTTPS, utiliser HTTPS pour PocketBase
      // Remplacez par votre URL HTTPS de PocketBase
      return 'https://pb.mtg-app.duckdns.org';
    }
  }

  // Priorité 3 : Développement local (HTTP)
  return 'http://192.168.1.62:8090';
};

const POCKETBASE_URL = getPocketBaseUrl();

// Créer une instance singleton
export const pb = new PocketBase(POCKETBASE_URL);

// Optionnel : Configurer l'auto-refresh du token
pb.autoCancellation(false);

export default pb;