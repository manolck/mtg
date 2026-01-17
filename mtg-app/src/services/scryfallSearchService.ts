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
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { scryfallQueue } from '../utils/apiQueue';

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
    name: scryfallCard.name, // Toujours en anglais depuis Scryfall
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
  preferredLanguage?: 'en' | 'fr'
): Promise<MTGCard[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    // ÉTAPE 1 : Détecter si la requête est en français et la traduire en anglais
    const isFrench = preferredLanguage === 'fr' || isFrenchQuery(query);
    let englishQuery = query;
    
    if (isFrench) {
      // Essayer de traduire via MagicCorporation
      const translated = await translateFrenchToEnglish(query);
      if (translated) {
        englishQuery = translated;
      } else {
        // Si pas de traduction exacte, essayer une recherche partielle dans MagicCorporation
        const mcResults = await searchInMagicCorporation(query, 5);
        if (mcResults.length > 0) {
          // Utiliser le nom anglais de la première correspondance
          englishQuery = mcResults[0].nameVo;
        }
        // Sinon, utiliser la requête originale (Scryfall peut parfois comprendre)
      }
    }

    // ÉTAPE 2 : Rechercher sur Scryfall en anglais uniquement
    const scryfallQuery = buildEnglishQuery(englishQuery);
    const searchUrl = `${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(scryfallQuery)}&order=released&dir=desc&unique=prints&limit=${limit}`;
    
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
      
      // Remplacer les noms par les versions françaises si disponibles
      for (const card of enrichedCards) {
        const frenchName = card.foreignNames?.find(
          fn => fn.language === 'French' || fn.language === 'fr'
        );
        if (frenchName && frenchName.name) {
          card.name = frenchName.name;
          if (frenchName.type) card.type = frenchName.type;
          if (frenchName.text) card.text = frenchName.text;
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
    // Traduire en anglais si nécessaire
    const isFrench = preferredLanguage === 'fr' || isFrenchQuery(query);
    let englishQuery = query;
    
    if (isFrench) {
      const translated = await translateFrenchToEnglish(query);
      if (translated) {
        englishQuery = translated;
      }
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
    // Traduire en anglais si nécessaire
    const isFrench = preferredLanguage === 'fr' || isFrenchQuery(query);
    let englishQuery = query;
    
    if (isFrench) {
      const translated = await translateFrenchToEnglish(query);
      if (translated) {
        englishQuery = translated;
      }
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
      if (frenchName && frenchName.name) {
        mtgCard.name = frenchName.name;
        if (frenchName.type) mtgCard.type = frenchName.type;
        if (frenchName.text) mtgCard.text = frenchName.text;
      }
    }

    return mtgCard;
  } catch (error) {
    console.error('Error searching card by name:', error);
    return null;
  }
}
