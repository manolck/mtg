import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { getFormatSummary } from '../services/deckFormatRules';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';
import {
  DECK_FORMATS,
  DECK_FORMAT_LABELS,
  countEntries,
  type DeckFormat,
} from '../types/deck';
import { validateDeck } from '../utils/validationSchemas';

export function Decks() {
  const { decks, loading, error, createDeck, deleteDeck } = useDecks();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<DeckFormat>('modern');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    deckId: string;
    deckName: string;
  } | null>(null);

  const handleCreateDeck = async () => {
    const validation = validateDeck({
      name: newDeckName.trim(),
      format: newDeckFormat,
      description: newDeckDescription.trim() || undefined,
      visibility: 'private',
    });
    if (!validation.success) {
      showError(validation.error);
      return;
    }

    try {
      setIsCreating(true);
      const deckId = await createDeck({
        name: validation.data.name,
        format: validation.data.format,
        description: validation.data.description,
        visibility: 'private',
      });
      setShowCreateModal(false);
      setNewDeckName('');
      setNewDeckDescription('');
      setNewDeckFormat('modern');
      showSuccess('Deck créé avec succès');
      navigate(`/decks/${deckId}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteDeck = async () => {
    if (!showDeleteConfirm) return;
    try {
      await deleteDeck(showDeleteConfirm.deckId);
      showSuccess(
        `Deck « ${showDeleteConfirm.deckName} » supprimé. Les copies communautaires restent intactes.`
      );
      setShowDeleteConfirm(null);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap gap-3 justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mes Decks</h1>
        <div className="flex gap-2">
          <Link
            to="/community/decks"
            className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          >
            Communauté
          </Link>
          <Button onClick={() => setShowCreateModal(true)}>Créer un deck</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {decks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Vous n&apos;avez pas encore de deck.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>Créer votre premier deck</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => {
            const total =
              countEntries(deck.cards.mainboard) +
              countEntries(deck.commanders) +
              countEntries(deck.cards.sideboard);
            return (
              <div
                key={deck.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {deck.name}
                  </h2>
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 shrink-0">
                    {DECK_FORMAT_LABELS[deck.format]}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  {total} carte{total !== 1 ? 's' : ''}
                  {deck.visibility !== 'private' && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-green-600 dark:text-green-400">
                      {deck.visibility}
                    </span>
                  )}
                </p>
                {deck.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
                    {deck.description}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <Link
                    to={`/decks/${deck.id}`}
                    className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Ouvrir
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => setShowDeleteConfirm({ deckId: deck.id, deckName: deck.name })}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewDeckName('');
          setNewDeckDescription('');
        }}
        title="Créer un nouveau deck"
      >
        <div className="space-y-4">
          <Input
            label="Nom du deck"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="Mon super deck"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateDeck();
            }}
          />
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Format
            </label>
            <select
              value={newDeckFormat}
              onChange={(e) => setNewDeckFormat(e.target.value as DeckFormat)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {DECK_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {DECK_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {getFormatSummary(newDeckFormat)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Le nombre de cartes n&apos;est pas bloquant à la création. La validation stricte
              s&apos;applique au partage public.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Description (optionnel)
            </label>
            <textarea
              value={newDeckDescription}
              onChange={(e) => setNewDeckDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Stratégie, notes…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewDeckName('');
                setNewDeckDescription('');
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateDeck}
              disabled={!newDeckName.trim() || isCreating}
              loading={isCreating}
            >
              Créer
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!showDeleteConfirm}
        title="Supprimer ce deck"
        message={`Supprimer « ${showDeleteConfirm?.deckName} » ? Les copies déjà forkees par d'autres joueurs ne seront pas supprimées.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        onConfirm={confirmDeleteDeck}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
