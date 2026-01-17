// src/hooks/useAllCollections.ts
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadAllCollections();
  }, [currentUser]);

  async function loadAllCollections() {
    try {
      setLoading(true);
      setError(null);

      // Récupérer toutes les cartes
      const result = await collectionService.getAllCollections(1, 1000); // Récupérer beaucoup pour compter
      
      // Grouper par userId pour compter les cartes par utilisateur
      const userMap = new Map<string, number>();
      
      result.items.forEach((card) => {
        const userId = card.userId;
        if (userId) {
          userMap.set(userId, (userMap.get(userId) || 0) + 1);
        }
      });

      const ownersData: CollectionOwner[] = [];

      // Pour chaque utilisateur trouvé, récupérer le profil
      for (const [userId, cardCount] of userMap) {
        try {
          const profileRecord = await pb.collection('users').getOne(userId);
          
          // Gérer la compatibilité avec l'ancien format (role string) et le nouveau (roles array)
          let roles: string[] = ['user'];
          if (profileRecord.roles && Array.isArray(profileRecord.roles)) {
            roles = profileRecord.roles;
          } else if (profileRecord.role) {
            // Migration depuis l'ancien format
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
          // Ajouter quand même l'utilisateur sans profil
          ownersData.push({
            userId,
            profile: null,
            cardCount,
          });
        }
      }

      // Trier par nombre de cartes (décroissant)
      ownersData.sort((a, b) => b.cardCount - a.cardCount);

      setOwners(ownersData);
    } catch (err: any) {
      console.error('Error loading all collections:', err);
      // Si c'est une erreur de permissions, on retourne au moins l'utilisateur actuel
      if (currentUser) {
        try {
          const cards = await collectionService.getCollection(currentUser.uid);
          const cardCount = cards.length;
          
          const profileRecord = await pb.collection('users').getOne(currentUser.uid);
          
          // Gérer la compatibilité avec l'ancien format (role string) et le nouveau (roles array)
          let roles: string[] = ['user'];
          if (profileRecord.roles && Array.isArray(profileRecord.roles)) {
            roles = profileRecord.roles;
          } else if (profileRecord.role) {
            // Migration depuis l'ancien format
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

          setOwners([{
            userId: currentUser.uid,
            profile,
            cardCount,
          }]);
        } catch (fallbackErr) {
          console.error('Error in fallback:', fallbackErr);
        }
      }
      setError('Erreur lors du chargement des collections');
    } finally {
      setLoading(false);
    }
  }

  return {
    owners,
    loading,
    error,
    refresh: loadAllCollections,
  };
}
