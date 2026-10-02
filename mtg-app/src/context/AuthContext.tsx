// src/context/AuthContext.tsx (version PocketBase)
import { useEffect, useState } from 'react';
import { pb } from '../services/pocketbase';
import { rateLimiter, RATE_LIMITS } from '../services/rateLimiter';
import { errorHandler } from '../services/errorHandler';
import type { User } from '../types/user';
import { AuthContext, type AuthContextType } from './authContextStore';

function userFromAuthModel(model: { id: string; email: string; pseudonym?: string } | null): User | null {
  if (!model) return null;
  return {
    uid: model.id,
    email: model.email,
    displayName: model.pseudonym || undefined,
  };
}

function readInitialUser(): User | null {
  if (!pb.authStore.isValid) return null;
  const model = pb.authStore.model as { id: string; email: string; pseudonym?: string } | null;
  return userFromAuthModel(model);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(readInitialUser);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, model) => {
      setCurrentUser(
        userFromAuthModel(model as { id: string; email: string; pseudonym?: string } | null),
      );
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    const rateKey = `login:${email.trim().toLowerCase()}`;
    if (!rateLimiter.canMakeRequest(rateKey, RATE_LIMITS.LOGIN)) {
      throw new Error('Trop de tentatives. Réessayez dans 15 minutes.');
    }

    try {
      await pb.collection('users').authWithPassword(email.trim(), password);
      rateLimiter.reset(rateKey);
    } catch (error: unknown) {
      const appError = errorHandler.handleError(error);
      let host = '';
      try {
        host = new URL(pb.baseUrl).host;
      } catch {
        host = '';
      }
      throw new Error(host ? `${appError.message} (serveur ${host})` : appError.message);
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
