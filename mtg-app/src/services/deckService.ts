// src/services/deckService.ts
import { pb } from './pocketbase';
import type { Deck, DeckCard } from '../types/deck';

/**
 * Nettoie un objet en retirant tous les champs undefined pour PocketBase
 */
function cleanForPocketBase(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForPocketBase(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForPocketBase(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Convertit un record PocketBase en Deck
 */
function recordToDeck(record: any): Deck {
  return {
    id: record.id,
    userId: typeof record.userId === 'string' ? record.userId : record.userId?.id || record.userId,
    name: record.name,
    cards: record.cards || [],
    createdAt: new Date(record.created),
  };
}

/**
 * Récupère tous les decks d'un utilisateur
 */
export async function getDecks(userId: string): Promise<Deck[]> {
  const records = await pb.collection('decks').getFullList({
    filter: `userId = "${userId}"`,
    sort: '-created',
  });

  return records.map(recordToDeck);
}

/**
 * Crée un nouveau deck
 */
export async function createDeck(userId: string, name: string): Promise<Deck> {
  const deckName = typeof name === 'string' ? name.trim() : '';
  if (!deckName) {
    throw new Error('Le nom du deck ne peut pas être vide');
  }
  // Utiliser l'id du store auth pour que la createRule (@request.auth.id = userId) soit satisfaite
  const authId = pb.authStore.model?.id;
  const uid = (typeof authId === 'string' && authId) || (typeof userId === 'string' ? userId.trim() : '');
  if (!uid) {
    throw new Error('Vous devez être connecté pour créer un deck');
  }

  const deckData = cleanForPocketBase({
    userId: uid,
    name: deckName,
    cards: [] as DeckCard[],
  });

  try {
    const record = await pb.collection('decks').create(deckData);
    return recordToDeck(record);
  } catch (err: unknown) {
    // PocketBase ClientResponseError a .message (depuis response.message) ou .response.message
    const msg =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'response' in err && (err as { response?: { message?: string } }).response?.message;
    const message =
      typeof msg === 'string' && msg !== 'Something went wrong.'
        ? msg
        : 'Impossible de créer le deck. Vérifiez votre connexion et les droits.';
    throw new Error(message);
  }
}

/**
 * Met à jour un deck
 */
export async function updateDeck(deckId: string, updates: Partial<Deck>): Promise<Deck> {
  const updateData = cleanForPocketBase({
    name: updates.name,
    cards: updates.cards,
  });

  const record = await pb.collection('decks').update(deckId, updateData);
  return recordToDeck(record);
}

/**
 * Supprime un deck
 */
export async function deleteDeck(deckId: string): Promise<void> {
  await pb.collection('decks').delete(deckId);
}

/**
 * Ajoute une carte à un deck
 */
export async function addCardToDeck(deckId: string, cardId: string, quantity: number = 1): Promise<Deck> {
  const deck = await pb.collection('decks').getOne(deckId);
  const currentCards: DeckCard[] = deck.cards || [];
  
  const existingCardIndex = currentCards.findIndex((c: DeckCard) => c.cardId === cardId);
  
  let updatedCards: DeckCard[];
  if (existingCardIndex >= 0) {
    updatedCards = [...currentCards];
    updatedCards[existingCardIndex] = {
      ...updatedCards[existingCardIndex],
      quantity: updatedCards[existingCardIndex].quantity + quantity,
    };
  } else {
    updatedCards = [...currentCards, { cardId, quantity }];
  }

  return updateDeck(deckId, { cards: updatedCards });
}

/**
 * Retire une carte d'un deck
 */
export async function removeCardFromDeck(deckId: string, cardId: string): Promise<Deck> {
  const deck = await pb.collection('decks').getOne(deckId);
  const currentCards: DeckCard[] = deck.cards || [];
  const updatedCards = currentCards.filter((c: DeckCard) => c.cardId !== cardId);
  
  return updateDeck(deckId, { cards: updatedCards });
}

/**
 * Met à jour la quantité d'une carte dans un deck
 */
export async function updateCardQuantityInDeck(deckId: string, cardId: string, quantity: number): Promise<Deck> {
  const deck = await pb.collection('decks').getOne(deckId);
  const currentCards: DeckCard[] = deck.cards || [];
  const updatedCards = currentCards.map((c: DeckCard) =>
    c.cardId === cardId ? { ...c, quantity } : c
  );
  
  return updateDeck(deckId, { cards: updatedCards });
}
