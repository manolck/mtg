import type { ImportJob } from '../../types/import';
import { Button } from '../UI/Button';

interface ImportJobCardProps {
  importJob: ImportJob;
  onResume?: (importId: string) => void;
  onCancel?: (importId: string) => void;
  onViewReport?: (importJob: ImportJob) => void;
  onDelete?: (importId: string) => void;
}

export function ImportJobCard({ 
  importJob, 
  onResume, 
  onCancel, 
  onViewReport,
  onDelete 
}: ImportJobCardProps) {
  const getStatusColor = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'running':
        return 'text-blue-500';
      case 'paused':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
      case 'cancelled':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusLabel = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return 'Terminé';
      case 'running':
        return 'En cours';
      case 'paused':
        return 'En pause';
      case 'failed':
        return 'Échoué';
      case 'cancelled':
        return 'Annulé';
      case 'pending':
        return 'En attente';
      default:
        return status;
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const progress = importJob.totalCards > 0 
    ? Math.round((importJob.currentIndex / importJob.totalCards) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold ${getStatusColor(importJob.status)}`}>
              {getStatusLabel(importJob.status)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {importJob.mode === 'update' ? 'Mise à jour' : 'Ajout'}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {formatDate(importJob.createdAt instanceof Date ? importJob.createdAt : new Date(importJob.createdAt))}
          </p>
        </div>
        {onDelete && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(importJob.id)}
            className="ml-2"
          >
            Supprimer
          </Button>
        )}
      </div>

      {importJob.status === 'running' || importJob.status === 'paused' ? (
        <div className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span>Progression</span>
            <span>{importJob.currentIndex} / {importJob.totalCards} ({progress}%)</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {importJob.report && (
        <div className="mb-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Succès:</span>
              <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
                {importJob.report.success}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Erreurs:</span>
              <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                {importJob.report.errors}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Ignorés:</span>
              <span className="ml-1 font-semibold text-gray-600 dark:text-gray-400">
                {importJob.report.skipped}
              </span>
            </div>
            {importJob.mode === 'update' && (
              <>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Mis à jour:</span>
                  <span className="ml-1 font-semibold text-blue-600 dark:text-blue-400">
                    {importJob.report.updated}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Ajoutés:</span>
                  <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
                    {importJob.report.added}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Supprimés:</span>
                  <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                    {importJob.report.removed}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {importJob.error && (
        <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
          <strong>Erreur:</strong> {importJob.error}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {importJob.status === 'paused' && onResume && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onResume(importJob.id)}
          >
            Reprendre
          </Button>
        )}
        {(importJob.status === 'running' || importJob.status === 'paused') && onCancel && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => onCancel(importJob.id)}
          >
            Annuler
          </Button>
        )}
        {importJob.report && onViewReport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewReport(importJob)}
          >
            Voir le rapport
          </Button>
        )}
      </div>
    </div>
  );
}

