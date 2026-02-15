// src/services/collectionService.ts
import { pb } from './pocketbase';
import type { UserCard, UserCollection } from '../types/card';

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
 * Convertit un enregistrement collection_items (avec expand cardId, optionnellement userCollectionId) en UserCard
 */
export function recordToUserCard(
  item: any,
  options?: { userId?: string }
): UserCard {
  const card = item.expand?.cardId ?? item.cardId;
  const collId =
    typeof item.userCollectionId === 'string'
      ? item.userCollectionId
      : item.userCollectionId?.id ?? item.userCollectionId;
  const rawUserId =
    options?.userId ??
    item.expand?.userCollectionId?.userId ??
    (typeof item.userCollectionId === 'object' ? item.userCollectionId?.userId : undefined);
  const userId = typeof rawUserId === 'string' ? rawUserId : (rawUserId?.id ?? '');

  return {
    id: item.id,
    userId,
    collectionId: collId,
    name: card?.name ?? '',
    quantity: item.quantity ?? 1,
    set: card?.set,
    setCode: card?.setCode,
    collectorNumber: card?.collectorNumber,
    rarity: card?.rarity,
    condition: item.condition ?? card?.condition,
    language: item.language ?? 'en',
    mtgData: card?.mtgData,
    backImageUrl: card?.backImageUrl,
    backMultiverseid: card?.backMultiverseid,
    backMtgData: card?.backMtgData,
    createdAt: new Date(item.created),
  };
}

/**
 * Récupère les cartes d'un utilisateur, optionnellement filtrées par collection.
 * Utilise la table join collection_items + cards.
 */
export async function getCollection(
  userId: string,
  collectionId?: string | null
): Promise<UserCard[]> {
  let filter: string;
  if (collectionId != null && collectionId !== '') {
    filter = `userCollectionId = "${collectionId}"`;
  } else {
    filter = `userCollectionId.userId = "${userId}"`;
  }
  const records = await pb.collection('collection_items').getFullList({
    filter,
    expand: 'cardId',
    sort: '-created',
  });
  return records.map((item) => recordToUserCard(item, { userId }));
}

/**
 * Récupère toutes les collections (tous les utilisateurs), paginé.
 * Utilise collection_items avec expand cardId, userCollectionId.
 */
