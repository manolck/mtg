import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './useAuth';
import type { ImportJob, ImportStatus } from '../types/import';

export function useImports() {
  const { currentUser } = useAuth();
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      loadImports();
    } else {
      setImports([]);
      setLoading(false);
    }
  }, [currentUser]);

  async function loadImports() {
    if (!currentUser) return;

    try {
      setLoading(true);
      const importsRef = collection(db, 'users', currentUser.uid, 'imports');
      
      // Récupérer sans orderBy pour éviter les problèmes d'index
      // On triera côté client
      const snapshot = await getDocs(importsRef);
      
      const importsData: ImportJob[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        importsData.push({
          id: docSnap.id,
          ...data,
          csvContent: data.csvContent, // Inclure le CSV stocké
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          completedAt: data.completedAt?.toDate(),
          pausedAt: data.pausedAt?.toDate(),
        } as ImportJob);
      });

      // Trier par date de création (plus récent en premier)
      importsData.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return dateB - dateA;
      });

      // Limiter à 50 résultats
      const limitedImports = importsData.slice(0, 50);

      setImports(limitedImports);
      setError(null);
    } catch (err: any) {
      console.error('Error loading imports:', err);
      setError(`Erreur lors du chargement des imports: ${err.message || 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  }

  async function createImport(mode: 'add' | 'update', csvContentHash: string, totalCards: number, csvContent?: string): Promise<string> {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const importsRef = collection(db, 'users', currentUser.uid, 'imports');
      const now = Timestamp.now();
      
      // Pour Firestore, on utilise Timestamp, mais le type ImportJob utilise Date
      // On convertira lors de la lecture avec .toDate()
      // Stocker le CSV seulement s'il est fourni et pas trop volumineux (< 1MB)
      const newImport: any = {
        status: 'pending' as const,
        mode,
        csvContentHash,
        totalCards,
        currentIndex: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Stocker le CSV si fourni et raisonnablement petit (limite Firestore: 1MB par document)
      if (csvContent && csvContent.length < 900000) { // ~900KB pour laisser de la marge
        newImport.csvContent = csvContent;
      }

      const docRef = await addDoc(importsRef, newImport);

      await loadImports();
      return docRef.id;
    } catch (err) {
      console.error('Error creating import:', err);
      throw err;
    }
  }

  async function updateImportStatus(importId: string, status: ImportStatus, currentIndex?: number, error?: string) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const importRef = doc(db, 'users', currentUser.uid, 'imports', importId);
      const updateData: any = {
        status,
        updatedAt: Timestamp.now(),
      };

      if (currentIndex !== undefined) {
        updateData.currentIndex = currentIndex;
      }

      if (status === 'paused') {
        updateData.pausedAt = Timestamp.now();
      }

      if (status === 'completed') {
        updateData.completedAt = Timestamp.now();
      }

      if (status === 'failed' && error) {
        updateData.error = error;
      }

      await updateDoc(importRef, updateData);
      await loadImports();
    } catch (err) {
      console.error('Error updating import status:', err);
      throw err;
    }
  }

  async function updateImportProgress(importId: string, currentIndex: number, report?: Partial<ImportJob['report']>) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const importRef = doc(db, 'users', currentUser.uid, 'imports', importId);
      const updateData: any = {
        currentIndex,
        updatedAt: Timestamp.now(),
      };

      if (report) {
        // Mettre à jour le rapport partiel
        const importDoc = imports.find(imp => imp.id === importId);
        const existingReport = importDoc?.report || {
          success: 0,
          errors: 0,
          skipped: 0,
          updated: 0,
          added: 0,
          removed: 0,
          details: [],
        };

        updateData.report = {
          ...existingReport,
          ...report,
          details: report.details 
            ? [...(existingReport.details || []), ...report.details]
            : existingReport.details,
        };
      }

      await updateDoc(importRef, updateData);
      // Ne pas recharger toute la liste à chaque mise à jour pour éviter les ralentissements
      // On met à jour localement avec conversion correcte des données
      setImports(prev => prev.map(imp => {
        if (imp.id === importId) {
          const updated: ImportJob = {
            ...imp,
            currentIndex: updateData.currentIndex,
            updatedAt: new Date(),
            report: updateData.report ? {
              ...imp.report,
              ...updateData.report,
              // S'assurer que les détails sont correctement fusionnés
              details: updateData.report.details || imp.report?.details || [],
            } : imp.report,
          };
          return updated;
        }
        return imp;
      }));
    } catch (err) {
      console.error('Error updating import progress:', err);
      throw err;
    }
  }

  async function saveImportReport(importId: string, report: ImportJob['report']) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const importRef = doc(db, 'users', currentUser.uid, 'imports', importId);
      await updateDoc(importRef, {
        report,
        status: 'completed',
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await loadImports();
    } catch (err) {
      console.error('Error saving import report:', err);
      throw err;
    }
  }

  async function deleteImport(importId: string) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const importRef = doc(db, 'users', currentUser.uid, 'imports', importId);
      await deleteDoc(importRef);
      await loadImports();
    } catch (err) {
      console.error('Error deleting import:', err);
      throw err;
    }
  }

  return {
    imports,
    loading,
    error,
    createImport,
    updateImportStatus,
    updateImportProgress,
    saveImportReport,
    deleteImport,
    loadImports,
  };
}

