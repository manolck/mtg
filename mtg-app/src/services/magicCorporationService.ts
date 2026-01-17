/**
 * Service pour utiliser le fichier de correspondance MagicCorporation
 * Permet de traduire les noms de cartes entre français et anglais
 */

import type { MTGCard } from '../types/card';

interface MagicCorporationCard {
  nameVo: string; // Nom version originale (anglais)
  nameVf: string; // Nom version française
  number?: string;
  type?: string;
  power?: string;
  toughness?: string;
  edition?: string;
  manaCost?: string;
  color?: string;
  rarity?: string;
  cardUrl?: string;
  scrapedAt?: string;
}

let cardsDatabase: MagicCorporationCard[] | null = null;
let cardsByFrenchName: Map<string, MagicCorporationCard> | null = null;
let cardsByEnglishName: Map<string, MagicCorporationCard[]> | null = null;

/**
 * Charge le fichier JSON MagicCorporation (chargement lazy)
 */
async function loadCardsDatabase(): Promise<MagicCorporationCard[]> {
  if (cardsDatabase !== null) {
    return cardsDatabase;
  }

  try {
    const response = await fetch('/magiccorporation-cards.json');
    if (!response.ok) {
      console.warn('Fichier MagicCorporation non trouvé, utilisation de Scryfall uniquement');
      cardsDatabase = [];
      return cardsDatabase;
    }
    cardsDatabase = await response.json();
    
    // Créer les index pour les recherches rapides
    cardsByFrenchName = new Map();
    cardsByEnglishName = new Map();
    
    for (const card of cardsDatabase) {
      // Index par nom français
      if (card.nameVf) {
        const frenchKey = card.nameVf.toLowerCase().trim();
        if (!cardsByFrenchName.has(frenchKey)) {
          cardsByFrenchName.set(frenchKey, card);
        }
      }
      
      // Index par nom anglais (peut y avoir plusieurs cartes avec le même nom)
      if (card.nameVo) {
        const englishKey = card.nameVo.toLowerCase().trim();
        if (!cardsByEnglishName.has(englishKey)) {
          cardsByEnglishName.set(englishKey, []);
        }
        cardsByEnglishName.get(englishKey)!.push(card);
      }
    }
    
    return cardsDatabase;
  } catch (error) {
    console.warn('Erreur lors du chargement du fichier MagicCorporation:', error);
    cardsDatabase = [];
    return cardsDatabase;
  }
}

/**
 * Traduit un nom français en nom anglais en utilisant le fichier MagicCorporation
 * @param frenchName - Nom de la carte en français
 * @returns Nom de la carte en anglais, ou null si non trouvé
 */
export async function translateFrenchToEnglish(frenchName: string): Promise<string | null> {
  if (!frenchName || frenchName.trim().length === 0) {
    return null;
  }

  await loadCardsDatabase();
  
  if (!cardsByFrenchName) {
    return null;
  }

  const key = frenchName.toLowerCase().trim();
  const card = cardsByFrenchName.get(key);
  
  if (card && card.nameVo) {
    return card.nameVo;
  }

  // Recherche partielle si recherche exacte échoue
  for (const [frenchKey, cardData] of cardsByFrenchName.entries()) {
    if (frenchKey.includes(key) || key.includes(frenchKey)) {
      return cardData.nameVo;
    }
  }

  return null;
}

/**
 * Traduit un nom anglais en nom français en utilisant le fichier MagicCorporation
 * @param englishName - Nom de la carte en anglais
 * @returns Nom de la carte en français, ou null si non trouvé
 */
export async function translateEnglishToFrench(englishName: string): Promise<string | null> {
  if (!englishName || englishName.trim().length === 0) {
    return null;
  }

  await loadCardsDatabase();
  
  if (!cardsByEnglishName) {
    return null;
  }

  const key = englishName.toLowerCase().trim();
  const cards = cardsByEnglishName.get(key);
  
  if (cards && cards.length > 0 && cards[0].nameVf) {
    return cards[0].nameVf;
  }

  // Recherche partielle si recherche exacte échoue
  for (const [englishKey, cardList] of cardsByEnglishName.entries()) {
    if (englishKey.includes(key) || key.includes(englishKey)) {
      if (cardList.length > 0 && cardList[0].nameVf) {
        return cardList[0].nameVf;
      }
    }
  }

  return null;
}

