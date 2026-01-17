// src/services/wishlistService.ts
import { pb } from './pocketbase';
import type { WishlistItem } from '../types/card';
import type { MTGCard } from '../types/card';

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
 * Convertit un record PocketBase en WishlistItem
 */
function recordToWishlistItem(record: any): WishlistItem {
  return {
    id: record.id,
    userId: typeof record.userId === 'string' ? record.userId : record.userId?.id || record.userId,
    name: record.name,
    quantity: record.quantity || 1,
    set: record.set,
    setCode: record.setCode,
    collectorNumber: record.collectorNumber,
    rarity: record.rarity,
    language: record.language || 'en',
    mtgData: record.mtgData,
    notes: record.notes,
    targetPrice: record.targetPrice,
    scryfallId: record.scryfallId,
    createdAt: new Date(record.created),
    updatedAt: new Date(record.updated),
  };
}

/**
 * Récupère tous les items de wishlist d'un utilisateur
 */
export async function getWishlistItems(userId: string): Promise<WishlistItem[]> {
  const records = await pb.collection('wishlist').getFullList({
    filter: `userId = "${userId}"`,
    sort: '-created',
  });

  return records.map(recordToWishlistItem);
}

/**
 * Crée un item de wishlist à partir d'une carte
 */
export function createWishlistItemFromCard(
  cardName: string,
  quantity: number = 1,
  mtgData?: MTGCard,
  setCode?: string,
  collectorNumber?: string,
  rarity?: string,
  language?: string,
  notes?: string,
  targetPrice?: number
): Omit<WishlistItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
  return {
    name: cardName,
    quantity,
    set: mtgData?.set || setCode,
    setCode: setCode || mtgData?.set,
    collectorNumber: collectorNumber || mtgData?.number,
    rarity: rarity || mtgData?.rarity,
    language: language || 'en',
    mtgData,
    notes,
    targetPrice,
    scryfallId: mtgData?.id,
  };
}

/**
 * Ajoute un item à la wishlist
 */
export async function addWishlistItem(
  userId: string,
  item: Omit<WishlistItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const itemData = cleanForPocketBase({
    userId,
    ...item,
  });

  const record = await pb.collection('wishlist').create(itemData);
  return record.id;
}

/**
 * Met à jour un item de wishlist
 */
export async function updateWishlistItem(
  _userId: string,
  itemId: string,
  updates: Partial<Omit<WishlistItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const updateData = cleanForPocketBase(updates);
  await pb.collection('wishlist').update(itemId, updateData);
}

/**
 * Supprime un item de wishlist
 */
export async function deleteWishlistItem(_userId: string, itemId: string): Promise<void> {
  await pb.collection('wishlist').delete(itemId);
}

/**
 * Supprime tous les items de wishlist d'un utilisateur
 */
export async function deleteAllWishlistItems(userId: string): Promise<void> {
  const items = await getWishlistItems(userId);
  await Promise.all(items.map(item => pb.collection('wishlist').delete(item.id)));
}

/**
 * Vérifie si une carte est dans la wishlist
 */
export async function isCardInWishlist(
  userId: string,
  cardName: string,
  setCode?: string,
  collectorNumber?: string
): Promise<boolean> {
  let filter = `userId = "${userId}" && name = "${cardName}"`;
  
  if (setCode) {
    filter += ` && setCode = "${setCode}"`;
  }
  
  if (collectorNumber) {
    filter += ` && collectorNumber = "${collectorNumber}"`;
  }

  try {
    const records = await pb.collection('wishlist').getFullList({
      filter,
      limit: 1,
    });
    return records.length > 0;
  } catch (error) {
    console.error('Error checking if card is in wishlist:', error);
    return false;
  }
}
