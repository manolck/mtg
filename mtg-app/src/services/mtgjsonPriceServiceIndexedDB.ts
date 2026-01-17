/**
 * Service pour récupérer les prix des cartes depuis MTGJSON
 * Utilise IndexedDB pour stocker le fichier sans le charger en mémoire
 * Parcourt le fichier uniquement quand on a besoin d'un prix spécifique
 * 
 * Documentation: https://mtgjson.com/
 */

import { storeRawFile, getRawFile, setItem, getItem, hasItem, removeItem } from '../utils/indexedDB';
import { LRUCache } from '../utils/LRUCache';

// URL de téléchargement MTGJSON
const MTGJSON_PRICES_URL = 'https://mtgjson.com/api/v5/AllPrices.json';
const MTGJSON_PRICES_FILE_KEY = 'mtgjson_prices_file';
const MTGJSON_LAST_UPDATE_KEY = 'mtgjson_last_update';
const UPDATE_INTERVAL_DAYS = 15; // Mise à jour 2 fois par mois (tous les 15 jours)

// Cache en mémoire pour les prix recherchés (évite de reparcourir le fichier)
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
          };
          tcgplayer?: {
            retail?: {
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
 * Télécharge le fichier AllPrices.json et le stocke dans IndexedDB
 * Indexe ensuite le fichier pour permettre des recherches rapides
 */
export async function downloadPricesFile(removeOldFirst: boolean = false): Promise<boolean> {
  try {
    if (removeOldFirst) {
      // Supprimer l'ancien fichier et l'index
      try {
        await removeItem('metadata', MTGJSON_PRICES_FILE_KEY);
        await removeItem('metadata', 'mtgjson_indexed');
        
        // Supprimer toutes les cartes de l'index
        const db = await import('../utils/indexedDB').then(m => m.openDB());
        const transaction = db.transaction(['mtgjson_prices'], 'readwrite');
        const store = transaction.objectStore('mtgjson_prices');
        await new Promise<void>((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        
        localStorage.removeItem(MTGJSON_LAST_UPDATE_KEY);
        console.log('Removed old MTGJSON prices file and index');
      } catch (error) {
        console.warn('Error removing old file:', error);
      }
    }

    console.log('Downloading MTGJSON prices file...');
    const response = await fetch(MTGJSON_PRICES_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to download prices: ${response.status}`);
    }

    // Récupérer le fichier comme Blob
    const blob = await response.blob();
    const sizeInMB = blob.size / (1024 * 1024);
    console.log(`Downloaded MTGJSON prices file (${sizeInMB.toFixed(2)} MB)`);

    // Stocker le Blob dans IndexedDB
    await storeRawFile(MTGJSON_PRICES_FILE_KEY, blob);
    localStorage.setItem(MTGJSON_LAST_UPDATE_KEY, new Date().toISOString());
    
    console.log('MTGJSON prices file stored in IndexedDB');
    
    // Indexer le fichier en arrière-plan (ne bloque pas)
    indexPricesFile().catch(error => {
      console.warn('Error indexing prices file:', error);
    });
    
    return true;
  } catch (error) {
    console.error('Error downloading MTGJSON prices:', error);
    return false;
  }
}

/**
 * Indexe le fichier JSON dans IndexedDB (une entrée par carte)
 * Permet de rechercher uniquement les prix nécessaires sans charger tout le fichier
 */
async function indexPricesFile(): Promise<void> {
  try {
    // Vérifier si l'index existe déjà
    const indexed = await getItem<boolean>('metadata', 'mtgjson_indexed');
    if (indexed) {
      return; // Déjà indexé
    }

    console.log('Indexing MTGJSON prices file...');
    
    // Récupérer le fichier depuis IndexedDB
    const blob = await getRawFile(MTGJSON_PRICES_FILE_KEY);
    if (!blob) {
      throw new Error('Prices file not found in IndexedDB');
    }

    // Parser le fichier une seule fois
    const text = await blob.text();
    const data: MTGJSONPriceData = JSON.parse(text);

    if (!data?.data) {
      throw new Error('Invalid prices file format');
    }

    // Indexer chaque carte dans IndexedDB
    const db = await import('../utils/indexedDB').then(m => m.openDB());
    const transaction = db.transaction(['mtgjson_prices'], 'readwrite');
    const store = transaction.objectStore('mtgjson_prices');

    let indexedCount = 0;
    const cardNames = Object.keys(data.data);
    
    // Indexer par batch pour éviter de bloquer le navigateur
    const batchSize = 100;
    for (let i = 0; i < cardNames.length; i += batchSize) {
      const batch = cardNames.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(cardName => {
          return new Promise<void>((resolve, reject) => {
            const request = store.put({
              cardName,
              data: data.data[cardName],
            });
            request.onsuccess = () => {
              indexedCount++;
              resolve();
            };
            request.onerror = () => reject(request.error);
          });
        })
      );

      // Petit délai pour ne pas bloquer l'UI
      if (i + batchSize < cardNames.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Marquer comme indexé
    await setItem('metadata', 'mtgjson_indexed', true);
    console.log(`Indexed ${indexedCount} cards in IndexedDB`);
  } catch (error) {
    console.error('Error indexing prices file:', error);
    throw error;
  }
}

/**
 * Recherche le prix d'une carte spécifique dans IndexedDB
 * Ne charge que cette carte, pas tout le fichier
 */
async function findCardPriceInIndexedDB(
  cardName: string,
  setCode?: string
): Promise<CardPrice | null> {
  try {
    const db = await import('../utils/indexedDB').then(m => m.openDB());
    const transaction = db.transaction(['mtgjson_prices'], 'readonly');
    const store = transaction.objectStore('mtgjson_prices');

    // Normaliser le nom de la carte
    const normalizedName = cardName.toLowerCase().trim();

    // Chercher par nom exact d'abord
    let cardData = await new Promise<any>((resolve, reject) => {
      const request = store.get(cardName);
      request.onsuccess = () => resolve(request.result?.data);
      request.onerror = () => reject(request.error);
    });

    // Si pas trouvé, chercher avec recherche insensible à la casse
    if (!cardData) {
      // Parcourir les clés pour trouver une correspondance
      cardData = await new Promise<any>((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const key = cursor.key as string;
            if (key.toLowerCase() === normalizedName) {
              resolve(cursor.value.data);
            } else {
              cursor.continue();
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
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

    // Sinon, prendre le premier set disponible
    const sets = Object.values(cardData) as any[];
    if (sets.length === 0) {
      return null;
    }

    return extractPriceFromSetData(sets[0]);
  } catch (error) {
    console.error('Error finding card price in IndexedDB:', error);
    return null;
  }
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

// Variable pour suivre si le fichier est en cours de téléchargement
let downloadPromise: Promise<boolean> | null = null;

/**
 * Initialise le service MTGJSON
 * Télécharge le fichier si nécessaire et l'indexe dans IndexedDB
 */
export async function initializeMTGJSONPrices(): Promise<void> {
  // Vérifier si le fichier existe déjà dans IndexedDB
  const hasFile = await hasItem('metadata', MTGJSON_PRICES_FILE_KEY);
  
  if (!hasFile) {
    // Si pas de fichier, télécharger
    if (!downloadPromise) {
      downloadPromise = downloadPricesFile(false);
    }
    await downloadPromise;
    downloadPromise = null;
  } else {
    // Si le fichier existe, vérifier si l'index existe
    const indexed = await getItem<boolean>('metadata', 'mtgjson_indexed');
    if (!indexed) {
      // Indexer en arrière-plan si pas encore fait
      indexPricesFile().catch(error => {
        console.warn('Error indexing prices file:', error);
      });
    }
  }
}

/**
 * Récupère le prix d'une carte depuis MTGJSON
 * Parcourt le fichier uniquement pour cette carte
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

  // S'assurer que le fichier est téléchargé et indexé
  await initializeMTGJSONPrices();
  
  // Attendre que l'index soit prêt
  const indexed = await getItem<boolean>('metadata', 'mtgjson_indexed');
  if (!indexed) {
    // Si pas encore indexé, attendre un peu et réessayer
    await new Promise(resolve => setTimeout(resolve, 1000));
    const stillNotIndexed = !(await getItem<boolean>('metadata', 'mtgjson_indexed'));
    if (stillNotIndexed) {
      // Si toujours pas indexé, retourner null (fallback sur Scryfall)
      return null;
    }
  }

  // Rechercher le prix dans l'index (ne charge que cette carte)
  const price = await findCardPriceInIndexedDB(cardName, setCode);
  
  if (price) {
    priceCache.set(cacheKey, price);
  }

  return price;
}

/**
 * Force la mise à jour des prix
 */
export async function updateMTGJSONPrices(): Promise<boolean> {
  return downloadPricesFile(true);
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

/**
 * Vérifie si MTGJSON est initialisé
 */
export async function isMTGJSONInitialized(): Promise<boolean> {
  return hasItem('metadata', MTGJSON_PRICES_FILE_KEY);
}

/**
 * Attend que MTGJSON soit initialisé (si une initialisation est en cours)
 */
export async function waitForMTGJSONInitialization(): Promise<void> {
  if (downloadPromise) {
    await downloadPromise;
  }
}

