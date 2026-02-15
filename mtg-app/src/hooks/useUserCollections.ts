import { useState, useEffect, useCallback } from 'react';
import * as collectionService from '../services/collectionService';
import type { UserCollection } from '../types/card';
import { useAuth } from './useAuth';

export function useUserCollections(userId?: string) {
  const { currentUser } = useAuth();
  const targetUserId = userId ?? currentUser?.uid ?? null;
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!targetUserId) {
      setCollections([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const list = await collectionService.getUserCollections(targetUserId);
      setCollections(list);
    } catch (err: any) {
      console.error('Error loading user collections:', err);
      setError(err?.message ?? 'Erreur lors du chargement des collections');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const createCollection = useCallback(
    async (name: string): Promise<UserCollection | null> => {
      if (!targetUserId) return null;
      try {
        const created = await collectionService.createCollection(targetUserId, name);
        setCollections((prev) => [...prev, created].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
        return created;
      } catch (err: any) {
        console.error('Error creating collection:', err);
        throw err;
      }
    },
    [targetUserId]
  );

  const updateCollection = useCallback(async (collectionId: string, name: string): Promise<void> => {
    try {
      const updated = await collectionService.updateCollection(collectionId, name);
      setCollections((prev) => prev.map((c) => (c.id === collectionId ? updated : c)));
    } catch (err: any) {
      console.error('Error updating collection:', err);
      throw err;
    }
  }, []);

  const deleteCollection = useCallback(async (collectionId: string): Promise<void> => {
    try {
      await collectionService.deleteCollection(collectionId);
      setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    } catch (err: any) {
      console.error('Error deleting collection:', err);
      throw err;
    }
  }, []);

  return {
    collections,
    loading,
    error,
    refresh: load,
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
