import { useEffect, useState } from 'react';
import * as deckService from '../../services/deckService';
import { DECK_FORMAT_LABELS, countEntries, type Deck, type DeckFormat } from '../../types/deck';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Modal } from '../UI/Modal';
import { Spinner } from '../UI/Spinner';

interface DeckPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  preferredFormat?: DeckFormat;
  onPick: (deckId: string) => Promise<void> | void;
}

export function DeckPickerModal({
  isOpen,
  onClose,
  userId,
  preferredFormat,
  onPick,
}: DeckPickerModalProps) {
  const [tab, setTab] = useState<'mine' | 'community'>('mine');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load =
      tab === 'mine'
        ? deckService.getDecks(userId)
        : deckService.getPublicDecks({
            format: preferredFormat,
            search: search.trim() || undefined,
          });
    load
      .then((list) => {
        if (cancelled) return;
        let next = list;
        if (tab === 'mine' && search.trim()) {
          const q = search.trim().toLowerCase();
          next = list.filter(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              (d.description || '').toLowerCase().includes(q)
          );
        }
        setDecks(next);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les decks.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, userId, preferredFormat, search]);

  const handlePick = async (deckId: string) => {
    try {
      setPicking(deckId);
      await onPick(deckId);
      onClose();
    } catch {
      setError('Impossible de sélectionner ce deck.');
    } finally {
      setPicking(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choisir un deck" size="lg">
      <div className="flex gap-2 mb-4">
        <Button variant={tab === 'mine' ? 'primary' : 'secondary'} onClick={() => setTab('mine')}>
          Mes decks
        </Button>
        <Button
          variant={tab === 'community' ? 'primary' : 'secondary'}
          onClick={() => setTab('community')}
        >
          Communauté
        </Button>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un deck…"
        className="mb-4"
      />
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : decks.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          Aucun deck trouvé.
        </p>
      ) : (
        <ul className="space-y-2">
          {decks.map((deck) => (
            <li
              key={deck.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
            >
              {deck.commanders?.[0]?.imageUrl ? (
                <img
                  src={deck.commanders[0].imageUrl}
                  alt=""
                  className="w-9 aspect-[63/88] rounded object-cover shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">{deck.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {DECK_FORMAT_LABELS[deck.format]} · {countEntries(deck.cards.mainboard)} cartes
                  {deck.commanders?.length ? ` · ${deck.commanders.map((c) => c.name).join(', ')}` : ''}
                </p>
              </div>
              <Button
                onClick={() => handlePick(deck.id)}
                disabled={picking !== null}
                loading={picking === deck.id}
              >
                Choisir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
