import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as deckService from '../services/deckService';
import {
  DECK_FORMATS,
  DECK_FORMAT_LABELS,
  countEntries,
  type Deck,
  type DeckFormat,
} from '../types/deck';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Input } from '../components/UI/Input';
import { DeckCoverCard } from '../components/Deck/DeckCoverCard';

export function CommunityDecks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckFormat | ''>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    deckService
      .getPublicDecks({
        format: format || undefined,
        search: search.trim() || undefined,
      })
      .then((list) => {
        if (!cancelled) {
          setDecks(list);
          setError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError('Impossible de charger les decks publics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [format, search]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="page-title">Decks communautaires</h1>
          <p className="page-subtitle">
            Consultez et copiez les decks partagés par la communauté.
          </p>
        </div>
        <Link
          to="/decks"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 shrink-0"
        >
          Mes decks
        </Link>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un deck…"
          />
        </div>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as DeckFormat | '')}
          className="field-control sm:w-auto"
        >
          <option value="">Tous les formats</option>
          {DECK_FORMATS.map((f) => (
            <option key={f} value={f}>
              {DECK_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded">{error}</div>
      ) : decks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Aucun deck public pour ces filtres.
          <div className="mt-4">
            <Link to="/decks">
              <Button>Créer et publier le vôtre</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => {
            const total =
              countEntries(deck.cards.mainboard) +
              countEntries(deck.commanders) +
              countEntries(deck.cards.sideboard);
            return (
              <Link key={deck.id} to={`/decks/${deck.id}`} className="block min-w-0 hover:brightness-110 transition">
                <DeckCoverCard deck={deck}>
                  <div className="flex justify-between gap-2 mb-2">
                    <h2 className="text-lg sm:text-xl font-semibold text-white min-w-0 break-words drop-shadow">{deck.name}</h2>
                    <span className="text-xs px-2 py-1 rounded bg-white/20 text-white shrink-0 h-fit backdrop-blur-sm">
                      {DECK_FORMAT_LABELS[deck.format]}
                    </span>
                  </div>
                  <p className="text-white/80 text-sm mb-2">
                    {total} cartes
                    {deck.sourceDeckId ? ' · fork' : ''}
                  </p>
                  {deck.description && (
                    <p className="text-sm text-white/70 line-clamp-2">{deck.description}</p>
                  )}
                  {deck.tags && deck.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {deck.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded bg-white/15 text-white/90"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </DeckCoverCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
