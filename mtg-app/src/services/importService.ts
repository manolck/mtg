// src/services/importService.ts
import { pb } from './pocketbase';
import type { ImportJob, ImportStatus } from '../types/import';

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
    filter: `userId = "${userId}"`,
    sort: '-created',
    limit: 50,
  });

  return records.map(recordToImportJob);
}

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
  const importData = cleanForPocketBase({
    userId,
    status: 'pending' as ImportStatus,
    mode,
    csvContentHash,
    totalCards,
    currentIndex: 0,
    // Stocker le CSV seulement s'il est fourni et pas trop volumineux (< 900KB)
    csvContent: csvContent && csvContent.length < 900000 ? csvContent : undefined,
  });

  const record = await pb.collection('imports').create(importData);
  return record.id;
}

/**
 * Met à jour le statut d'un import
 */
export async function updateImportStatus(
  userId: string,
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

  await pb.collection('imports').update(importId, updateData);
}

/**
 * Met à jour la progression d'un import
 */
export async function updateImportProgress(
  userId: string,
  importId: string,
  currentIndex: number,
  report?: Partial<ImportJob['report']>
): Promise<void> {
  const updateData: any = cleanForPocketBase({
    currentIndex,
    report,
  });

  await pb.collection('imports').update(importId, updateData);
}

/**
 * Sauvegarde le rapport final d'un import
 */
export async function saveImportReport(userId: string, importId: string, report: ImportJob['report']): Promise<void> {
  await pb.collection('imports').update(importId, {
    report,
    status: 'completed',
    completedAt: new Date().toISOString(),
  });
}

/**
 * Supprime un import
 */
export async function deleteImport(userId: string, importId: string): Promise<void> {
  await pb.collection('imports').delete(importId);
}
