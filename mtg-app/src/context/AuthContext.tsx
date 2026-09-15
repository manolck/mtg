// src/context/AuthContext.tsx (version PocketBase)
import { createContext, useContext, useEffect, useState } from 'react';
import { pb } from '../services/pocketbase';
import { rateLimiter, RATE_LIMITS } from '../services/rateLimiter';
import { errorHandler } from '../services/errorHandler';
import type { User } from '../types/user';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà authentifié
    if (pb.authStore.isValid) {
      const authModel = pb.authStore.model;
      if (authModel) {
        setCurrentUser({
          uid: authModel.id,
          email: authModel.email,
          displayName: authModel.pseudonym || undefined,
        });
      }
    }

    // Écouter les changements d'authentification
    pb.authStore.onChange((_token, model) => {
      if (model) {
        setCurrentUser({
          uid: model.id,
          email: model.email,
          displayName: model.pseudonym || undefined,
        });
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const rateKey = `login:${email.trim().toLowerCase()}`;
    if (!rateLimiter.canMakeRequest(rateKey, RATE_LIMITS.LOGIN)) {
      throw new Error('Trop de tentatives. Réessayez dans 15 minutes.');
    }

    try {
      await pb.collection('users').authWithPassword(email, password);
      rateLimiter.reset(rateKey);
    } catch (error: unknown) {
      const appError = errorHandler.handleError(error);
      throw new Error(appError.message);
    }
  }

  async function logout() {
    pb.authStore.clear();
    setCurrentUser(null);
  }

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}