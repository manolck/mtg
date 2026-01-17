import type { MTGCard } from '../types/card';
import { enrichCardWithFrenchData } from './magicCorporationService';
import { LRUCache } from '../utils/LRUCache';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { scryfallQueue } from '../utils/apiQueue';

const SCRYFALL_API_BASE_URL = 'https://api.scryfall.com';
const CACHE_DURATION = 1000 * 60 * 60; // 1 heure

// Cache LRU pour les cartes Scryfall (limite de 500 entrées, TTL de 1 heure)
const cache = new LRUCache<string, MTGCard | null>(500, CACHE_DURATION);

function getCachedCard(key: string): MTGCard | null {
  return cache.get(key);
}

function setCachedCard(key: string, data: MTGCard | null): void {
  cache.set(key, data);
}

// Délai entre les requêtes pour respecter les rate limits (50-100ms)
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 50; // 50ms = 20 requêtes par seconde max (plus rapide)

async function delayBetweenRequests(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_DELAY - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

/**
 * Convertit une carte Scryfall en format MTGCard
 */
function convertScryfallCardToMTGCard(scryfallCard: any): MTGCard {
  // Gérer les cartes double-face
  const isDoubleFaced = scryfallCard.card_faces && scryfallCard.card_faces.length > 0;
  const frontFace = isDoubleFaced ? scryfallCard.card_faces[0] : scryfallCard;
  
  // Pour les images : les cartes double-face ont les images dans card_faces, sinon dans image_uris
  const imageUris = isDoubleFaced 
    ? (frontFace.image_uris || scryfallCard.image_uris)
    : scryfallCard.image_uris;
  
  const mtgCard: MTGCard = {
    id: scryfallCard.id,
    name: scryfallCard.name,
    layout: scryfallCard.layout,
    manaCost: frontFace.mana_cost || scryfallCard.mana_cost,
    cmc: scryfallCard.cmc,
    colors: scryfallCard.colors || [],
    type: scryfallCard.type_line,
    types: scryfallCard.type_line ? scryfallCard.type_line.split(' — ')[0].trim().split(/\s+/) : [],
    subtypes: scryfallCard.type_line && scryfallCard.type_line.includes('—') 
      ? scryfallCard.type_line.split(' — ')[1].trim().split(/\s+/) 
      : [],
    rarity: scryfallCard.rarity,
    set: scryfallCard.set,
    setName: scryfallCard.set_name,
    text: frontFace.oracle_text || scryfallCard.oracle_text,
    artist: scryfallCard.artist,
    number: scryfallCard.collector_number,
    power: frontFace.power || scryfallCard.power,
    toughness: frontFace.toughness || scryfallCard.toughness,
    loyalty: frontFace.loyalty || scryfallCard.loyalty,
    multiverseid: scryfallCard.multiverse_ids && scryfallCard.multiverse_ids.length > 0 
      ? scryfallCard.multiverse_ids[0] 
      : undefined,
    imageUrl: imageUris?.normal || imageUris?.large || imageUris?.png || imageUris?.border_crop,
  };

  // Ajouter les versions étrangères si disponibles
  // Note: Scryfall utilise `prints_search` pour les versions étrangères, mais on peut aussi utiliser `foreign_data` si présent
  if (scryfallCard.foreign_data && scryfallCard.foreign_data.length > 0) {
    mtgCard.foreignNames = scryfallCard.foreign_data.map((fd: any) => ({
      name: fd.name,
      language: fd.language,
      text: fd.text,
      type: fd.type_line,
      flavor: fd.flavor_text,
      imageUrl: fd.image_url,
      multiverseid: fd.multiverse_id,
      identifiers: {
        scryfallId: scryfallCard.id,
        multiverseId: fd.multiverse_id,
      },
    }));
  }

  return mtgCard;
}

/**
 * Recherche une carte par son Scryfall ID
 * Cherche d'abord la version française si disponible, puis la version anglaise en fallback
 * @param scryfallId - L'UUID Scryfall de la carte
 * @param preferFrench - Préférer la version française si disponible
 */
export async function searchCardByScryfallId(
  scryfallId: string,
  preferFrench: boolean = true
): Promise<MTGCard | null> {
  const cacheKey = `scryfall_${scryfallId}_${preferFrench ? 'fr' : 'en'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    // ÉTAPE 1 : Récupérer d'abord la carte avec son édition précise (par Scryfall ID)
    const url = `${SCRYFALL_API_BASE_URL}/cards/${scryfallId}`;
    
    const response = await scryfallQueue.enqueue(
      () => fetchWithRetry(url, {
        headers: {
          'User-Agent': 'MTGCollectionApp/1.0',
          'Accept': 'application/json',
        },
      }, {
        maxRetries: 3,
        initialDelay: 1000, // 1 seconde
        maxDelay: 16000, // 16 secondes
        retryableStatuses: [429, 500, 502, 503, 504],
      }),
      'normal' // Priorité normale pour les recherches de cartes spécifiques
    );

    if (!response.ok) {
      if (response.status === 404) {
        setCachedCard(cacheKey, null);
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const scryfallCard = await response.json();
    
    // ÉTAPE 2 : Convertir la carte en MTGCard (toujours en anglais depuis Scryfall)
    let mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    
    // ÉTAPE 3 : Enrichir avec les données françaises si préféré français (via MagicCorporation, pas d'appel Scryfall supplémentaire)
    if (preferFrench) {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      
      // Remplacer le nom par la version française si disponible
      const frenchName = mtgCard.foreignNames?.find(
        fn => fn.language === 'French' || fn.language === 'fr'
      );
      if (frenchName && frenchName.name) {
        mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
      }
    }
    
    // Mettre en cache
    setCachedCard(cacheKey, mtgCard);

    return mtgCard;
  } catch (error) {
    console.error('Error searching card by Scryfall ID:', error);
    throw error;
  }
}

/**
 * Recherche une carte directement par set code et numéro de collection
 * C'est la méthode la plus précise et rapide (endpoint direct Scryfall)
 * @param setCode - Code du set (ex: "m21", "thb")
 * @param collectorNumber - Numéro de collection
 * @param preferFrench - Préférer la version française si disponible
 */
export async function searchCardBySetAndNumber(
  setCode: string,
  collectorNumber: string,
  preferFrench: boolean = true
): Promise<MTGCard | null> {
  const cacheKey = `scryfall_set_${setCode.toLowerCase()}_num_${collectorNumber}_${preferFrench ? 'fr' : 'en'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    // ÉTAPE 1 : Chercher d'abord la carte avec son édition précise (set + number) - sans se soucier de la langue
    // Endpoint direct Scryfall : /cards/{set}/{collector_number}
    // Cela retourne directement la carte de cette édition précise
    const url = `${SCRYFALL_API_BASE_URL}/cards/${setCode.toLowerCase()}/${collectorNumber}`;
    
    const response = await scryfallQueue.enqueue(
      () => fetchWithRetry(url, {
        headers: {
          'User-Agent': 'MTGCollectionApp/1.0',
          'Accept': 'application/json',
        },
      }, {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 16000,
        retryableStatuses: [429, 500, 502, 503, 504],
      }),
      'normal' // Priorité normale pour les recherches de cartes spécifiques
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Carte non trouvée avec ce set code et numéro
        setCachedCard(cacheKey, null);
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const scryfallCard = await response.json();
    
    // ÉTAPE 2 : Convertir la carte en MTGCard (toujours en anglais depuis Scryfall)
    let mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    
    // ÉTAPE 3 : Enrichir avec les données françaises si préféré français (via MagicCorporation, pas d'appel Scryfall supplémentaire)
    if (preferFrench) {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      
      // Remplacer le nom par la version française si disponible
      const frenchName = mtgCard.foreignNames?.find(
        fn => fn.language === 'French' || fn.language === 'fr'
      );
      if (frenchName && frenchName.name) {
        mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
      }
    }
    
    // Mettre en cache
    setCachedCard(cacheKey, mtgCard);

    return mtgCard;
  } catch (error) {
    console.error('Error searching card by set and number:', error);
    throw error;
  }
}

/**
 * Recherche une carte par nom + numéro de collection + code de set
 * Cherche d'abord en français, puis en anglais si pas trouvé
 * @param name - Nom de la carte
 * @param collectorNumber - Numéro de collection
 * @param setCode - Code du set (optionnel mais recommandé)
 * @param preferFrench - Préférer la version française si disponible
 */
export async function searchCardByNameAndNumberScryfall(
  name: string,
  collectorNumber: string,
  setCode?: string,
  preferFrench: boolean = true
): Promise<MTGCard | null> {
  const cacheKey = `scryfall_name_${name.toLowerCase()}_num_${collectorNumber}_set_${setCode || 'any'}_${preferFrench ? 'fr' : 'en'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    // Construire la requête de recherche Scryfall de base (sans langue)
    // Format: !"nom" set:code number:numéro
    let baseQuery = `!"${name}"`;
    if (setCode) {
      baseQuery += ` set:${setCode}`;
    }
    baseQuery += ` number:${collectorNumber}`;

    // ÉTAPE 1 : Chercher d'abord la carte avec son édition précise (set + number) - sans se soucier de la langue
    const englishUrl = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(baseQuery)}`;
    
    const englishResponse = await scryfallQueue.enqueue(
      () => fetchWithRetry(englishUrl, {
        headers: {
          'User-Agent': 'MTGCollectionApp/1.0',
          'Accept': 'application/json',
        },
      }, {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 16000,
        retryableStatuses: [429, 500, 502, 503, 504],
      }),
      'normal' // Priorité normale pour les recherches de cartes spécifiques
    );

    if (!englishResponse.ok) {
      if (englishResponse.status === 404) {
        // Aucun résultat trouvé
        setCachedCard(cacheKey, null);
        return null;
      }
      throw new Error(`Scryfall API error: ${englishResponse.status}`);
    }

    const englishData = await englishResponse.json();
    const englishCards = englishData.data || [];

    if (englishCards.length === 0) {
      setCachedCard(cacheKey, null);
      return null;
    }

    const scryfallCard = englishCards[0];
    
    // ÉTAPE 2 : Convertir la carte en MTGCard (toujours en anglais depuis Scryfall)
    let mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    
    // ÉTAPE 3 : Enrichir avec les données françaises si préféré français (via MagicCorporation, pas d'appel Scryfall supplémentaire)
    if (preferFrench) {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      
      // Remplacer le nom par la version française si disponible
      const frenchName = mtgCard.foreignNames?.find(
        fn => fn.language === 'French' || fn.language === 'fr'
      );
      if (frenchName && frenchName.name) {
        mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
      }
    }
    
    // Mettre en cache
    if (mtgCard) {
      setCachedCard(cacheKey, mtgCard);
    }

    return mtgCard;
  } catch (error) {
    console.error('Error searching card by name and number (Scryfall):', error);
    throw error;
  }
}

