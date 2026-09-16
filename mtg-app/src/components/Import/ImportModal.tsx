import { useEffect, useRef, useState } from 'react';
import { Modal } from '../UI/Modal';
import type { UserCollection } from '../../types/card';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: UserCollection[];
  defaultCollectionId?: string | null;
  importing?: boolean;
  onImport: (content: string, updateMode: boolean, collectionId: string | null) => Promise<void>;
  onCreateDefaultCollection?: () => Promise<UserCollection | null>;
}

export function ImportModal({
  isOpen,
  onClose,
  collections,
  defaultCollectionId = null,
  importing = false,
  onImport,
  onCreateDefaultCollection,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [targetCollectionId, setTargetCollectionId] = useState<string | null>(
    defaultCollectionId ?? (collections.length === 1 ? collections[0].id : null)
  );

  useEffect(() => {
    if (!isOpen) return;
    if (defaultCollectionId) {
      setTargetCollectionId(defaultCollectionId);
    } else if (collections.length === 1) {
      setTargetCollectionId(collections[0].id);
    }
  }, [isOpen, defaultCollectionId, collections]);

  const effectiveTargetId =
    targetCollectionId ?? (collections.length === 1 ? collections[0].id : null);
  const needsCollectionChoice = collections.length > 0;
  const canPickFile = !needsCollectionChoice || Boolean(effectiveTargetId);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let targetId = effectiveTargetId;
    if (collections.length === 0 && onCreateDefaultCollection) {
      const created = await onCreateDefaultCollection();
      targetId = created?.id ?? null;
    } else if (collections.length > 0 && !targetId) {
      return;
    }

    try {
      const text = await file.text();
      onClose();
      await onImport(text, importMode === 'update', targetId);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        if (fileInputRef.current) fileInputRef.current.value = '';
      }}
      title="Importer une collection"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Formats acceptés : CSV (export de l’app, Deckbox) et JSON (export de l’app).
        </p>
        {needsCollectionChoice && (
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Collection de destination
            </label>
            <select
              value={effectiveTargetId ?? ''}
              onChange={(e) => setTargetCollectionId(e.target.value === '' ? null : e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            >
              {collections.length > 1 && <option value="">Choisir une collection</option>}
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Mode d&apos;import
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="collection-import-mode"
                value="add"
                checked={importMode === 'add'}
                onChange={() => setImportMode('add')}
                className="text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Ajouter à la collection existante</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="collection-import-mode"
                value="update"
                checked={importMode === 'update'}
                onChange={() => setImportMode('update')}
                className="text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Mettre à jour les quantités si la carte existe</span>
            </label>
          </div>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(e) => {
              void handleFile(e);
            }}
            className="hidden"
            id="collection-import-upload"
            disabled={!canPickFile || importing}
          />
          <label
            htmlFor="collection-import-upload"
            className={`inline-block w-full text-center px-4 py-2 rounded-lg font-medium transition-colors ${
              !canPickFile || importing
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {importing
              ? 'Import en cours...'
              : !canPickFile
                ? 'Choisissez d’abord une collection'
                : 'Sélectionner un fichier CSV ou JSON'}
          </label>
        </div>
      </div>
    </Modal>
  );
}
