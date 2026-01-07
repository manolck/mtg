import { useState } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { exportCollection, downloadFile, type ExportFormat } from '../../services/exportService';
import type { UserCard } from '../../types/card';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: UserCard[];
}

export function ExportModal({ isOpen, onClose, cards }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    if (cards.length === 0) {
      alert('Aucune carte à exporter');
      return;
    }

    try {
      setExporting(true);

      const content = exportCollection(cards, format, {
        includeMetadata,
      });

      const extensions: Record<ExportFormat, string> = {
        csv: 'csv',
        json: 'json',
        deckbox: 'csv',
        moxfield: 'json',
      };

      const mimeTypes: Record<ExportFormat, string> = {
        csv: 'text/csv',
        json: 'application/json',
        deckbox: 'text/csv',
        moxfield: 'application/json',
      };

      const filename = `mtg-collection-${new Date().toISOString().split('T')[0]}.${extensions[format]}`;
      const mimeType = mimeTypes[format];

      downloadFile(content, filename, mimeType);

      setTimeout(() => {
        setExporting(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Erreur lors de l\'export');
      setExporting(false);
    }
  };

  const formatDescriptions: Record<ExportFormat, string> = {
    csv: 'Format CSV standard, compatible avec Excel et la plupart des outils',
    json: 'Format JSON avec toutes les données de la collection',
    deckbox: 'Format Deckbox.org pour import direct',
    moxfield: 'Format Moxfield pour import direct',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Exporter la collection">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {cards.length} carte{cards.length !== 1 ? 's' : ''} à exporter
          </p>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Format d'export
            </label>
            {(['csv', 'json', 'deckbox', 'moxfield'] as ExportFormat[]).map((fmt) => (
              <label
                key={fmt}
                className="flex items-start gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value={fmt}
                  checked={format === fmt}
                  onChange={() => setFormat(fmt)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white capitalize">
                    {fmt === 'deckbox' ? 'Deckbox.org' : fmt === 'moxfield' ? 'Moxfield' : fmt.toUpperCase()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDescriptions[fmt]}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {format === 'csv' || format === 'json' ? (
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Inclure les métadonnées (ID, dates, données MTG complètes)
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} disabled={exporting}>
            Annuler
          </Button>
          <Button onClick={handleExport} loading={exporting} disabled={cards.length === 0}>
            Exporter
          </Button>
        </div>
      </div>
    </Modal>
  );
}

