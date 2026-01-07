/**
 * Service pour récupérer les prix des cartes
 * Utilise Scryfall API pour les prix
 */

import type { UserCard } from '../types/card';

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
 * Récupère le prix d'une carte depuis Scryfall
 */
export async function getCardPrice(scryfallId: string): Promise<CardPrice | null> {
  // Vérifier le cache
  const cached = priceCache.get(scryfallId);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`);
    if (!response.ok) {
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
    console.error('Error fetching card price:', error);
    return null;
  }
}

/**
 * Calcule la valeur estimée d'une collection
 */
export async function calculateCollectionValue(
  cards: UserCard[],
  currency: 'usd' | 'eur' = 'usd'
): Promise<{ total: number; byCard: Map<string, number> }> {
  const byCard = new Map<string, number>();
  let total = 0;

  // Traiter par batch pour éviter de surcharger l'API
  const BATCH_SIZE = 10;
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async (card) => {
        // Essayer de récupérer le Scryfall ID depuis mtgData
        const scryfallId = card.mtgData?.id;
        if (!scryfallId) {
          return;
        }

        const prices = await getCardPrice(scryfallId);
        if (!prices) {
          return;
        }

        const priceKey = currency === 'usd' ? 'usd' : 'eur';
        const price = parseFloat(prices[priceKey] || '0');
        const cardValue = price * card.quantity;

        byCard.set(card.id, cardValue);
        total += cardValue;

        // Délai pour respecter rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      })
    );
  }

  return { total, byCard };
}

