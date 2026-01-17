// src/hooks/useImports.ts
import { useState, useEffect } from 'react';
import * as importService from '../services/importService';
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
      const importsData = await importService.getImports(currentUser.uid);
      
      // Trier par date de création (plus récent en premier)
      importsData.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return dateB - dateA;
      });

      setImports(importsData);
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
      const importId = await importService.createImport(
        currentUser.uid,
        mode,
        csvContentHash,
        totalCards,
        csvContent
      );
      await loadImports();
      return importId;
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
      await importService.updateImportStatus(currentUser.uid, importId, status, currentIndex, error);
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
      await importService.updateImportProgress(currentUser.uid, importId, currentIndex, report);
      
      // Mettre à jour localement sans recharger toute la liste
      setImports(prev => prev.map(imp => {
        if (imp.id === importId) {
          return {
            ...imp,
            currentIndex,
            updatedAt: new Date(),
            report: report ? {
              ...imp.report,
              ...report,
              details: report.details 
                ? [...(imp.report?.details || []), ...report.details]
                : imp.report?.details,
            } : imp.report,
          };
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
      await importService.saveImportReport(currentUser.uid, importId, report);
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
      await importService.deleteImport(currentUser.uid, importId);
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
