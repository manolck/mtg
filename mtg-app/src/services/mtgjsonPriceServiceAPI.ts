/**
 * Service pour récupérer les prix des cartes depuis l'API backend
 * Le serveur télécharge et indexe le fichier MTGJSON
 * Le client fait des requêtes légères à l'API
 */

import { LRUCache } from '../utils/LRUCache';

// URL de l'API backend (Firebase Functions)
const API_BASE_URL = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 
  'https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net';

// Cache en mémoire pour les prix recherchés
const priceCache = new LRUCache<string, CardPrice>(1000, 24 * 60 * 60 * 1000); // 24h

export interface CardPrice {
  usd?: string;
  usdFoil?: string;
  eur?: string;
  eurFoil?: string;
  tix?: string;
}

/**
 * Vérifie si on est en mode développement
 */
function isDevelopment(): boolean {
  return import.meta.env.DEV || 
         import.meta.env.MODE === 'development' ||
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
}

/**
 * Vérifie si l'API backend est disponible
 */
async function isAPIAvailable(): Promise<boolean> {
  // En développement, on peut utiliser l'émulateur ou laisser tomber
  if (isDevelopment()) {
    // Vérifier si l'URL de l'API est configurée
    const apiUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL;
    if (!apiUrl || apiUrl.includes('YOUR-PROJECT-ID')) {
      return false; // API non configurée en dev
    }
    
    // Tester si l'API répond
    try {
      const response = await fetch(`${apiUrl}/getCardPrice?cardName=test`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // Timeout de 2 secondes
      });
      return response.status !== 404;
    } catch {
      return false; // API non disponible
    }
  }
  
  // En production, on suppose que l'API est disponible
  return true;
}

/**
 * Récupère le prix d'une carte depuis l'API backend
 */
export async function getCardPriceFromMTGJSON(
  cardName: string,
  setCode?: string
): Promise<CardPrice | null> {
  // Vérifier le cache en mémoire d'abord
  const cacheKey = `${cardName}_${setCode || 'any'}`;
  const cached = priceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // En développement, vérifier si l'API est disponible
  if (isDevelopment()) {
    const apiAvailable = await isAPIAvailable();
    if (!apiAvailable) {
      // En dev, si l'API n'est pas disponible, retourner null
      // Le fallback vers Scryfall se fera automatiquement dans priceService.ts
      // Ne pas afficher de message, c'est normal en développement
      return null;
    }
  }

  try {
    // Construire l'URL avec les paramètres
    const params = new URLSearchParams({ cardName });
    if (setCode) {
      params.append('setCode', setCode);
    }

    const response = await fetch(`${API_BASE_URL}/getCardPrice?${params.toString()}`, {
      signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
    });
    
    if (!response.ok) {
      console.warn(`Failed to get price from API: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const price = data.price as CardPrice | null;

    if (price) {
      priceCache.set(cacheKey, price);
    }

    return price;
  } catch (error) {
    // En développement, ne pas afficher d'erreur si l'API n'est pas disponible
    if (isDevelopment()) {
      console.log('MTGJSON API not available, using Scryfall fallback');
    } else {
      console.error('Error fetching card price from API:', error);
    }
    return null;
  }
}

/**
 * Vérifie si l'API est disponible
 */
export async function isMTGJSONInitialized(): Promise<boolean> {
  // En développement, vérifier si l'API est configurée
  if (isDevelopment()) {
    return isAPIAvailable();
  }
  
  try {
    // Essayer une requête simple pour vérifier si l'API répond
    const response = await fetch(`${API_BASE_URL}/getCardPrice?cardName=test`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.status !== 404;
  } catch {
    return false;
  }
}

/**
 * Attend que l'API soit disponible (pas d'action nécessaire côté client)
 */
export async function waitForMTGJSONInitialization(): Promise<void> {
  // Pas d'action nécessaire, l'API est toujours disponible
}

/**
 * Initialise le service (pas d'action nécessaire côté client)
 */
export async function initializeMTGJSONPrices(): Promise<void> {
  // Pas d'action nécessaire, le serveur gère tout
}

/**
 * Force la mise à jour des prix (appelle la Cloud Function)
 */
export async function updateMTGJSONPrices(): Promise<boolean> {
  // Vérifier que l'URL est configurée correctement
  if (API_BASE_URL.includes('YOUR-PROJECT-ID')) {
    // En développement, c'est normal que l'URL ne soit pas configurée
    if (isDevelopment()) {
      // Ne pas afficher de message en développement, c'est attendu
      return false;
    }
    console.warn('Firebase Functions URL not configured. Please set VITE_FIREBASE_FUNCTIONS_URL in your .env file');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/updateMTGJSONPrices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn('Cloud Function not found. Make sure it is deployed: firebase deploy --only functions');
        return false;
      }
      throw new Error(`Failed to update prices: ${response.status}`);
    }

    const data = await response.json();
    return data.success === true;
  } catch (error: any) {
    // Ne pas afficher d'erreur CORS si c'est juste que la fonction n'existe pas
    if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
      console.warn('Cloud Function not accessible. Make sure it is deployed and CORS is configured.');
    } else {
      console.error('Error updating prices:', error);
    }
    return false;
  }
}

/**
 * Obtient la date de la dernière mise à jour
 */
export async function getLastUpdateDate(): Promise<Date | null> {
  try {
    // Récupérer depuis Firestore via l'API ou directement
    // Pour simplifier, on peut stocker ça dans localStorage côté client
    const lastUpdateStr = localStorage.getItem('mtgjson_last_update');
    if (lastUpdateStr) {
      return new Date(lastUpdateStr);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Vérifie si une mise à jour est nécessaire
 */
export function shouldUpdatePrices(): boolean {
  try {
    const lastUpdateStr = localStorage.getItem('mtgjson_last_update');
    if (!lastUpdateStr) {
      return true;
    }

    const lastUpdate = new Date(lastUpdateStr);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceUpdate >= 15; // 2 fois par mois
  } catch {
    return false;
  }
}

