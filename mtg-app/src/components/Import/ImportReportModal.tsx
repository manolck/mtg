import type { ImportJob, CardImportStatus } from '../../types/import';
import { Modal } from '../UI/Modal';

interface ImportReportModalProps {
  importJob: ImportJob | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ImportReportModal({ importJob, isOpen, onClose }: ImportReportModalProps) {
  if (!importJob || !importJob.report) {
    return null;
  }

  const getStatusColor = (status: CardImportStatus) => {
    switch (status) {
      case 'success':
      case 'added':
      case 'updated':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'skipped':
        return 'text-gray-600 dark:text-gray-400';
      case 'removed':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusLabel = (status: CardImportStatus) => {
    switch (status) {
      case 'success':
        return 'Succès';
      case 'added':
        return 'Ajouté';
      case 'updated':
        return 'Mis à jour';
      case 'error':
        return 'Erreur';
      case 'skipped':
        return 'Ignoré';
      case 'removed':
        return 'Supprimé';
      default:
        return status;
    }
  };

  const errors = importJob.report.details.filter(d => d.status === 'error');
  const skipped = importJob.report.details.filter(d => d.status === 'skipped');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rapport d'import">
      <div className="space-y-4">
        {/* Résumé */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Résumé</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total traité</div>
              <div className="text-lg font-semibold">{importJob.totalCards}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Succès</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                {importJob.report.success}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Erreurs</div>
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                {importJob.report.errors}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Ignorés</div>
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                {importJob.report.skipped}
              </div>
            </div>
            {importJob.mode === 'update' && (
              <>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Mis à jour</div>
                  <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {importJob.report.updated}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Ajoutés</div>
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {importJob.report.added}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Supprimés</div>
                  <div className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                    {importJob.report.removed}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Erreurs */}
        {errors.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 text-red-600 dark:text-red-400">
              Erreurs ({errors.length})
            </h3>
            <div className="max-h-60 overflow-y-auto border border-red-200 dark:border-red-800 rounded p-2">
              {errors.map((detail, index) => (
                <div key={index} className="mb-2 text-sm">
                  <div className="font-medium">{detail.cardName}</div>
                  {detail.message && (
                    <div className="text-red-600 dark:text-red-400 text-xs ml-2">
                      {detail.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cartes ignorées */}
        {skipped.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 text-gray-600 dark:text-gray-400">
              Cartes ignorées ({skipped.length})
            </h3>
            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2">
              {skipped.map((detail, index) => (
                <div key={index} className="mb-1 text-sm text-gray-600 dark:text-gray-400">
                  {detail.cardName}
                  {detail.message && (
                    <span className="ml-2 text-xs">({detail.message})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Détails complets (limité à 100 pour les performances) */}
        {importJob.report.details.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">
              Détails ({importJob.report.details.length} cartes)
            </h3>
            <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Carte</th>
                    <th className="text-left p-2">Statut</th>
                    <th className="text-left p-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {importJob.report.details.slice(0, 100).map((detail, index) => (
                    <tr key={index} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="p-2">{detail.cardName}</td>
                      <td className={`p-2 ${getStatusColor(detail.status)}`}>
                        {getStatusLabel(detail.status)}
                      </td>
                      <td className="p-2 text-xs text-gray-600 dark:text-gray-400">
                        {detail.message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importJob.report.details.length > 100 && (
                <div className="p-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                  ... et {importJob.report.details.length - 100} autres cartes
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

