import { useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, orderBy, type Unsubscribe } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  getWishlistItems,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  deleteAllWishlistItems,
  isCardInWishlist,
  createWishlistItemFromCard,
} from '../services/wishlistService';
import type { WishlistItem } from '../types/card';
import type { MTGCard } from '../types/card';

export function useWishlist(userId?: string) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Charger les items initiaux
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    const loadWishlist = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Charger les items initiaux
        const initialItems = await getWishlistItems(userId);
        setItems(initialItems);

        // Écouter les changements en temps réel
        const wishlistRef = collection(db, 'users', userId, 'wishlist');
        const q = query(wishlistRef, orderBy('createdAt', 'desc'));
        
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const updatedItems = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
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
              } as WishlistItem;
            });
            setItems(updatedItems);
            setLoading(false);
          },
          (err) => {
            console.error('Error in wishlist snapshot:', err);
            setError(err as Error);
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('Error loading wishlist:', err);
        setError(err as Error);
        setLoading(false);
      }
    };

    loadWishlist();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  const addItem = useCallback(
    async (
      cardName: string,
      quantity: number = 1,
      mtgData?: MTGCard,
      setCode?: string,
      collectorNumber?: string,
      rarity?: string,
      language?: string,
      notes?: string,
      targetPrice?: number
    ): Promise<string> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        const item = createWishlistItemFromCard(
          cardName,
          quantity,
          mtgData,
          setCode,
          collectorNumber,
          rarity,
          language,
          notes,
          targetPrice
        );
        return await addWishlistItem(userId, item);
      } catch (err) {
        console.error('Error adding wishlist item:', err);
        throw err;
      }
    },
    [userId]
  );

  const updateItem = useCallback(
    async (
      itemId: string,
      updates: Partial<Omit<WishlistItem, 'id' | 'userId' | 'createdAt'>>
    ): Promise<void> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        await updateWishlistItem(userId, itemId, updates);
      } catch (err) {
        console.error('Error updating wishlist item:', err);
        throw err;
      }
    },
    [userId]
  );

  const removeItem = useCallback(
    async (itemId: string): Promise<void> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        await deleteWishlistItem(userId, itemId);
      } catch (err) {
        console.error('Error removing wishlist item:', err);
        throw err;
      }
    },
    [userId]
  );

  const clearWishlist = useCallback(async (): Promise<void> => {
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      await deleteAllWishlistItems(userId);
    } catch (err) {
      console.error('Error clearing wishlist:', err);
      throw err;
    }
  }, [userId]);

  const checkIfInWishlist = useCallback(
    async (
      cardName: string,
      setCode?: string,
      collectorNumber?: string
    ): Promise<boolean> => {
      if (!userId) {
        return false;
      }

      try {
        return await isCardInWishlist(userId, cardName, setCode, collectorNumber);
      } catch (err) {
        console.error('Error checking if card is in wishlist:', err);
        return false;
      }
    },
    [userId]
  );

  return {
    items,
    loading,
    error,
    addItem,
    updateItem,
    removeItem,
    clearWishlist,
    checkIfInWishlist,
  };
}



