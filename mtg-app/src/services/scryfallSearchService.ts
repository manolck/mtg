/**
 * Service de recherche Scryfall optimisé
 * - Toujours recherche en anglais (même si l'utilisateur tape en français)
 * - Utilise le fichier MagicCorporation pour les traductions
 * - Enrichit les résultats avec les données françaises si disponibles
 */

import type { MTGCard } from '../types/card';
import {
  translateFrenchToEnglish,
  translateEnglishToFrench,
  enrichCardWithFrenchData,
  searchInMagicCorporation,
} from './magicCorporationService';
import { normalizeSearchQueryToEnglish } from './searchQueryNormalizer';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { scryfallQueue } from '../utils/apiQueue';
import {
  buildScryfallFilterClauses,
  isRawScryfallQuery,
  type CardSearchFilters,
} from '../utils/cardSearchFilters';
import { extractDfcBack } from '../utils/dfcFaces';
import { scryfallPrintedName, scryfallPrintedText } from '../utils/scryfallPrinted';

const SCRYFALL_API_BASE_URL = 'https://api.scryfall.com';
const MIN_REQUEST_DELAY = 50; // 50ms entre les requêtes

let lastRequestTime = 0;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const isDoubleFaced = scryfallCard.card_faces && scryfallCard.card_faces.length > 0;
  const frontFace = isDoubleFaced ? scryfallCard.card_faces[0] : scryfallCard;
  
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
    type: scryfallCard.type_line,
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
 * Construit une requête Scryfall en anglais uniquement
 * Recherche dans : nom, type, subtype, texte oracle
 */
function buildEnglishQuery(query: string): string {
  if (query.startsWith('"') && query.endsWith('"')) {
    return `!"${query.slice(1, -1)}"`;
  }

  const cleanQuery = query.trim();
  if (cleanQuery.length === 0) {
    return '';
  }

  const words = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 1) {
    const word = words[0];
    // Recherche dans nom, type, subtype, oracle
    return `(${word} OR type:${word} OR t:${word} OR o:${word})`;
  }
  
  // Plusieurs mots : tous doivent matcher
  const wordQueries = words.map(word => 
    `(${word} OR type:${word} OR t:${word} OR o:${word})`
  );
  
  return wordQueries.join(' AND ');
}

/**
 * Détecte si une requête semble être en français
 */
function isFrenchQuery(query: string): boolean {
  const queryLower = query.toLowerCase();
  const hasFrenchAccents = /[àâäéèêëïîôùûüÿç]/.test(query);
  const frenchWords = ['guivre', 'créature', 'sorcierie', 'enchantement', 'artefact', 
                       'terrain', 'plaine', 'île', 'marais', 'montagne', 'forêt',
                       'instantané', 'éphémère', 'planeswalker', 'légendaire'];
  return hasFrenchAccents || frenchWords.some(word => queryLower.includes(word));
}

/**
 * Recherche des cartes par nom
 * - Toujours recherche en anglais sur Scryfall
 * - Traduit français->anglais si nécessaire via MagicCorporation
 * - Enrichit les résultats avec les données françaises si disponibles
 * @param query - Terme de recherche (peut être en français ou anglais)
 * @param limit - Nombre maximum de résultats
 * @param preferredLanguage - Langue d'affichage préférée ('en' ou 'fr')
 */
