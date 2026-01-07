import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile, AdminUser } from '../types/user';

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;

/**
 * Service pour gérer les utilisateurs en tant qu'admin
 * Utilise l'API REST Firebase Identity Toolkit
 * 
 * Note: Pour une vraie gestion admin, il faudrait utiliser Firebase Admin SDK
 * Cette implémentation utilise l'API REST avec des limitations
 */

interface CreateUserResponse {
  uid: string;
  email: string;
}

/**
 * Créer un nouvel utilisateur
 * Utilise l'API REST Firebase Identity Toolkit
 */
export async function createUser(userData: AdminUser): Promise<CreateUserResponse> {
  if (!API_KEY) {
    throw new Error('Firebase API key is not configured');
  }

  try {
    // Utiliser l'API REST Firebase Identity Toolkit pour créer l'utilisateur
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to create user');
    }

    const uid = data.localId;
    const email = data.email;

    // Créer le profil utilisateur dans Firestore
    const profileRef = doc(db, 'users', uid, 'profile', 'data');
    const profile: UserProfile = {
      uid,
      email,
      role: userData.role || 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(profileRef, profile);

    // Déconnecter l'utilisateur créé (car signUp le connecte automatiquement)
    // On ne peut pas le faire directement, donc on laisse l'admin gérer cela

    return { uid, email };
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
}

/**
 * Mettre à jour un utilisateur
 * Note: Cette fonction nécessite que l'utilisateur soit connecté
 * Pour une vraie gestion admin, utiliser Firebase Admin SDK
 */
export async function updateUser(uid: string, updates: { email?: string; password?: string; role?: 'admin' | 'user' }): Promise<void> {
  try {
    // Mettre à jour le profil dans Firestore
    const profileRef = doc(db, 'users', uid, 'profile', 'data');
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      throw new Error('User profile not found');
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.role !== undefined) {
      updateData.role = updates.role;
    }

    await setDoc(profileRef, updateData, { merge: true });

    // Note: Pour mettre à jour l'email ou le mot de passe via l'API REST,
    // il faudrait que l'utilisateur soit connecté ou utiliser Admin SDK
    // Pour l'instant, on ne met à jour que le rôle dans Firestore
    if (updates.email || updates.password) {
      console.warn('Email and password updates require Firebase Admin SDK or user authentication');
    }
  } catch (error: any) {
    console.error('Error updating user:', error);
    throw new Error(error.message || 'Failed to update user');
  }
}

/**
 * Supprimer un utilisateur
 * Note: Cette fonction nécessite Firebase Admin SDK pour une vraie suppression
 * Cette implémentation supprime seulement le profil Firestore
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  try {
    // Supprimer le profil dans Firestore
    const profileRef = doc(db, 'users', uid, 'profile', 'data');
    await setDoc(profileRef, {}, { merge: false });

    // Note: Pour supprimer vraiment l'utilisateur de Firebase Auth,
    // il faudrait utiliser Firebase Admin SDK
    // Cette fonction supprime seulement les données Firestore
    console.warn('User account deletion requires Firebase Admin SDK. Only Firestore data was deleted.');
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
}

/**
 * Lister tous les utilisateurs
 * Récupère tous les profils depuis Firestore
 */
export async function listUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    const users: UserProfile[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const profileRef = doc(db, 'users', userDoc.id, 'profile', 'data');
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const data = profileSnap.data();
        users.push({
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as UserProfile);
      }
    }

    return users.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error: any) {
    console.error('Error listing users:', error);
    throw new Error(error.message || 'Failed to list users');
  }
}

/**
 * Obtenir les détails d'un utilisateur
 */
export async function getUser(uid: string): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'users', uid, 'profile', 'data');
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return null;
    }

    const data = profileSnap.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as UserProfile;
  } catch (error: any) {
    console.error('Error getting user:', error);
    throw new Error(error.message || 'Failed to get user');
  }
}

