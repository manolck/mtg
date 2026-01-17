// src/hooks/useAdmin.ts
import { useState, useEffect } from 'react';
import { pb } from '../services/pocketbase';
import { useAuth } from './useAuth';

export function useAdmin() {
  const { currentUser } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminStatus() {
      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const profileRecord = await pb.collection('users').getOne(currentUser.uid);

        if (profileRecord) {
          const adminStatus = profileRecord.role === 'admin';
          if (isMounted) {
            setIsAdmin(adminStatus);
          }
        } else {
          if (isMounted) {
            setIsAdmin(false);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        if (isMounted) {
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  return { isAdmin, loading };
}
