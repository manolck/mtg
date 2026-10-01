import type { MTGCard } from '../types/card';
import { enrichCardWithFrenchData } from './magicCorporationService';
import { LRUCache } from '../utils/LRUCache';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { scryfallQueue } from '../utils/apiQueue';
import { extractDfcBack } from '../utils/dfcFaces';
import { scryfallPrintedName, scryfallPrintedText, scryfallPrintedType } from '../utils/scryfallPrinted';

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

 
async function _delayBetweenRequests(): Promise<void> {
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
    name: scryfallPrintedName(scryfallCard) || scryfallCard.name,
    layout: scryfallCard.layout,
    manaCost: frontFace.mana_cost || scryfallCard.mana_cost,
    cmc: scryfallCard.cmc,
    colors: scryfallCard.colors || [],
    colorIdentity: scryfallCard.color_identity || scryfallCard.colors || [],
    type: scryfallPrintedType(scryfallCard) || scryfallCard.type_line,
    types: scryfallCard.type_line ? scryfallCard.type_line.split(' — ')[0].trim().split(/\s+/) : [],
    subtypes: scryfallCard.type_line && scryfallCard.type_line.includes('—') 
      ? scryfallCard.type_line.split(' — ')[1].trim().split(/\s+/) 
      : [],
    rarity: scryfallCard.rarity,
    set: scryfallCard.set,
    setName: scryfallCard.set_name,
    text: scryfallPrintedText(frontFace) || scryfallPrintedText(scryfallCard),
    artist: scryfallCard.artist,
    number: scryfallCard.collector_number,
    power: frontFace.power || scryfallCard.power,
    toughness: frontFace.toughness || scryfallCard.toughness,
    loyalty: frontFace.loyalty || scryfallCard.loyalty,
    multiverseid: scryfallCard.multiverse_ids && scryfallCard.multiverse_ids.length > 0 
      ? scryfallCard.multiverse_ids[0] 
      : undefined,
    imageUrl: imageUris?.normal || imageUris?.large || imageUris?.png || imageUris?.border_crop,
    legalities: scryfallCard.legalities || undefined,
  };

  const dfcBack = extractDfcBack(scryfallCard);
  if (dfcBack) {
    mtgCard.backImageUrl = dfcBack.backImageUrl;
    mtgCard.backName = dfcBack.backName;
  }

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
 * French scan of this exact set/number, if Scryfall has one.
 * Multilingual search returns HTTP 200 with an empty-of-fr list when that printing
 * was never translated (The List, promos, star numbers) — GET .../fr would 404 in the console.
 */
