// src/services/collectionService.ts
import { pb } from './pocketbase';
import type { UserCard } from '../types/card';

// Réexporter pb pour utilisation dans les hooks
export { pb };

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
 * Convertit un record PocketBase en UserCard
 */
export function recordToUserCard(record: any): UserCard {
  return {
    id: record.id,
    userId: typeof record.userId === 'string' ? record.userId : record.userId?.id || record.userId,
    name: record.name,
    quantity: record.quantity || 1,
    set: record.set,
    setCode: record.setCode,
    collectorNumber: record.collectorNumber,
    rarity: record.rarity,
    condition: record.condition,
    language: record.language || 'en',
    mtgData: record.mtgData,
    backImageUrl: record.backImageUrl,
    backMultiverseid: record.backMultiverseid,
    backMtgData: record.backMtgData,
    createdAt: new Date(record.created),
  };
}

/**
 * Récupère toutes les cartes d'un utilisateur
 */
export async function getCollection(userId: string): Promise<UserCard[]> {
  const records = await pb.collection('collection').getFullList({
    filter: `userId = "${userId}"`,
    sort: '-created',
  });

  return records.map(recordToUserCard);
}

/**
 * Récupère toutes les collections (tous les utilisateurs)
 */
export async function getAllCollections(page: number = 1, perPage: number = 50): Promise<{
  items: UserCard[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}> {
  const result = await pb.collection('collection').getList(page, perPage, {
    sort: '-created',
  });

  return {
    items: result.items.map(recordToUserCard),
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

/**
 * Ajoute une carte
 */
export async function addCard(card: Omit<UserCard, 'id' | 'createdAt'>): Promise<UserCard> {
  const cardData = cleanForPocketBase({
    userId: card.userId,
    name: card.name,
    quantity: card.quantity,
    set: card.set,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    condition: card.condition,
    language: card.language || 'en',
    mtgData: card.mtgData,
    backImageUrl: card.backImageUrl,
    backMultiverseid: card.backMultiverseid,
    backMtgData: card.backMtgData,
  });

  const record = await pb.collection('collection').create(cardData);
  return recordToUserCard(record);
}

/**
 * Met à jour une carte
 */
export async function updateCard(cardId: string, updates: Partial<UserCard>): Promise<UserCard> {
  const updateData = cleanForPocketBase({
    quantity: updates.quantity,
    condition: updates.condition,
    set: updates.set,
    setCode: updates.setCode,
    collectorNumber: updates.collectorNumber,
    rarity: updates.rarity,
    language: updates.language,
    mtgData: updates.mtgData,
    backImageUrl: updates.backImageUrl,
    backMultiverseid: updates.backMultiverseid,
    backMtgData: updates.backMtgData,
  });

  const record = await pb.collection('collection').update(cardId, updateData);
  return recordToUserCard(record);
}

/**
 * Met à jour uniquement la quantité d'une carte
 */
export async function updateCardQuantity(cardId: string, quantity: number): Promise<UserCard> {
  return updateCard(cardId, { quantity });
}

/**
 * Supprime une carte
 */
export async function deleteCard(cardId: string): Promise<void> {
  await pb.collection('collection').delete(cardId);
}

/**
 * Supprime plusieurs cartes (par IDs)
 */
export async function deleteCards(cardIds: string[]): Promise<void> {
  // PocketBase ne supporte pas les suppressions en batch nativement
  // On fait les suppressions en parallèle
  await Promise.all(cardIds.map(id => pb.collection('collection').delete(id)));
}

/**
 * Recherche une carte existante par critères
 */
export async function findCard(userId: string, criteria: {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  language?: string;
}): Promise<UserCard | null> {
  let filter = `userId = "${userId}" && name = "${criteria.name}"`;
  
  if (criteria.setCode) {
    filter += ` && setCode = "${criteria.setCode}"`;
  }
  
  if (criteria.collectorNumber) {
    filter += ` && collectorNumber = "${criteria.collectorNumber}"`;
  }
  
  if (criteria.language) {
    filter += ` && language = "${criteria.language}"`;
  }

  try {
    const records = await pb.collection('collection').getFullList({
      filter,
      limit: 1,
    });

    return records.length > 0 ? recordToUserCard(records[0]) : null;
  } catch (error) {
    console.error('Error finding card:', error);
    return null;
  }
}