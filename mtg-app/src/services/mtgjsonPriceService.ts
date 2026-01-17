/**
 * Service pour récupérer les prix des cartes depuis MTGJSON
 * Utilise les fichiers statiques AllPrices.json
 * Documentation: https://mtgjson.com/
 * 
 * Les fichiers sont téléchargés et mis en cache localement
 * Mise à jour automatique 2 fois par mois
 */

import { LRUCache } from '../utils/LRUCache';

// URL de téléchargement MTGJSON
// Documentation: https://mtgjson.com/downloads/all-files/
const MTGJSON_PRICES_URL = 'https://mtgjson.com/api/v5/AllPrices.json';
// Alternative: https://mtgjson.com/api/v5/AllPrices.json.zip (format compressé)
const MTGJSON_PRICES_FILE_KEY = 'mtgjson_prices';
const MTGJSON_LAST_UPDATE_KEY = 'mtgjson_last_update';
const UPDATE_INTERVAL_DAYS = 60; // Mise à jour tous les 2 mois (60 jours)

// Cache en mémoire pour les prix recherchés
const priceCache = new LRUCache<string, CardPrice>(1000, 24 * 60 * 60 * 1000); // 24h

export interface CardPrice {
  usd?: string;
  usdFoil?: string;
  eur?: string;
  eurFoil?: string;
  tix?: string;
}

interface MTGJSONPriceData {
  data: {
    [cardName: string]: {
      [setCode: string]: {
        paper?: {
          cardmarket?: {
            retail?: {
              normal?: number;
              foil?: number;
            };
            buylist?: {
              normal?: number;
              foil?: number;
            };
          };
          tcgplayer?: {
            retail?: {
              normal?: number;
              foil?: number;
            };
            buylist?: {
              normal?: number;
              foil?: number;
            };
          };
        };
        mtgo?: {
          cardhoarder?: {
            retail?: {
              normal?: number;
              foil?: number;
            };
            buylist?: {
              normal?: number;
              foil?: number;
            };
          };
        };
      };
    };
  };
  meta?: {
    date?: string;
    version?: string;
  };
}

/**
 * Vérifie si une mise à jour est nécessaire
 */
export function shouldUpdatePrices(): boolean {
  try {
    const lastUpdateStr = localStorage.getItem(MTGJSON_LAST_UPDATE_KEY);
    if (!lastUpdateStr) {
      return true; // Pas encore téléchargé
    }

    const lastUpdate = new Date(lastUpdateStr);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceUpdate >= UPDATE_INTERVAL_DAYS;
  } catch (error) {
    console.error('Error checking update status:', error);
    return true; // En cas d'erreur, forcer la mise à jour
  }
}

/**
 * Télécharge le fichier AllPrices.json depuis MTGJSON
 * @param removeOldFirst Si true, supprime l'ancien fichier avant de télécharger le nouveau
 */