export async function searchCards(
  query: string,
  limit: number = 20,
  preferredLanguage?: 'en' | 'fr',
  filters?: Partial<CardSearchFilters> | null
): Promise<MTGCard[]> {
  const filterClauses = buildScryfallFilterClauses(filters);
  const trimmedQuery = (query || '').trim();
  if (trimmedQuery.length < 2 && !filterClauses) {
    return [];
  }

  try {
    let scryfallQuery = '';

    if (!trimmedQuery) {
      scryfallQuery = filterClauses;
    } else if (isRawScryfallQuery(trimmedQuery)) {
      scryfallQuery = [trimmedQuery, filterClauses].filter(Boolean).join(' ');
    } else {
      // ÉTAPE 1 : Normaliser la requête (FR↔EN) pour que "bâton" et "staff" donnent les mêmes résultats
      let englishQuery = normalizeSearchQueryToEnglish(trimmedQuery);
      const normalizerChanged = englishQuery.toLowerCase() !== trimmedQuery.toLowerCase();

      const isFrench = preferredLanguage === 'fr' || isFrenchQuery(trimmedQuery);
      if (isFrench && !normalizerChanged) {
        const translated = await translateFrenchToEnglish(trimmedQuery);
        if (translated) {
          englishQuery = translated;
        } else {
          const mcResults = await searchInMagicCorporation(trimmedQuery, 5);
          if (mcResults.length > 0) {
            englishQuery = mcResults[0].nameVo;
          }
        }
      }

      scryfallQuery = [buildEnglishQuery(englishQuery), filterClauses].filter(Boolean).join(' ');
    }

    if (!scryfallQuery) {
      return [];
    }

    const unique = filters?.set ? 'prints' : 'cards';
    const searchUrl = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(scryfallQuery)}&order=released&dir=desc&unique=${unique}`;
    
    let response: Response;
    try {
      response = await scryfallQueue.enqueue(
        () => fetchWithRetry(searchUrl, {
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
        'high' // Priorité haute pour les recherches utilisateur directes
      );
    } catch (error) {
      return [];
    }

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      return [];
    }

    const data = await response.json();
    const cards = data.data || [];
    
    // ÉTAPE 3 : Convertir les cartes Scryfall en MTGCard
    const allCards: MTGCard[] = [];
    const seenCardNames = new Set<string>();

    for (const card of cards) {
      const cardName = card.name?.toLowerCase();
      if (!cardName || seenCardNames.has(cardName)) continue;
      
      seenCardNames.add(cardName);
      const mtgCard = convertScryfallCardToMTGCard(card);
      allCards.push(mtgCard);
    }

    // ÉTAPE 4 : Enrichir avec les données françaises si préféré français
    if (preferredLanguage === 'fr') {
      const enrichedCards = await Promise.all(
        allCards.map(card => enrichCardWithFrenchData(card, true))
      );
      
        // Remplacer les noms et images par les versions françaises si disponibles
        for (const card of enrichedCards) {
          const frenchName = card.foreignNames?.find(
            fn => fn.language === 'French' || fn.language === 'fr'
          );
          if (frenchName) {
            if (frenchName.name) card.name = frenchName.name;
            if (frenchName.type) card.type = frenchName.type;
            if (frenchName.text) card.text = frenchName.text;
            if (frenchName.imageUrl) card.imageUrl = frenchName.imageUrl; // Utiliser l'image française
          }
        }
      
      return enrichedCards.slice(0, limit);
    }

    return allCards.slice(0, limit);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('404')) {
      console.error('Error searching cards:', error);
    }
    return [];
  }
}

/**
 * Recherche d'autocomplétion Scryfall
 * Retourne les noms de cartes en anglais (toujours)
 * @param query - Terme de recherche
 * @param preferredLanguage - Langue préférée (pour l'affichage uniquement)
 */
export async function searchCardNames(
  query: string,
  preferredLanguage?: 'en' | 'fr'
): Promise<Array<{ name: string; language: 'en' | 'fr' }>> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    // Normaliser (bâton→staff, etc.) puis traduire nom complet si besoin
    let englishQuery = normalizeSearchQueryToEnglish(query);
    const normalizerChanged = englishQuery.toLowerCase() !== query.trim().toLowerCase();
    const isFrench = preferredLanguage === 'fr' || isFrenchQuery(query);

    if (isFrench && !normalizerChanged) {
      const translated = await translateFrenchToEnglish(query);
      if (translated) englishQuery = translated;
    }

    const url = `${SCRYFALL_API_BASE_URL}/cards/autocomplete?q=${encodeURIComponent(englishQuery)}`;
    
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
      'high' // Priorité haute pour l'autocomplétion (recherche utilisateur directe)
    );

    const results: Array<{ name: string; language: 'en' | 'fr' }> = [];

    if (response.ok) {
      const data = await response.json();
      const names = data.data || [];
      
      // Tous les noms sont en anglais depuis Scryfall
      for (const name of names) {
        results.push({ name, language: 'en' });
      }
    }

    // Si préféré français, enrichir avec les traductions françaises
    if (preferredLanguage === 'fr' && results.length > 0) {
      const enrichedResults: Array<{ name: string; language: 'en' | 'fr' }> = [];
      
      for (const result of results.slice(0, 10)) {
        const frenchName = await translateEnglishToFrench(result.name);
        if (frenchName) {
          enrichedResults.push({ name: frenchName, language: 'fr' });
        } else {
          enrichedResults.push(result);
        }
      }
      
      return enrichedResults;
    }

    return results.slice(0, 10);
  } catch (error) {
    console.error('Error searching card names:', error);
    return [];
  }
}

/**
 * Recherche une carte spécifique par nom exact
 * @param query - Nom de la carte
 * @param preferredLanguage - Langue d'affichage préférée
 */
export async function searchCardByName(
  query: string,
  preferredLanguage?: 'en' | 'fr'
): Promise<MTGCard | null> {
  if (!query || query.length < 2) {
    return null;
  }

  try {
    // Normaliser (bâton→staff, etc.) puis traduire nom complet si besoin
    let englishQuery = normalizeSearchQueryToEnglish(query);
    const normalizerChanged = englishQuery.toLowerCase() !== query.trim().toLowerCase();
    const isFrench = preferredLanguage === 'fr' || isFrenchQuery(query);

    if (isFrench && !normalizerChanged) {
      const translated = await translateFrenchToEnglish(query);
      if (translated) englishQuery = translated;
    }

    const url = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(`!"${englishQuery}"`)}&order=released&dir=desc&unique=prints&limit=1`;
    
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
      'high' // Priorité haute pour les recherches par nom exact (recherche utilisateur directe)
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      return null;
    }

    const data = await response.json();
    const cards = data.data || [];
    
    if (cards.length === 0) {
      return null;
    }

    let mtgCard = convertScryfallCardToMTGCard(cards[0]);
    
    // Enrichir avec les données françaises si préféré français
    if (preferredLanguage === 'fr') {
      mtgCard = await enrichCardWithFrenchData(mtgCard, true);
      
      const frenchName = mtgCard.foreignNames?.find(
        fn => fn.language === 'French' || fn.language === 'fr'
      );
      if (frenchName) {
        if (frenchName.name) mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
        if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl; // Utiliser l'image française
      }
    }

    return mtgCard;
  } catch (error) {
    console.error('Error searching card by name:', error);
    return null;
  }
}