async function fetchFrenchPrinting(
  setCode: string,
  collectorNumber: string
): Promise<MTGCard | null> {
  const code = setCode?.toLowerCase().trim();
  const number = String(collectorNumber).trim().replace(/"/g, '');
  if (!code || !number) return null;
  const query = `s:${code} cn:"${number}"`;
  const url = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}&unique=prints&include_multilingual=true`;
  try {
    const response = await scryfallQueue.enqueue(
      () => fetchWithRetry(url, {
        headers: { 'User-Agent': 'MTGCollectionApp/1.0', Accept: 'application/json' },
      }, { maxRetries: 2, initialDelay: 500, maxDelay: 4000, retryableStatuses: [429, 500, 502, 503, 504] }),
      'normal'
    );
    if (!response.ok) return null;
    const data = await response.json();
    const french = Array.isArray(data?.data)
      ? data.data.find((card: { lang?: string }) => card.lang === 'fr')
      : null;
    return french ? convertScryfallCardToMTGCard(french) : null;
  } catch {
    return null;
  }
}

/**
 * Recherche une carte par son Scryfall ID
 * Cherche d'abord la version française si disponible, puis la version anglaise en fallback
 * @param scryfallId - L'UUID Scryfall de la carte
 * @param preferFrench - Préférer la version française si disponible
 */
export async function searchCardByScryfallId(
  scryfallId: string,
  preferFrench: boolean = true,
  options?: { magicCorporation?: boolean },
): Promise<MTGCard | null> {
  const useMagicCorp = options?.magicCorporation !== false;
  const cacheKey = `scryfall_${scryfallId}_${preferFrench ? 'fr' : 'en'}${useMagicCorp ? '' : '_nomc'}`;

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

    const applyMagicCorp = async (card: MTGCard): Promise<MTGCard> => {
      if (!preferFrench || !useMagicCorp) return card;
      let mtgCard = await enrichCardWithFrenchData(card, true);
      const frenchName = mtgCard.foreignNames?.find((fn) => fn.language === 'French' || fn.language === 'fr');
      if (frenchName) {
        if (frenchName.name) mtgCard = { ...mtgCard, name: frenchName.name };
        if (frenchName.type) mtgCard = { ...mtgCard, type: frenchName.type };
        if (frenchName.text) mtgCard = { ...mtgCard, text: frenchName.text };
        if (frenchName.imageUrl) mtgCard = { ...mtgCard, imageUrl: frenchName.imageUrl };
      }
      return mtgCard;
    };

    // ÉTAPE 2 : Si préférence française, tenter d'abord la version FR (image correcte)
    let mtgCard: MTGCard;
    if (preferFrench && scryfallCard.lang === 'fr') {
      mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    } else if (preferFrench && scryfallCard.set && scryfallCard.collector_number) {
      const frenchCard = await fetchFrenchPrinting(scryfallCard.set, scryfallCard.collector_number);
      if (frenchCard?.imageUrl && frenchCard?.name) {
        mtgCard = frenchCard;
      } else {
        mtgCard = await applyMagicCorp(convertScryfallCardToMTGCard(scryfallCard));
      }
    } else {
      mtgCard = await applyMagicCorp(convertScryfallCardToMTGCard(scryfallCard));
    }

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
    // ÉTAPE 1 : Si préférence française, tenter d'abord la version FR (image correcte)
    if (preferFrench) {
      const frenchCard = await fetchFrenchPrinting(setCode, collectorNumber);
      if (frenchCard?.imageUrl && frenchCard?.name) {
        setCachedCard(cacheKey, frenchCard);
        return frenchCard;
      }
    }
    // ÉTAPE 2 : Carte anglaise (ou fallback si pas de version FR)
    const url = `${SCRYFALL_API_BASE_URL}/cards/${setCode.toLowerCase()}/${encodeURIComponent(collectorNumber)}`;
    const response = await scryfallQueue.enqueue(
      () => fetchWithRetry(url, {
        headers: { 'User-Agent': 'MTGCollectionApp/1.0', 'Accept': 'application/json' },
      }, { maxRetries: 3, initialDelay: 1000, maxDelay: 16000, retryableStatuses: [429, 500, 502, 503, 504] }),
      'normal'
    );
    if (!response.ok) {
      if (response.status === 404) {
        setCachedCard(cacheKey, null);
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }
    const scryfallCard = await response.json();
    let mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    if (preferFrench) {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      const frenchName = mtgCard.foreignNames?.find(fn => fn.language === 'French' || fn.language === 'fr');
      if (frenchName) {
        if (frenchName.name) mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
        if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl;
      }
    }
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
    let mtgCard: MTGCard;
    if (preferFrench && scryfallCard.lang === 'fr') {
      mtgCard = convertScryfallCardToMTGCard(scryfallCard);
    } else if (preferFrench && scryfallCard.set && scryfallCard.collector_number) {
      const frenchCard = await fetchFrenchPrinting(scryfallCard.set, scryfallCard.collector_number);
      if (frenchCard?.imageUrl && frenchCard?.name) {
        mtgCard = frenchCard;
      } else {
        mtgCard = convertScryfallCardToMTGCard(scryfallCard);
        mtgCard = await enrichCardWithFrenchData(mtgCard, true);
        const frenchName = mtgCard.foreignNames?.find(fn => fn.language === 'French' || fn.language === 'fr');
        if (frenchName) {
          if (frenchName.name) mtgCard.name = frenchName.name;
          if (frenchName.type) mtgCard.type = frenchName.type;
          if (frenchName.text) mtgCard.text = frenchName.text;
          if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl;
        }
      }
    } else {
      mtgCard = convertScryfallCardToMTGCard(scryfallCard);
      if (preferFrench) {
        mtgCard = await enrichCardWithFrenchData(mtgCard, true);
        const frenchName = mtgCard.foreignNames?.find(fn => fn.language === 'French' || fn.language === 'fr');
        if (frenchName) {
          if (frenchName.name) mtgCard.name = frenchName.name;
          if (frenchName.type) mtgCard.type = frenchName.type;
          if (frenchName.text) mtgCard.text = frenchName.text;
          if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl;
        }
      }
    }
    if (mtgCard) setCachedCard(cacheKey, mtgCard);
    return mtgCard;
  } catch (error) {
    console.error('Error searching card by name and number (Scryfall):', error);
    throw error;
  }
}

/**
 * Résout une carte via oracle_id Scryfall (utile pour les noms FR du scan sans scryfall_id).
 * Préfère une impression FR si disponible, sinon EN.
 */
export async function searchCardByOracleId(
  oracleId: string,
  preferFrench: boolean = true
): Promise<MTGCard | null> {
  const id = oracleId?.trim();
  if (!id) return null;
  const cacheKey = `scryfall_oracle_${id}_${preferFrench ? 'fr' : 'en'}`;
  const cached = getCachedCard(cacheKey);
  if (cached !== null) return cached;

  try {
    const langPref = preferFrench ? 'fr' : 'en';
    const query = `oracleid:${id} lang:${langPref}`;
    let url = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
    let response = await scryfallQueue.enqueue(
      () =>
        fetchWithRetry(url, {
          headers: { 'User-Agent': 'MTGCollectionApp/1.0', Accept: 'application/json' },
        }, { maxRetries: 3, initialDelay: 1000, maxDelay: 16000, retryableStatuses: [429, 500, 502, 503, 504] }),
      'normal'
    );
    if (!response.ok && preferFrench) {
      url = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(`oracleid:${id}`)}&unique=prints&order=released&dir=desc`;
      response = await scryfallQueue.enqueue(
        () =>
          fetchWithRetry(url, {
            headers: { 'User-Agent': 'MTGCollectionApp/1.0', Accept: 'application/json' },
          }, { maxRetries: 3, initialDelay: 1000, maxDelay: 16000, retryableStatuses: [429, 500, 502, 503, 504] }),
        'normal'
      );
    }
    if (!response.ok) {
      if (response.status === 404) {
        setCachedCard(cacheKey, null);
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }
    const data = await response.json();
    const card = (data.data || [])[0];
    if (!card) {
      setCachedCard(cacheKey, null);
      return null;
    }
    let mtgCard = convertScryfallCardToMTGCard(card);
    if (preferFrench && card.lang !== 'fr') {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      const frenchName = mtgCard.foreignNames?.find(
        (fn) => fn.language === 'French' || fn.language === 'fr'
      );
      if (frenchName) {
        if (frenchName.name) mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
        if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl;
      }
    }
    setCachedCard(cacheKey, mtgCard);
    return mtgCard;
  } catch (error) {
    console.error('Error searching card by oracle id:', error);
    throw error;
  }
}

