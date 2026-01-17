import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';

export function Decks() {
  const { decks, loading, error, createDeck, deleteDeck } = useDecks();
  const { showSuccess, showError } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ deckId: string; deckName: string } | null>(null);

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      showError('Le nom du deck ne peut pas être vide');
      return;
    }

    try {
      setIsCreating(true);
      await createDeck(newDeckName.trim());
      setShowCreateModal(false);
      setNewDeckName('');
      showSuccess('Deck créé avec succès');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDeck = async (deckId: string, deckName: string) => {
    setShowDeleteConfirm({ deckId, deckName });
  };

  const confirmDeleteDeck = async () => {
    if (!showDeleteConfirm) return;
    try {
      await deleteDeck(showDeleteConfirm.deckId);
      showSuccess(`Deck "${showDeleteConfirm.deckName}" supprimé`);
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
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Mes Decks
        </h1>
        <Button onClick={() => setShowCreateModal(true)}>
          Créer un deck
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {decks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Vous n'avez pas encore de deck.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            Créer votre premier deck
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                {deck.name}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {deck.cards.length} carte{deck.cards.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Link
                  to={`/decks/${deck.id}`}
                  className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Ouvrir
                </Link>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteDeck(deck.id, deck.name)}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewDeckName('');
        }}
        title="Créer un nouveau deck"
      >
        <div className="space-y-4">
          <Input
            label="Nom du deck"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="Mon super deck"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreateDeck();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewDeckName('');
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
    </div>
  );
}