/**
 * Search all printings of a card by exact name (for scanner confirmation step).
 * Returns up to `limit` printings, optionally following next_page.
 * @param exactName - Exact card name (English)
 * @param limit - Max number of printings to return (default 50)
 * @param preferredLanguage - If 'fr', enrich with French data
 * @param setCode - Optional set code to filter results (e.g. "mid", "m21")
 */
export async function searchPrintingsByExactName(
  exactName: string,
  limit: number = 50,
  preferredLanguage?: 'en' | 'fr',
  setCode?: string | null
): Promise<MTGCard[]> {
  if (!exactName || !exactName.trim()) {
    return [];
  }

  const name = exactName.trim();
  let query = `!"${name.replace(/"/g, '\\"')}"`;
  if (setCode && setCode.trim()) {
    query += ` set:${setCode.trim().toLowerCase()}`;
  }
  let url: string | null = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc&unique=prints&limit=${Math.min(limit, 175)}`;
  const results: MTGCard[] = [];

  try {
    while (url && results.length < limit) {
      const response = await scryfallQueue.enqueue(
        () =>
          fetchWithRetry(url!, {
            headers: {
              'User-Agent': 'MTGCollectionApp/1.0',
              Accept: 'application/json',
            },
          }, {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 16000,
            retryableStatuses: [429, 500, 502, 503, 504],
          }),
        'normal'
      );

      if (!response.ok) {
        if (response.status === 404) break;
        break;
      }

      const data = await response.json();
      const cards = data.data || [];
      for (const card of cards) {
        let mtgCard = convertScryfallCardToMTGCard(card);
        if (preferredLanguage === 'fr') {
          mtgCard = await enrichCardWithFrenchData(mtgCard, true);
          const frenchName = mtgCard.foreignNames?.find(
            (fn) => fn.language === 'French' || fn.language === 'fr'
          );
          if (frenchName) {
            if (frenchName.name) mtgCard.name = frenchName.name;
            if (frenchName.imageUrl) mtgCard.imageUrl = frenchName.imageUrl;
          }
        }
        results.push(mtgCard);
        if (results.length >= limit) break;
      }
      url = data.has_more ? data.next_page : null;
    }
    return results;
  } catch (error) {
    console.error('Error searching printings by exact name:', error);
    return [];
  }
}

const COMMON_TOKEN_NAMES = [
  'Treasure',
  'Food',
  'Clue',
  'Blood',
  'Saproling',
  'Soldier',
  'Zombie',
  'Goblin',
  'Spirit',
  'Beast',
  'Thopter',
  'Copy',
] as const;

const COMMON_TOKEN_QUERY = `(${COMMON_TOKEN_NAMES.map((name) => `!"${name}"`).join(' OR ')})`;

function tokenSearchClause(query: string): string {
  const trimmed = query.trim();
  const exact = COMMON_TOKEN_NAMES.find((name) => name.toLowerCase() === trimmed.toLowerCase());
  if (exact) return `!"${exact}"`;
  if (isRawScryfallQuery(trimmed)) return trimmed;
  const english = normalizeSearchQueryToEnglish(trimmed);
  const words = english.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return COMMON_TOKEN_QUERY;
  return words.map((word) => `(name:${word} OR t:${word})`).join(' ');
}

export async function searchPlayTokens(
  query: string,
  limit = 30,
  preferredLanguage?: 'en' | 'fr',
): Promise<MTGCard[]> {
  const trimmed = (query || '').trim();
  const inner = trimmed.length >= 2 ? tokenSearchClause(trimmed) : COMMON_TOKEN_QUERY;
  const scryfallQuery = `is:token ${inner}`.trim();
  const searchUrl = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(
    scryfallQuery,
  )}&include_extras=true&order=name&unique=cards`;

  try {
    const response = await scryfallQueue.enqueue(
      () =>
        fetchWithRetry(
          searchUrl,
          {
            headers: {
              'User-Agent': 'MTGCollectionApp/1.0',
              Accept: 'application/json',
            },
          },
          {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 16000,
            retryableStatuses: [429, 500, 502, 503, 504],
          },
        ),
      'high',
    );
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const cards: MTGCard[] = [];
    const seen = new Set<string>();
    for (const card of data.data || []) {
      const layout = String(card.layout || '');
      if (layout && !['token', 'double_faced_token'].includes(layout)) continue;
      const mtgCard = convertScryfallCardToMTGCard(card);
      const key = mtgCard.id || mtgCard.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cards.push(mtgCard);
      if (cards.length >= limit) break;
    }
    if (preferredLanguage !== 'fr') return cards;
    const enriched = await Promise.all(cards.map((card) => enrichCardWithFrenchData(card, true)));
    for (const card of enriched) {
      const frenchName = card.foreignNames?.find((fn) => fn.language === 'French' || fn.language === 'fr');
      if (!frenchName) continue;
      if (frenchName.name) card.name = frenchName.name;
      if (frenchName.type) card.type = frenchName.type;
      if (frenchName.text) card.text = frenchName.text;
      if (frenchName.imageUrl) card.imageUrl = frenchName.imageUrl;
    }
    return enriched;
  } catch {
    return [];
  }
}

