// src/services/adminAuth.ts
import { pb } from './pocketbase';
import type { UserProfile, AdminUser } from '../types/user';

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
 * Créer un nouvel utilisateur
 */
export async function createUser(userData: AdminUser): Promise<{ uid: string; email: string }> {
  try {
    // Créer l'utilisateur dans PocketBase
    const record = await pb.collection('users').create({
      email: userData.email,
      password: userData.password,
      passwordConfirm: userData.password,
      role: userData.role || 'user',
      pseudonym: userData.email.split('@')[0],
      avatarId: 'default',
      preferredLanguage: 'fr',
    });

    return {
      uid: record.id,
      email: record.email,
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
}

/**
 * Mettre à jour un utilisateur
 */
export async function updateUser(uid: string, updates: { email?: string; password?: string; role?: 'admin' | 'user' }): Promise<void> {
  try {
    const updateData: any = cleanForPocketBase({
      role: updates.role,
    });

    // Note: La mise à jour de l'email et du mot de passe nécessite des opérations spéciales dans PocketBase
    if (updates.email) {
      updateData.email = updates.email;
    }

    if (updates.password) {
      updateData.password = updates.password;
      updateData.passwordConfirm = updates.password;
    }

    await pb.collection('users').update(uid, updateData);
  } catch (error: any) {
    console.error('Error updating user:', error);
    throw new Error(error.message || 'Failed to update user');
  }
}

/**
 * Supprimer un utilisateur
 * Note: Cette fonction supprime l'utilisateur et toutes ses données associées
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  try {
    // Supprimer toutes les données de l'utilisateur
    // Collections
    const collections = await pb.collection('collection').getFullList({
      filter: `userId = "${uid}"`,
    });
    await Promise.all(collections.map(c => pb.collection('collection').delete(c.id)));

    // Decks
    const decks = await pb.collection('decks').getFullList({
      filter: `userId = "${uid}"`,
    });
    await Promise.all(decks.map(d => pb.collection('decks').delete(d.id)));

    // Imports
    const imports = await pb.collection('imports').getFullList({
      filter: `userId = "${uid}"`,
    });
    await Promise.all(imports.map(i => pb.collection('imports').delete(i.id)));

    // Wishlist
    const wishlist = await pb.collection('wishlist').getFullList({
      filter: `userId = "${uid}"`,
    });
    await Promise.all(wishlist.map(w => pb.collection('wishlist').delete(w.id)));

    // Legal (GDPR consent)
    const legal = await pb.collection('legal').getFullList({
      filter: `userId = "${uid}"`,
    });
    await Promise.all(legal.map(l => pb.collection('legal').delete(l.id)));

    // Supprimer l'utilisateur lui-même
    await pb.collection('users').delete(uid);
  } catch (error: any) {
    console.error('Error deleting user account:', error);
    throw new Error(error.message || 'Failed to delete user account');
  }
}

/**
 * Lister tous les utilisateurs
 */
export async function listUsers(): Promise<UserProfile[]> {
  try {
    const records = await pb.collection('users').getFullList({
      sort: '-created',
    });

    return records.map(recordToUserProfile);
  } catch (error: any) {
    console.error('Error listing users:', error);
    throw new Error(error.message || 'Failed to list users');
  }
}