/**
 * Recherche des cartes dans le fichier MagicCorporation par nom (français ou anglais)
 * @param query - Terme de recherche
 * @param limit - Nombre maximum de résultats
 * @returns Liste de cartes correspondantes
 */
export async function searchInMagicCorporation(
  query: string,
  limit: number = 20
): Promise<MagicCorporationCard[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  await loadCardsDatabase();
  
  if (!cardsDatabase || cardsDatabase.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();
  const results: MagicCorporationCard[] = [];
  const seen = new Set<string>();

  for (const card of cardsDatabase) {
    if (results.length >= limit) break;

    // Rechercher dans le nom français
    const frenchMatch = card.nameVf?.toLowerCase().includes(queryLower);
    // Rechercher dans le nom anglais
    const englishMatch = card.nameVo?.toLowerCase().includes(queryLower);
    // Rechercher dans le type
    const typeMatch = card.type?.toLowerCase().includes(queryLower);

    if (frenchMatch || englishMatch || typeMatch) {
      const key = `${card.nameVo}-${card.nameVf}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(card);
      }
    }
  }

  return results;
}

/**
 * Enrichit une carte MTGCard avec les données françaises du fichier MagicCorporation
 * @param card - Carte en anglais
 * @param preferFrench - Si true, utilise les données françaises si disponibles
 * @returns Carte enrichie avec les données françaises
 */
export async function enrichCardWithFrenchData(
  card: MTGCard,
  preferFrench: boolean = true
): Promise<MTGCard> {
  if (!preferFrench || !card.name) {
    return card;
  }

  await loadCardsDatabase();
  
  if (!cardsByEnglishName) {
    return card;
  }

  const englishName = card.name.toLowerCase().trim();
  const matchingCards = cardsByEnglishName.get(englishName);

  if (matchingCards && matchingCards.length > 0) {
    const mcCard = matchingCards[0];
    
    // Créer une copie de la carte avec les données françaises
    const enrichedCard: MTGCard = {
      ...card,
      name: mcCard.nameVf || card.name,
    };

    // Ajouter les données françaises dans foreignNames si pas déjà présent
    if (!enrichedCard.foreignNames) {
      enrichedCard.foreignNames = [];
    }

    // Vérifier si les données françaises ne sont pas déjà présentes
    const hasFrench = enrichedCard.foreignNames.some(
      fn => fn.language === 'French' || fn.language === 'fr'
    );

    if (!hasFrench && mcCard.nameVf) {
      enrichedCard.foreignNames.push({
        name: mcCard.nameVf,
        language: 'French',
        type: mcCard.type,
        text: undefined,
        imageUrl: undefined,
        multiverseid: undefined,
        identifiers: {
          scryfallId: card.id,
        },
      });
    }

    return enrichedCard;
  }

  return card;
}

/**
 * Recherche une carte par son nom exact dans MagicCorporation
 * @param name - Nom de la carte (français ou anglais)
 * @returns Carte trouvée ou null
 */
export async function findCardInMagicCorporation(
  name: string
): Promise<MagicCorporationCard | null> {
  if (!name || name.trim().length === 0) {
    return null;
  }

  await loadCardsDatabase();
  
  if (!cardsByFrenchName || !cardsByEnglishName) {
    return null;
  }

  const key = name.toLowerCase().trim();
  
  // Chercher d'abord par nom français
  const frenchCard = cardsByFrenchName.get(key);
  if (frenchCard) {
    return frenchCard;
  }

  // Chercher par nom anglais
  const englishCards = cardsByEnglishName.get(key);
  if (englishCards && englishCards.length > 0) {
    return englishCards[0];
  }

  return null;
}




