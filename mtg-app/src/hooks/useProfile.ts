import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { UserProfile } from '../types/user';
import { useAuth } from './useAuth';
import { getDefaultAvatar } from '../data/avatars';

export function useProfile() {
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    if (currentUser) {
      loadProfile().then(() => {
        if (!isMounted) {
          setLoading(false);
        }
      });
    } else {
      setProfile(null);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  async function loadProfile() {
    if (!currentUser) return;

    try {
      setLoading(true);
      const profileRef = doc(db, 'users', currentUser.uid, 'profile', 'data');
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const data = profileSnap.data();
        setProfile({
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as UserProfile);
      } else {
        // Créer un profil par défaut
        const defaultAvatar = getDefaultAvatar();
        const defaultProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          pseudonym: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
          avatarId: defaultAvatar.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await setDoc(profileRef, defaultProfile);
        setProfile(defaultProfile);
      }
      setError(null);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Erreur lors du chargement du profil');
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const profileRef = doc(db, 'users', currentUser.uid, 'profile', 'data');
      
      await updateDoc(profileRef, {
        ...updates,
        updatedAt: new Date(),
      });

      // Mettre à jour l'état local directement pour éviter un rechargement inutile
      setProfile(prev => prev ? {
        ...prev,
        ...updates,
        updatedAt: new Date(),
      } : null);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Erreur lors de la mise à jour du profil');
      throw err;
    }
  }


  return {
    profile,
    loading,
    error,
    updateProfile,
    refresh: loadProfile,
  };
}

