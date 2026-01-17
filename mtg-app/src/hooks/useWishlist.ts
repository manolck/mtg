// src/hooks/useWishlist.ts
import { useState, useEffect, useCallback } from 'react';
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

    const loadWishlist = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Charger les items initiaux
        const initialItems = await getWishlistItems(userId);
        setItems(initialItems);
        setLoading(false);
      } catch (err) {
        console.error('Error loading wishlist:', err);
        setError(err as Error);
        setLoading(false);
      }
    };

    loadWishlist();

    // Note: PocketBase ne supporte pas les subscriptions en temps réel comme Firestore
    // Il faudrait implémenter un polling ou utiliser WebSockets si nécessaire
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
        const itemId = await addWishlistItem(userId, item);
        // Recharger la liste
        const updatedItems = await getWishlistItems(userId);
        setItems(updatedItems);
        return itemId;
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
      updates: Partial<Omit<WishlistItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
    ): Promise<void> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        await updateWishlistItem(userId, itemId, updates);
        // Recharger la liste
        const updatedItems = await getWishlistItems(userId);
        setItems(updatedItems);
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
        // Mettre à jour localement
        setItems(prev => prev.filter(item => item.id !== itemId));
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
      setItems([]);
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
