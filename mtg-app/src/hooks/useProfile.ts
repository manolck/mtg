// src/hooks/useProfile.ts
import { useState, useEffect } from 'react';
import * as profileService from '../services/profileService';
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
      let userProfile = await profileService.getProfile(currentUser.uid);

      if (!userProfile) {
        // Créer un profil par défaut
        const defaultAvatar = getDefaultAvatar();
        userProfile = await profileService.createDefaultProfile(
          currentUser.uid,
          currentUser.email || ''
        );
        // S'assurer que l'avatar par défaut est défini
        if (!userProfile.avatarId) {
          userProfile = await profileService.updateProfile(currentUser.uid, {
            avatarId: defaultAvatar.id,
            pseudonym: currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur',
            preferredLanguage: 'fr',
          });
        }
      }

      setProfile(userProfile);
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
      const updatedProfile = await profileService.updateProfile(currentUser.uid, updates);

      // Mettre à jour l'état local directement pour éviter un rechargement inutile
      setProfile(prev => prev ? {
        ...prev,
        ...updatedProfile,
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
