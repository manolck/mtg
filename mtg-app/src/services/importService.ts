// src/services/importService.ts
import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import type { ImportJob, ImportStatus, ImportReport } from '../types/import';

/** Statuts pour lesquels le CSV brut n'est plus nécessaire (reprise impossible / terminée). */
const CSV_CLEAR_STATUSES: ImportStatus[] = ['completed', 'failed', 'cancelled'];

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
 * Convertit un record PocketBase en ImportJob
 */
function recordToImportJob(record: any): ImportJob {
  return {
    id: record.id,
    userId: typeof record.userId === 'string' ? record.userId : record.userId?.id || record.userId,
    status: record.status,
    mode: record.mode,
    csvContent: record.csvContent,
    csvContentHash: record.csvContentHash,
    totalCards: record.totalCards,
    currentIndex: record.currentIndex || 0,
    progress: record.progress,
    report: record.report,
    error: record.error,
    createdAt: new Date(record.created),
    updatedAt: new Date(record.updated),
    completedAt: record.completedAt ? new Date(record.completedAt) : undefined,
    pausedAt: record.pausedAt ? new Date(record.pausedAt) : undefined,
  };
}

/**
 * Récupère tous les imports d'un utilisateur
 */
export async function getImports(userId: string): Promise<ImportJob[]> {
  const records = await pb.collection('imports').getFullList({
    filter: pbEqual('userId', userId),
    sort: '-created',
    limit: 50,
  });

  return records.map(recordToImportJob);
}

/** PocketBase 0.23+ text fields default to 5000 chars. Keep a margin. */
const MAX_STORED_CSV_CHARS = 4000;

/**
 * Crée un nouvel import
 */
export async function createImport(
  userId: string,
  mode: 'add' | 'update',
  csvContentHash: string,
  totalCards: number,
  csvContent?: string
): Promise<string> {
  const canStoreCsv = Boolean(csvContent && csvContent.length < MAX_STORED_CSV_CHARS);
  const importData = cleanForPocketBase({
    userId,
    status: 'pending' as ImportStatus,
    mode,
    csvContentHash,
    totalCards,
    currentIndex: 0,
    csvContent: canStoreCsv ? csvContent : undefined,
  });

  try {
    const record = await pb.collection('imports').create(importData);
    return record.id;
  } catch (error) {
    if (importData.csvContent) {
      const retryData = { ...importData, csvContent: undefined };
      const record = await pb.collection('imports').create(retryData);
      return record.id;
    }
    throw error;
  }
}

/**
 * Met à jour le statut d'un import
 */
export async function updateImportStatus(
  importId: string,
  status: ImportStatus,
  currentIndex?: number,
  error?: string
): Promise<void> {
  const updateData: any = cleanForPocketBase({
    status,
    currentIndex,
    error,
  });

  if (status === 'paused') {
    updateData.pausedAt = new Date().toISOString();
  }

  if (status === 'completed') {
    updateData.completedAt = new Date().toISOString();
  }

  if (CSV_CLEAR_STATUSES.includes(status)) {
    // Ne pas conserver le CSV brut une fois l'import terminé / annulé / en échec
    updateData.csvContent = '';
  }

  await pb.collection('imports').update(importId, updateData);
}

/**
 * Met à jour la progression d'un import
 */
export async function updateImportProgress(
  importId: string,
  progress: Partial<ImportJob['progress']>,
  report?: Partial<ImportReport>
): Promise<void> {
  const updateData: any = cleanForPocketBase({
    progress,
    report,
  });

  await pb.collection('imports').update(importId, updateData);
}

/**
 * Sauvegarde le rapport final d'un import
 */
export async function saveImportReport(importId: string, report: ImportReport): Promise<void> {
  await pb.collection('imports').update(importId, {
    report,
    status: 'completed',
    completedAt: new Date().toISOString(),
    csvContent: '',
  });
}

/**
 * Supprime un import
 */
export async function deleteImport(importId: string): Promise<void> {
  await pb.collection('imports').delete(importId);
}
