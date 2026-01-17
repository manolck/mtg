// src/services/profileService.ts
import { pb } from './pocketbase';
import type { UserProfile } from '../types/user';

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
 * Convertit un record PocketBase en UserProfile
 */
function recordToUserProfile(record: any): UserProfile {
  return {
    uid: record.id,
    email: record.email,
    pseudonym: record.pseudonym,
    avatarId: record.avatarId || 'default',
    role: record.role || 'user',
    preferredLanguage: record.preferredLanguage || 'en',
    createdAt: new Date(record.created),
    updatedAt: new Date(record.updated),
  };
}

/**
 * Récupère le profil d'un utilisateur
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  try {
    const record = await pb.collection('users').getOne(userId);
    return recordToUserProfile(record);
  } catch (error: any) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Crée un profil par défaut pour un utilisateur
 */
export async function createDefaultProfile(userId: string, email: string): Promise<UserProfile> {
  const defaultProfile = {
    email,
    pseudonym: email.split('@')[0] || 'Joueur',
    avatarId: 'default',
    role: 'user',
    preferredLanguage: 'fr',
  };

  const record = await pb.collection('users').update(userId, cleanForPocketBase(defaultProfile));
  return recordToUserProfile(record);
}

/**
 * Met à jour le profil d'un utilisateur
 */
export async function updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const updateData = cleanForPocketBase({
    pseudonym: updates.pseudonym,
    avatarId: updates.avatarId,
    role: updates.role,
    preferredLanguage: updates.preferredLanguage,
  });

  const record = await pb.collection('users').update(userId, updateData);
  return recordToUserProfile(record);
}
