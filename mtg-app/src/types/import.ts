// Type definitions for import functionality
export type ImportStatus = 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type ImportMode = 'add' | 'update';
export type CardImportStatus = 'success' | 'error' | 'skipped' | 'updated' | 'added' | 'removed';

export interface ImportReport {
  success: number;
  errors: number;
  skipped: number;
  updated: number; // Pour le mode update
  added: number;
  removed: number; // Pour le mode update
  details: Array<{
    cardName: string;
    status: CardImportStatus;
    message?: string;
  }>;
}

export interface ImportJob {
  id: string;
  status: ImportStatus;
  mode: ImportMode;
  csvContentHash: string; // Hash du CSV pour éviter les doublons
  csvContent?: string; // Contenu du CSV stocké pour permettre la reprise
  totalCards: number;
  currentIndex: number;
  createdAt: Date; // Utilise Date au lieu de Timestamp | Date pour éviter les problèmes d'import
  updatedAt: Date;
  completedAt?: Date;
  report?: ImportReport;
  pausedAt?: Date;
  error?: string; // Message d'erreur si status === 'failed'
}
