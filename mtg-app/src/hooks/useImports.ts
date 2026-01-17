// src/hooks/useImports.ts
import { useState, useEffect } from 'react';
import * as importService from '../services/importService';
import { useAuth } from './useAuth';
import type { ImportJob, ImportStatus, ImportReport } from '../types/import';

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
      await importService.updateImportStatus(importId, status, currentIndex, error);
      await loadImports();
    } catch (err) {
      console.error('Error updating import status:', err);
      throw err;
    }
  }

  async function updateImportProgress(importId: string, progress: Partial<ImportJob['progress']>, report?: Partial<ImportJob['report']>) {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      await importService.updateImportProgress(importId, progress, report);
      
      // Mettre à jour localement sans recharger toute la liste
      setImports(prev => prev.map(imp => {
        if (imp.id === importId) {
          const updatedReport: ImportReport | undefined = report && imp.report ? {
            success: report.success ?? imp.report.success,
            errors: report.errors ?? imp.report.errors,
            skipped: report.skipped ?? imp.report.skipped,
            updated: report.updated ?? imp.report.updated,
            added: report.added ?? imp.report.added,
            removed: report.removed ?? imp.report.removed,
            details: report.details 
              ? [...(imp.report.details || []), ...report.details]
              : imp.report.details,
          } : (report ? {
            success: report.success ?? 0,
            errors: report.errors ?? 0,
            skipped: report.skipped ?? 0,
            updated: report.updated ?? 0,
            added: report.added ?? 0,
            removed: report.removed ?? 0,
            details: report.details ?? [],
          } : imp.report);
          
          const updatedProgress: ImportJob['progress'] | undefined = progress && imp.progress ? {
            current: progress.current ?? imp.progress.current,
            total: progress.total ?? imp.progress.total,
            currentCard: progress.currentCard ?? imp.progress.currentCard,
            success: progress.success ?? imp.progress.success,
            errors: progress.errors ?? imp.progress.errors,
            skipped: progress.skipped ?? imp.progress.skipped,
            details: progress.details ?? imp.progress.details,
          } : (progress ? {
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            currentCard: progress.currentCard,
            success: progress.success ?? 0,
            errors: progress.errors ?? 0,
            skipped: progress.skipped ?? 0,
            details: progress.details,
          } : imp.progress);
          
          return {
            ...imp,
            progress: updatedProgress,
            updatedAt: new Date(),
            report: updatedReport,
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

    if (!report) {
      throw new Error('Report is required');
    }

    try {
      await importService.saveImportReport(importId, report);
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
      await importService.deleteImport(importId);
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