export async function downloadPricesFile(removeOldFirst: boolean = false): Promise<MTGJSONPriceData | null> {
  // Sauvegarder l'ancien fichier en cas d'échec (déclaré en dehors du try pour être accessible dans le catch)
  let oldData: string | null = null;
  let oldUpdateDate: string | null = null;
  
  try {
    if (removeOldFirst) {
      // Sauvegarder l'ancien pour pouvoir le restaurer en cas d'échec
      oldData = localStorage.getItem(MTGJSON_PRICES_FILE_KEY);
      oldUpdateDate = localStorage.getItem(MTGJSON_LAST_UPDATE_KEY);
      
      // Supprimer l'ancien fichier pour libérer de l'espace
      localStorage.removeItem(MTGJSON_PRICES_FILE_KEY);
      localStorage.removeItem(MTGJSON_LAST_UPDATE_KEY);
      console.log('Removed old MTGJSON prices file to free up space');
    }
    
    console.log('Downloading MTGJSON prices file...');
    const response = await fetch(MTGJSON_PRICES_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to download prices: ${response.status}`);
    }

    const data: MTGJSONPriceData = await response.json();
    
    // Sauvegarder dans localStorage
    // NOTE: Le fichier AllPrices.json peut être volumineux (~50-100 MB)
    // Si localStorage est plein, on ne peut pas le stocker
    try {
      const jsonString = JSON.stringify(data);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      if (sizeInMB > 5) {
        console.warn(`MTGJSON file is large (${sizeInMB.toFixed(2)} MB). localStorage may not be able to store it.`);
      }
      
      localStorage.setItem(MTGJSON_PRICES_FILE_KEY, jsonString);
      localStorage.setItem(MTGJSON_LAST_UPDATE_KEY, new Date().toISOString());
      console.log(`MTGJSON prices file downloaded and cached (${sizeInMB.toFixed(2)} MB)`);
    } catch (storageError: any) {
      // Si localStorage est plein, restaurer l'ancien fichier si on l'avait supprimé
      if (removeOldFirst && oldData && oldUpdateDate) {
        try {
          localStorage.setItem(MTGJSON_PRICES_FILE_KEY, oldData);
          localStorage.setItem(MTGJSON_LAST_UPDATE_KEY, oldUpdateDate);
          console.warn('Restored old MTGJSON prices file due to storage error');
        } catch (restoreError) {
          console.error('Failed to restore old file:', restoreError);
        }
      }
      
      // Si localStorage est plein, on ne peut pas stocker le fichier
      if (storageError.name === 'QuotaExceededError') {
        console.warn('LocalStorage full! MTGJSON file is too large. Prices will be loaded from network each time.');
        console.warn('Consider using IndexedDB for large files in a future update.');
        // On retourne quand même les données pour cette session
      } else {
        console.error('Error saving to localStorage:', storageError);
      }
    }

    return data;
  } catch (error) {
    console.error('Error downloading MTGJSON prices:', error);
    
    // En cas d'échec, restaurer l'ancien fichier si on l'avait supprimé
    if (removeOldFirst && oldData && oldUpdateDate) {
      try {
        localStorage.setItem(MTGJSON_PRICES_FILE_KEY, oldData);
        localStorage.setItem(MTGJSON_LAST_UPDATE_KEY, oldUpdateDate);
        console.log('Restored old MTGJSON prices file after download failure');
      } catch (restoreError) {
        console.error('Failed to restore old file:', restoreError);
      }
    }
    
    return null;
  }
}

/**
 * Charge les prix depuis le cache local ou télécharge si nécessaire
 * @param forceUpdate Si true, force le téléchargement même si le cache est récent
 * @param allowDownload Si false, ne télécharge pas même si le cache est vide (utilise uniquement le cache)
 */
async function loadPricesData(forceUpdate: boolean = false, allowDownload: boolean = true): Promise<MTGJSONPriceData | null> {
  // Essayer d'abord de charger depuis le cache
  try {
    const cached = localStorage.getItem(MTGJSON_PRICES_FILE_KEY);
    if (cached) {
      const data: MTGJSONPriceData = JSON.parse(cached);
      console.log('Loaded MTGJSON prices from cache');
      
      // Si on ne force pas la mise à jour et qu'on a des données en cache, les retourner
      if (!forceUpdate) {
        return data;
      }
    }
  } catch (error) {
    console.error('Error loading cached prices:', error);
  }

  // Si pas de cache et qu'on autorise le téléchargement, télécharger
  if (allowDownload) {
    // Si une mise à jour est nécessaire, supprimer l'ancien fichier
    const needsUpdate = shouldUpdatePrices();
    return downloadPricesFile(needsUpdate || forceUpdate);
  }

  // Si pas de cache et qu'on n'autorise pas le téléchargement, retourner null
  return null;
}

/**
 * Recherche le prix d'une carte dans les données MTGJSON
 */
function findCardPrice(
  pricesData: MTGJSONPriceData,
  cardName: string,
  setCode?: string
): CardPrice | null {
  if (!pricesData?.data) {
    return null;
  }

  // Normaliser le nom de la carte (insensible à la casse)
  const normalizedName = cardName.toLowerCase().trim();
  
  // Chercher la carte par nom exact d'abord
  let cardData = pricesData.data[cardName];
  
  // Si pas trouvé, chercher avec recherche insensible à la casse
  if (!cardData) {
    const matchingKey = Object.keys(pricesData.data).find(
      key => key.toLowerCase() === normalizedName
    );
    if (matchingKey) {
      cardData = pricesData.data[matchingKey];
    }
  }

  if (!cardData) {
    return null;
  }

  // Si un set est spécifié, chercher dans ce set
  if (setCode) {
    const setData = cardData[setCode.toUpperCase()];
    if (setData) {
      return extractPriceFromSetData(setData);
    }
  }

  // Sinon, prendre le premier set disponible (ou moyen de tous les sets)
  const sets = Object.values(cardData);
  if (sets.length === 0) {
    return null;
  }

  // Prendre le premier set (ou calculer une moyenne)
  return extractPriceFromSetData(sets[0]);
}

/**
 * Extrait les prix depuis les données d'un set
 */
function extractPriceFromSetData(setData: any): CardPrice | null {
  const prices: CardPrice = {};

  // Priorité: Cardmarket (EUR) > TCGplayer (USD) > MTGO (TIX)
  if (setData.paper?.cardmarket?.retail) {
    const cardmarket = setData.paper.cardmarket.retail;
    if (cardmarket.normal !== undefined) {
      prices.eur = cardmarket.normal.toString();
    }
    if (cardmarket.foil !== undefined) {
      prices.eurFoil = cardmarket.foil.toString();
    }
  }

  if (setData.paper?.tcgplayer?.retail) {
    const tcgplayer = setData.paper.tcgplayer.retail;
    if (tcgplayer.normal !== undefined) {
      prices.usd = tcgplayer.normal.toString();
    }
    if (tcgplayer.foil !== undefined) {
      prices.usdFoil = tcgplayer.foil.toString();
    }
  }

  if (setData.mtgo?.cardhoarder?.retail) {
    const cardhoarder = setData.mtgo.cardhoarder.retail;
    if (cardhoarder.normal !== undefined) {
      prices.tix = cardhoarder.normal.toString();
    }
  }

  // Retourner null si aucun prix trouvé
  if (!prices.usd && !prices.eur && !prices.tix) {
    return null;
  }

  return prices;
}

// Variable globale pour stocker les données de prix chargées
let cachedPricesData: MTGJSONPriceData | null = null;
let pricesDataPromise: Promise<MTGJSONPriceData | null> | null = null;

/**
 * Vérifie si MTGJSON est déjà initialisé ou en cours d'initialisation
 */
export function isMTGJSONInitialized(): boolean {
  // Si on a des données en mémoire ou une promesse en cours, c'est initialisé
  if (cachedPricesData !== null || pricesDataPromise !== null) {
    return true;
  }
  
  // Si on a un cache dans localStorage, on considère que c'est initialisé
  // (même si pas encore chargé en mémoire)
  try {
    return localStorage.getItem(MTGJSON_PRICES_FILE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Attend que MTGJSON soit initialisé (si une initialisation est en cours)
 */
export async function waitForMTGJSONInitialization(): Promise<void> {
  if (pricesDataPromise) {
    await pricesDataPromise;
  }
}

/**
 * Initialise le chargement des prix (appelé une fois au démarrage)
 * - Si pas de cache : télécharge le fichier immédiatement
 * - Si cache existe : charge depuis le cache, puis met à jour en arrière-plan si nécessaire (> 2 mois)
 */
export async function initializeMTGJSONPrices(): Promise<void> {
  // Si une initialisation est déjà en cours, attendre qu'elle se termine
  if (pricesDataPromise) {
    await pricesDataPromise;
    return;
  }

  // Si les données sont déjà en cache en mémoire, pas besoin de recharger
  if (cachedPricesData) {
    return;
  }

  // Vérifier si on a déjà un fichier en cache
  const hasCache = localStorage.getItem(MTGJSON_PRICES_FILE_KEY) !== null;
  
  if (hasCache) {
    // Si on a un cache, charger depuis le cache d'abord (rapide)
    pricesDataPromise = loadPricesData(false, false); // Ne pas télécharger si cache existe
    cachedPricesData = await pricesDataPromise;
    
    // NE PAS vérifier shouldUpdatePrices() ici car cela déclencherait un téléchargement
    // La mise à jour en arrière-plan se fait UNIQUEMENT au démarrage de l'app (dans App.tsx)
    // et seulement si la dernière mise à jour date de plus de 2 mois
  } else {
    // Si pas de cache, télécharger immédiatement (premier démarrage)
    console.log('No MTGJSON cache found, downloading prices file...');
    pricesDataPromise = loadPricesData(false, true); // Autoriser le téléchargement
    cachedPricesData = await pricesDataPromise;
  }
}

/**
 * Récupère le prix d'une carte depuis MTGJSON
 */
export async function getCardPriceFromMTGJSON(
  cardName: string,
  setCode?: string
): Promise<CardPrice | null> {
  // Vérifier le cache en mémoire
  const cacheKey = `${cardName}_${setCode || 'any'}`;
  const cached = priceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // S'assurer que les données sont chargées
  // Si pas encore initialisé, charger depuis le cache uniquement (ne pas télécharger)
  if (!cachedPricesData && !pricesDataPromise) {
    // Vérifier si on a un cache avant d'initialiser
    const hasCache = localStorage.getItem(MTGJSON_PRICES_FILE_KEY) !== null;
    if (hasCache) {
      // Si cache existe, charger depuis le cache sans télécharger
      pricesDataPromise = loadPricesData(false, false);
      cachedPricesData = await pricesDataPromise;
    } else {
      // Si pas de cache, initialiser (va télécharger au démarrage uniquement)
      await initializeMTGJSONPrices();
    }
  }

  // Attendre que les données soient chargées
  if (pricesDataPromise && !cachedPricesData) {
    cachedPricesData = await pricesDataPromise;
  }

  if (!cachedPricesData) {
    return null;
  }

  // Rechercher le prix
  const price = findCardPrice(cachedPricesData, cardName, setCode);
  
  if (price) {
    priceCache.set(cacheKey, price);
  }

  return price;
}

/**
 * Force la mise à jour des prix (appelé manuellement ou automatiquement)
 * Supprime l'ancien fichier avant de télécharger le nouveau
 */
export async function updateMTGJSONPrices(): Promise<boolean> {
  try {
    // Supprimer l'ancien fichier avant de télécharger le nouveau
    const data = await downloadPricesFile(true);
    if (data) {
      cachedPricesData = data;
      priceCache.clear(); // Vider le cache en mémoire pour forcer le rechargement
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating MTGJSON prices:', error);
    return false;
  }
}

/**
 * Obtient la date de la dernière mise à jour
 */
export function getLastUpdateDate(): Date | null {
  try {
    const lastUpdateStr = localStorage.getItem(MTGJSON_LAST_UPDATE_KEY);
    if (!lastUpdateStr) {
      return null;
    }
    return new Date(lastUpdateStr);
  } catch (error) {
    return null;
  }
}

