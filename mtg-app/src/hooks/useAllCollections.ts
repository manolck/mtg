// src/hooks/useAllCollections.ts
import { useState, useEffect, useCallback } from 'react';
import { pb } from '../services/pocketbase';
import * as collectionService from '../services/collectionService';
import type { UserProfile } from '../types/user';
import { useAuth } from './useAuth';

export interface CollectionOwner {
  userId: string;
  profile: UserProfile | null;
  cardCount: number;
}

export function useAllCollections() {
  const { currentUser } = useAuth();
  const [owners, setOwners] = useState<CollectionOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Paginer sur toutes les pages pour compter correctement (au-delà de 1000 cartes)
      const perPage = 500;
      const first = await collectionService.getAllCollections(1, perPage);
      const userMap = new Map<string, number>();

      first.items.forEach((card) => {
        const userId = card.userId;
        if (userId) {
          userMap.set(userId, (userMap.get(userId) || 0) + 1);
        }
      });

      for (let page = 2; page <= first.totalPages; page++) {
        const result = await collectionService.getAllCollections(page, perPage);
        result.items.forEach((card) => {
          const userId = card.userId;
          if (userId) {
            userMap.set(userId, (userMap.get(userId) || 0) + 1);
          }
        });
      }

      const ownersData: CollectionOwner[] = [];

      for (const [userId, cardCount] of userMap) {
        try {
          const profileRecord = await pb.collection('users').getOne(userId);

          let roles: string[] = ['user'];
          if (profileRecord.roles && Array.isArray(profileRecord.roles)) {
            roles = profileRecord.roles;
          } else if (profileRecord.role) {
            roles = profileRecord.role === 'admin' ? ['user', 'admin'] : ['user'];
          }

          const profile: UserProfile = {
            uid: profileRecord.id,
            email: profileRecord.email,
            pseudonym: profileRecord.pseudonym,
            avatarId: profileRecord.avatarId || 'default',
            roles,
            preferredLanguage: profileRecord.preferredLanguage || 'en',
            createdAt: new Date(profileRecord.created),
            updatedAt: new Date(profileRecord.updated),
          };

          ownersData.push({
            userId,
            profile,
            cardCount,
          });
        } catch (err) {
          console.warn(`Error loading profile for user ${userId}:`, err);
          ownersData.push({
            userId,
            profile: null,
            cardCount,
          });
        }
      }

      ownersData.sort((a, b) => b.cardCount - a.cardCount);

      setOwners(ownersData);
    } catch (err: unknown) {
      console.error('Error loading all collections:', err);
      if (currentUser) {
        try {
          const cards = await collectionService.getCollection(currentUser.uid);
          const cardCount = cards.length;

          const profileRecord = await pb.collection('users').getOne(currentUser.uid);

          let roles: string[] = ['user'];
          if (profileRecord.roles && Array.isArray(profileRecord.roles)) {
            roles = profileRecord.roles;
          } else if (profileRecord.role) {
            roles = profileRecord.role === 'admin' ? ['user', 'admin'] : ['user'];
          }

          const profile: UserProfile = {
            uid: profileRecord.id,
            email: profileRecord.email,
            pseudonym: profileRecord.pseudonym,
            avatarId: profileRecord.avatarId || 'default',
            roles,
            preferredLanguage: profileRecord.preferredLanguage || 'en',
            createdAt: new Date(profileRecord.created),
            updatedAt: new Date(profileRecord.updated),
          };

          setOwners([
            {
              userId: currentUser.uid,
              profile,
              cardCount,
            },
          ]);
        } catch (fallbackErr) {
          console.error('Error in fallback:', fallbackErr);
        }
      }
      setError('Erreur lors du chargement des collections');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadAllCollections();
  }, [loadAllCollections]);

  return {
    owners,
    loading,
    error,
    refresh: loadAllCollections,
  };
}