export async function getAllCollections(
  page: number = 1,
  perPage: number = 50
): Promise<{
  items: UserCard[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}> {
  const result = await pb.collection('collection_items').getList(page, perPage, {
    expand: 'cardId,userCollectionId',
    sort: '-created',
  });

  return {
    items: result.items.map((item) => recordToUserCard(item)),
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

/**
 * Ajoute une carte : crée l'entrée dans cards puis la liaison dans collection_items.
 */
export async function addCard(
  card: Omit<UserCard, 'id' | 'createdAt'>
): Promise<UserCard> {
  const cardPayload = cleanForPocketBase({
    name: card.name,
    set: card.set,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    mtgData: card.mtgData,
    backImageUrl: card.backImageUrl,
    backMultiverseid: card.backMultiverseid,
    backMtgData: card.backMtgData,
  });
  const cardRecord = await pb.collection('cards').create(cardPayload);

  const itemPayload = cleanForPocketBase({
    userCollectionId: card.collectionId,
    cardId: cardRecord.id,
    quantity: card.quantity ?? 1,
    condition: card.condition,
    language: card.language ?? 'en',
  });
  const itemRecord = await pb.collection('collection_items').create(itemPayload);

  const full = await pb.collection('collection_items').getOne(itemRecord.id, {
    expand: 'cardId,userCollectionId',
  });
  return recordToUserCard(full, { userId: card.userId });
}

/**
 * Met à jour une carte (collection_items et éventuellement cards).
 * L'id passé est l'id de l'entrée collection_items.
 */
export async function updateCard(
  itemId: string,
  updates: Partial<UserCard>
): Promise<UserCard> {
  const item = await pb.collection('collection_items').getOne(itemId, {
    expand: 'cardId,userCollectionId',
  });
  const cardId = typeof item.cardId === 'string' ? item.cardId : item.cardId?.id;

  const itemUpdates = cleanForPocketBase({
    userCollectionId: updates.collectionId,
    quantity: updates.quantity,
    condition: updates.condition,
    language: updates.language,
  });
  if (Object.keys(itemUpdates).length > 0) {
    await pb.collection('collection_items').update(itemId, itemUpdates);
  }

  const cardUpdates = cleanForPocketBase({
    set: updates.set,
    setCode: updates.setCode,
    collectorNumber: updates.collectorNumber,
    rarity: updates.rarity,
    mtgData: updates.mtgData,
    backImageUrl: updates.backImageUrl,
    backMultiverseid: updates.backMultiverseid,
    backMtgData: updates.backMtgData,
  });
  if (cardId && Object.keys(cardUpdates).length > 0) {
    await pb.collection('cards').update(cardId, cardUpdates);
  }

  const updated = await pb.collection('collection_items').getOne(itemId, {
    expand: 'cardId,userCollectionId',
  });
  return recordToUserCard(updated);
}

/**
 * Met à jour uniquement la quantité d'une carte
 */
export async function updateCardQuantity(
  itemId: string,
  quantity: number
): Promise<UserCard> {
  return updateCard(itemId, { quantity });
}

/**
 * Supprime une entrée collection_items (la carte cards reste en base).
 */
export async function deleteCard(itemId: string): Promise<void> {
  await pb.collection('collection_items').delete(itemId);
}

/**
 * Supprime plusieurs entrées collection_items par leurs ids.
 */
export async function deleteCards(itemIds: string[]): Promise<void> {
  await Promise.all(
    itemIds.map((id) => pb.collection('collection_items').delete(id))
  );
}

function escapeFilter(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Recherche une carte existante par critères (optionnellement dans une collection).
 * Filtre sur collection_items + cardId (relation).
 */
export async function findCard(
  userId: string,
  criteria: {
    name: string;
    setCode?: string;
    collectorNumber?: string;
    language?: string;
  },
  collectionId?: string | null
): Promise<UserCard | null> {
  let filter = `userCollectionId.userId = "${userId}" && cardId.name = "${escapeFilter(criteria.name)}"`;
  if (collectionId != null && collectionId !== '') {
    filter += ` && userCollectionId = "${collectionId}"`;
  }
  if (criteria.setCode) {
    filter += ` && cardId.setCode = "${escapeFilter(criteria.setCode)}"`;
  }
  if (criteria.collectorNumber) {
    filter += ` && cardId.collectorNumber = "${escapeFilter(criteria.collectorNumber)}"`;
  }
  if (criteria.language) {
    filter += ` && language = "${escapeFilter(criteria.language)}"`;
  }
  try {
    const records = await pb.collection('collection_items').getFullList({
      filter,
      expand: 'cardId,userCollectionId',
      limit: 1,
    });
    return records.length > 0 ? recordToUserCard(records[0]) : null;
  } catch (error) {
    console.error('Error finding card:', error);
    return null;
  }
}

// --- User collections (named collections per user) ---

function recordToUserCollection(record: any): UserCollection {
  return {
    id: record.id,
    userId:
      typeof record.userId === 'string'
        ? record.userId
        : record.userId?.id ?? record.userId,
    name: record.name,
    createdAt: new Date(record.created),
  };
}

export async function getUserCollections(
  userId: string
): Promise<UserCollection[]> {
  const records = await pb.collection('user_collections').getFullList({
    filter: `userId = "${userId}"`,
    sort: 'created',
  });
  return records.map(recordToUserCollection);
}

export async function createCollection(
  userId: string,
  name: string
): Promise<UserCollection> {
  const record = await pb.collection('user_collections').create({
    userId,
    name: name.trim(),
  });
  return recordToUserCollection(record);
}

export async function updateCollection(
  collectionId: string,
  name: string
): Promise<UserCollection> {
  const record = await pb.collection('user_collections').update(collectionId, {
    name: name.trim(),
  });
  return recordToUserCollection(record);
}

/**
 * Supprime une collection. Les collection_items sont supprimés en cascade (cascadeDelete sur userCollectionId).
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  await pb.collection('user_collections').delete(collectionId);
}

/**
 * Retourne le nombre de cartes par collection pour un utilisateur.
 */
export async function getCollectionCounts(
  userId: string
): Promise<Record<string, number>> {
  const items = await pb.collection('collection_items').getFullList({
    filter: `userCollectionId.userId = "${userId}"`,
    fields: 'userCollectionId',
  });
  const counts: Record<string, number> = {};
  for (const item of items) {
    const collId =
      typeof item.userCollectionId === 'string'
        ? item.userCollectionId
        : item.userCollectionId?.id ?? item.userCollectionId;
    if (collId) {
      counts[collId] = (counts[collId] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Fusionne une ou plusieurs collections dans une collection cible.
 * Les cartes des collections sources sont déplacées vers la cible (quantités fusionnées si même carte).
 * Les collections sources sont ensuite supprimées.
 */
export async function mergeCollections(
  userId: string,
  sourceCollectionIds: string[],
  targetCollectionId: string
): Promise<void> {
  const targetId = targetCollectionId;
  const sources = sourceCollectionIds.filter((id) => id !== targetId);
  if (sources.length === 0) return;

  for (const sourceId of sources) {
    const items = await pb.collection('collection_items').getFullList({
      filter: `userCollectionId = "${sourceId}"`,
      expand: 'cardId',
    });
    for (const item of items) {
      const cardId = typeof item.cardId === 'string' ? item.cardId : item.cardId?.id;
      if (!cardId) continue;
      const itemLang = item.language ?? 'en';
      const targetItems = await pb.collection('collection_items').getFullList({
        filter: `userCollectionId = "${targetId}" && cardId = "${cardId}"`,
      });
      const sameLanguage = targetItems.find(
        (t) => (t.language ?? 'en') === itemLang
      );
      if (sameLanguage) {
        const newQty = (sameLanguage.quantity ?? 0) + (item.quantity ?? 1);
        await pb.collection('collection_items').update(sameLanguage.id, {
          quantity: newQty,
        });
      } else {
        await pb.collection('collection_items').create({
          userCollectionId: targetId,
          cardId,
          quantity: item.quantity ?? 1,
          condition: item.condition ?? undefined,
          language: itemLang,
        });
      }
    }
    await pb.collection('user_collections').delete(sourceId);
  }
}

/**
 * Supprime toutes les cartes d'un utilisateur, ou seulement celles d'une collection.
 */
export async function deleteAllCardsByUser(
  userId: string,
  collectionId?: string | null
): Promise<void> {
  const cards = await getCollection(userId, collectionId ?? undefined);
  if (cards.length === 0) return;
  await deleteCards(cards.map((c) => c.id));
}
