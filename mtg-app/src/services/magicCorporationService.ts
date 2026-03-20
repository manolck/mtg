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
    
    if (!cardsDatabase || !Array.isArray(cardsDatabase)) {
      cardsDatabase = [];
      return cardsDatabase;
    }
    
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

/**
 * Retourne le nom anglais de la carte pour une recherche Scryfall.
 * Si le nom donné est en français ou en anglais et qu'une correspondance existe dans MagicCorporation, retourne nameVo (anglais).
 * Sinon retourne le nom inchangé (pour tenter quand même la recherche Scryfall).
 * @param name - Nom détecté (OCR) en français ou en anglais
 * @returns Nom à utiliser pour Scryfall (anglais si correspondance trouvée, sinon name tel quel)
 */
export async function getEnglishNameForSearch(name: string): Promise<string> {
  if (!name || !name.trim()) {
    return name;
  }
  const card = await findCardInMagicCorporation(name.trim());
  if (card?.nameVo) {
    return card.nameVo;
  }
  return name.trim();
}

/** Levenshtein distance (number of edits). */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const dp: number[][] = Array(an + 1)
    .fill(null)
    .map(() => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) dp[i][0] = i;
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[an][bn];
}

/**
 * Jaro-Winkler similarity (0 = rien en commun, 1 = identique).
 * Très adapté aux fautes de frappe / OCR : transpositions et caractères proches.
 * Ex. "rue isman de l'au-delà" vs "rugissement de l'au-delà" → score élevé grâce au suffixe commun.
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.max(len1, len2) / 2 - 1;
  const matchWindowInt = Math.max(0, Math.floor(matchWindow));

  const s1Match: boolean[] = new Array(len1).fill(false);
  const s2Match: boolean[] = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindowInt);
    const end = Math.min(i + matchWindowInt + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Match[j] || s1[i] !== s2[j]) continue;
      s1Match[i] = true;
      s2Match[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Match[i]) continue;
    while (!s2Match[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  const prefixLen = Math.min(4, [...s1].filter((c, i) => s2[i] === c).length);
  const winkler = jaro + prefixLen * 0.1 * (1 - jaro);
  return Math.min(1, winkler);
}

/** Seuils pour le fuzzy match : Levenshtein (éditions) ou Jaro-Winkler (fautes de frappe / OCR). */
const FUZZY_MAX_EDIT = 6;
const FUZZY_MIN_LEV_RATIO = 0.7;
const FUZZY_MIN_JARO = 0.82;

/**
 * À partir d’un texte OCR (souvent avec fautes), trouve la carte Magic Corporation la plus proche.
 * Ordre : correspondance exacte, puis "commence par", puis similarité Levenshtein.
 * @param ocrText - Texte détecté par OCR
 * @returns La carte trouvée ou null
 */
export async function findBestMatchingCardName(
  ocrText: string
): Promise<MagicCorporationCard | null> {
  if (!ocrText || ocrText.trim().length < 2) {
    return null;
  }

  await loadCardsDatabase();
  if (!cardsDatabase?.length || !cardsByFrenchName || !cardsByEnglishName) {
    return null;
  }

  const key = ocrText.toLowerCase().trim();

  const exact = await findCardInMagicCorporation(ocrText.trim());
  if (exact) return exact;

  const candidates: { card: MagicCorporationCard; score: number }[] = [];
  const seen = new Set<string>();

  for (const card of cardsDatabase) {
    const nameVo = (card.nameVo ?? '').toLowerCase();
    const nameVf = (card.nameVf ?? '').toLowerCase();
    if (!nameVo && !nameVf) continue;

    const id = `${card.nameVo}-${card.nameVf}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let score = 0;
    if (nameVo === key || nameVf === key) {
      return card;
    }
    if (nameVo.startsWith(key) || nameVf.startsWith(key)) {
      score = 100;
    } else if (key.startsWith(nameVo) || key.startsWith(nameVf)) {
      score = 80;
    } else if (nameVo.includes(key) || nameVf.includes(key)) {
      score = 50;
    } else {
      const jaroVo = nameVo ? jaroWinkler(key, nameVo) : 0;
      const jaroVf = nameVf ? jaroWinkler(key, nameVf) : 0;
      const jaro = Math.max(jaroVo, jaroVf);
      const distVo = nameVo ? levenshtein(key, nameVo) : 999;
      const distVf = nameVf ? levenshtein(key, nameVf) : 999;
      const dist = Math.min(distVo, distVf);
      const len = Math.max(key.length, nameVo.length, nameVf.length);
      const levRatio = len > 0 ? 1 - dist / len : 0;
      const levOk = dist <= FUZZY_MAX_EDIT && levRatio >= FUZZY_MIN_LEV_RATIO;
      const jaroOk = jaro >= FUZZY_MIN_JARO;
      if (levOk || jaroOk) {
        score = Math.round(Math.max(levRatio * 60, jaro * 65));
      }
    }
    if (score > 0) {
      candidates.push({ card, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const next = candidates[1];
  if (next && next.score === best.score) return null;
  return best.card;
}




