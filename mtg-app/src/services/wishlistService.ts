import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { WishlistItem } from '../types/card';
import type { MTGCard } from '../types/card';

/**
 * Nettoie un objet en retirant tous les champs undefined pour la compatibilité Firestore
 */
function cleanForFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Convertit un document Firestore en WishlistItem
 */
function firestoreToWishlistItem(docData: DocumentData, id: string): WishlistItem {
  const data = docData;
  return {
    id,
    name: data.name || '',
    quantity: data.quantity || 1,
    set: data.set,
    setCode: data.setCode,
    collectorNumber: data.collectorNumber,
    rarity: data.rarity,
    language: data.language,
    mtgData: data.mtgData,
    userId: data.userId || '',
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    notes: data.notes,
    targetPrice: data.targetPrice,
    scryfallId: data.scryfallId,
  };
}

/**
 * Récupère tous les items de la wishlist d'un utilisateur
 */
export async function getWishlistItems(userId: string): Promise<WishlistItem[]> {
  try {
    const wishlistRef = collection(db, 'users', userId, 'wishlist');
    const q = query(wishlistRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => firestoreToWishlistItem(doc.data(), doc.id));
  } catch (error) {
    console.error('Error fetching wishlist items:', error);
    throw error;
  }
}

/**
 * Récupère un item de wishlist par son ID
 */
export async function getWishlistItem(userId: string, itemId: string): Promise<WishlistItem | null> {
  try {
    const itemRef = doc(db, 'users', userId, 'wishlist', itemId);
    const itemSnap = await getDoc(itemRef);
    
    if (!itemSnap.exists()) {
      return null;
    }
    
    return firestoreToWishlistItem(itemSnap.data(), itemSnap.id);
  } catch (error) {
    console.error('Error fetching wishlist item:', error);
    throw error;
  }
}

/**
 * Ajoute un item à la wishlist
 */
export async function addWishlistItem(
  userId: string,
  item: Omit<WishlistItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const wishlistRef = collection(db, 'users', userId, 'wishlist');
    const now = Timestamp.now();
    
    const itemData = cleanForFirestore({
      ...item,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    
    const docRef = await addDoc(wishlistRef, itemData);
    return docRef.id;
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    throw error;
  }
}

/**
 * Met à jour un item de wishlist
 */
export async function updateWishlistItem(
  userId: string,
  itemId: string,
  updates: Partial<Omit<WishlistItem, 'id' | 'userId' | 'createdAt'>> & { updatedAt?: Date }
): Promise<void> {
  try {
    const itemRef = doc(db, 'users', userId, 'wishlist', itemId);
    const updateData: any = {
      ...cleanForFirestore(updates),
      updatedAt: Timestamp.now(),
    };
    
    await updateDoc(itemRef, updateData);
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    throw error;
  }
}

/**
 * Supprime un item de wishlist
 */
export async function deleteWishlistItem(userId: string, itemId: string): Promise<void> {
  try {
    const itemRef = doc(db, 'users', userId, 'wishlist', itemId);
    await deleteDoc(itemRef);
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    throw error;
  }
}

/**
 * Supprime tous les items de la wishlist
 */
export async function deleteAllWishlistItems(userId: string): Promise<void> {
  try {
    const wishlistRef = collection(db, 'users', userId, 'wishlist');
    const snapshot = await getDocs(wishlistRef);
    
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting all wishlist items:', error);
    throw error;
  }
}

/**
 * Vérifie si une carte est déjà dans la wishlist
 */
export async function isCardInWishlist(
  userId: string,
  cardName: string,
  setCode?: string,
  collectorNumber?: string
): Promise<boolean> {
  try {
    const wishlistRef = collection(db, 'users', userId, 'wishlist');
    let q = query(wishlistRef, where('name', '==', cardName));
    
    if (setCode) {
      q = query(wishlistRef, where('name', '==', cardName), where('setCode', '==', setCode));
    }
    
    if (setCode && collectorNumber) {
      q = query(
        wishlistRef,
        where('name', '==', cardName),
        where('setCode', '==', setCode),
        where('collectorNumber', '==', collectorNumber)
      );
    }
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking if card is in wishlist:', error);
    return false;
  }
}

/**
 * Crée un item de wishlist à partir d'une carte de collection
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
    set: mtgData?.set,
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




