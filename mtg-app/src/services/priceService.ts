/**
 * Service pour récupérer les prix des cartes
 * Priorité: MTGJSON (fichiers statiques) > Scryfall API
 * 
 * MTGJSON: Prix depuis fichiers statiques (mise à jour 2x/mois)
 * Scryfall: Prix en temps réel (fallback)
 */

import type { UserCard } from '../types/card';
import { scryfallQueue } from '../utils/apiQueue';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { getCardPriceFromMTGJSON, initializeMTGJSONPrices, isMTGJSONInitialized, waitForMTGJSONInitialization } from './mtgjsonPriceServiceAPI';

export interface CardPrice {
  usd?: string;
  usdFoil?: string;
  eur?: string;
  eurFoil?: string;
  tix?: string;
}

export interface PriceData {
  cardId: string;
  cardName: string;
  prices: CardPrice;
  lastUpdated: Date;
}

const PRICE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures
const priceCache = new Map<string, { data: CardPrice; timestamp: number }>();

/**
 * Récupère le prix d'une carte
 * Priorité: MTGJSON > Scryfall
 */
export async function getCardPrice(
  card: UserCard,
  _currency: 'usd' | 'eur' = 'usd'
): Promise<CardPrice | null> {
  // 1. Essayer MTGJSON en premier (fichiers statiques)
  try {
    const mtgjsonPrice = await getCardPriceFromMTGJSON(card.name, card.setCode);
    if (mtgjsonPrice) {
      // Mettre en cache
      const cacheKey = `mtgjson_${card.name}_${card.setCode || 'any'}`;
      priceCache.set(cacheKey, {
        data: mtgjsonPrice,
        timestamp: Date.now(),
      });
      return mtgjsonPrice;
    }
  } catch (error) {
    console.warn('Error fetching price from MTGJSON, trying Scryfall:', error);
  }

  // 2. Fallback sur Scryfall
  const scryfallId = card.mtgData?.id;
  if (!scryfallId) {
    return null;
  }

  return getCardPriceFromScryfall(scryfallId);
}

/**
 * Récupère le prix d'une carte depuis Scryfall
 * Utilise la queue API pour respecter les rate limits
 */
async function getCardPriceFromScryfall(scryfallId: string): Promise<CardPrice | null> {
  // Vérifier le cache
  const cached = priceCache.get(scryfallId);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url = `https://api.scryfall.com/cards/${scryfallId}`;
    
    // Utiliser la queue API pour respecter les rate limits
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
      'normal' // Priorité normale pour les prix
    );

    if (!response.ok) {
      // Si erreur 429, ne pas mettre en cache null (c'est temporaire)
      if (response.status === 429) {
        console.warn('Rate limit reached for Scryfall price API');
        return null;
      }
      return null;
    }

    const data = await response.json();
    const prices: CardPrice = {
      usd: data.prices?.usd,
      usdFoil: data.prices?.usd_foil,
      eur: data.prices?.eur,
      eurFoil: data.prices?.eur_foil,
      tix: data.prices?.tix,
    };

    // Mettre en cache
    priceCache.set(scryfallId, {
      data: prices,
      timestamp: Date.now(),
    });

    return prices;
  } catch (error) {
    console.error('Error fetching card price from Scryfall:', error);
    return null;
  }
}


/**
 * Calcule la valeur estimée d'une collection
 * Utilise MTGJSON (fichiers statiques) en priorité, puis Scryfall en fallback
 * 
 * IMPORTANT: MTGJSON ne nécessite pas de rate limits (données locales)
 */
export async function calculateCollectionValue(
  cards: UserCard[],
  currency: 'usd' | 'eur' = 'usd'
): Promise<{ total: number; byCard: Map<string, number> }> {
  const byCard = new Map<string, number>();
  let total = 0;

  // S'assurer que MTGJSON est initialisé (ne bloque pas si déjà en cours)
  // L'initialisation se fait normalement au démarrage de l'app
  const initialized = await isMTGJSONInitialized();
  if (!initialized) {
    // Si pas encore initialisé, initialiser maintenant
    await initializeMTGJSONPrices();
  } else {
    // Si une initialisation est en cours, attendre qu'elle se termine
    await waitForMTGJSONInitialization();
  }

  // Traiter les cartes (pas besoin de délai pour MTGJSON, mais on en garde un petit pour Scryfall fallback)
  for (const card of cards) {
    try {
      const prices = await getCardPrice(card, currency);
      if (!prices) {
        continue;
      }

      const priceKey = currency === 'usd' ? 'usd' : 'eur';
      const price = parseFloat(prices[priceKey] || '0');
      const cardValue = price * card.quantity;

      byCard.set(card.id, cardValue);
      total += cardValue;

      // Petit délai pour éviter de surcharger en cas de fallback Scryfall
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`Error calculating price for card ${card.name}:`, error);
      // Continuer avec la carte suivante même en cas d'erreur
      continue;
    }
  }

  return { total, byCard };
}