/**
 * Toutes les impressions d'un oracle_id (pour choisir l'extension après scan).
 * Préfère FR quand une impression FR existe pour le même set+cn.
 */
export async function searchPrintingsByOracleId(
  oracleId: string,
  preferFrench: boolean = true,
  limit: number = 100
): Promise<MTGCard[]> {
  const id = oracleId?.trim();
  if (!id) return [];

  const query = preferFrench
    ? `oracleid:${id} (lang:fr OR lang:en)`
    : `oracleid:${id}`;
  let url: string | null = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc&include_multilingual=true`;
  const byKey = new Map<string, { card: MTGCard; lang: string }>();

  try {
    while (url && byKey.size < limit) {
      const response = await scryfallQueue.enqueue(
        () =>
          fetchWithRetry(url!, {
            headers: { 'User-Agent': 'MTGCollectionApp/1.0', Accept: 'application/json' },
          }, { maxRetries: 3, initialDelay: 1000, maxDelay: 16000, retryableStatuses: [429, 500, 502, 503, 504] }),
        'normal'
      );
      if (!response.ok) {
        if (response.status === 404) break;
        break;
      }
      const data = await response.json();
      for (const raw of data.data || []) {
        const lang = String(raw.lang || 'en');
        if (preferFrench && lang !== 'fr' && lang !== 'en') continue;
        if (!preferFrench && lang !== 'en') continue;
        const key = `${String(raw.set || '').toLowerCase()}|${String(raw.collector_number || '')}`;
        const mtgCard = convertScryfallCardToMTGCard(raw);
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { card: mtgCard, lang });
        } else if (preferFrench && lang === 'fr' && existing.lang !== 'fr') {
          byKey.set(key, { card: mtgCard, lang });
        }
        if (byKey.size >= limit) break;
      }
      url = data.has_more && byKey.size < limit ? data.next_page : null;
    }
    return [...byKey.values()].map((v) => v.card);
  } catch (error) {
    console.error('Error searching printings by oracle id:', error);
    return [];
  }
}

