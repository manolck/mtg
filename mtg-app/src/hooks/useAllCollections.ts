import { useState, useEffect } from 'react';
import { collection, getDocs, collectionGroup } from 'firebase/firestore';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
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

      // Utiliser collectionGroup pour récupérer toutes les collections
      // Cela récupère toutes les sous-collections 'collection' de tous les utilisateurs
      const collectionsGroup = collectionGroup(db, 'collection');
      const snapshot = await getDocs(collectionsGroup);
      
      // Grouper par userId pour compter les cartes par utilisateur
      const userMap = new Map<string, { cardCount: number; userId: string }>();
      
      snapshot.forEach((docSnap) => {
        const userId = docSnap.ref.parent.parent?.id;
        if (userId) {
          if (!userMap.has(userId)) {
            userMap.set(userId, { userId, cardCount: 0 });
          }
          userMap.get(userId)!.cardCount++;
        }
      });

      const ownersData: CollectionOwner[] = [];

      // Pour chaque utilisateur trouvé, récupérer le profil
      for (const [userId, data] of userMap) {
        try {
          const profileRef = doc(db, 'users', userId, 'profile', 'data');
          const profileSnap = await getDoc(profileRef);
          
          let profile: UserProfile | null = null;
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            profile = {
              ...profileData,
              createdAt: profileData.createdAt?.toDate() || new Date(),
              updatedAt: profileData.updatedAt?.toDate() || new Date(),
            } as UserProfile;
          }

          ownersData.push({
            userId,
            profile,
            cardCount: data.cardCount,
          });
        } catch (err) {
          console.warn(`Error loading profile for user ${userId}:`, err);
          // Ajouter quand même l'utilisateur sans profil
          ownersData.push({
            userId,
            profile: null,
            cardCount: data.cardCount,
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
          const collectionRef = collection(db, 'users', currentUser.uid, 'collection');
          const snapshot = await getDocs(collectionRef);
          const cardCount = snapshot.size;
          
          const profileRef = doc(db, 'users', currentUser.uid, 'profile', 'data');
          const profileSnap = await getDoc(profileRef);
          
          let profile: UserProfile | null = null;
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            profile = {
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
            } as UserProfile;
          }

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

