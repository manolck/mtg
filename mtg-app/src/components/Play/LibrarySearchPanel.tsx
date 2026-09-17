import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableCard, ZoneName } from '../../types/play';
import { filterLibraryCards } from '../../utils/playTable';
import { CardHoverPreview } from '../Card/CardHoverPreview';

interface LibrarySearchPanelProps {
  cards: TableCard[];
  onClose: () => void;
  onTake: (card: TableCard, to: ZoneName, options?: { toTop?: boolean; shuffle?: boolean }) => void;
}

const DESTINATIONS: Array<{ to: ZoneName; toTop?: boolean; label: string; primary?: boolean }> = [
  { to: 'hand', label: 'Main', primary: true },
  { to: 'battlefield', label: 'Champ' },
  { to: 'library', toTop: true, label: 'Dessus' },
  { to: 'library', label: 'Dessous' },
  { to: 'graveyard', label: 'Cimetière' },
  { to: 'exile', label: 'Exil' },
];

export function LibrarySearchPanel({ cards, onClose, onTake }: LibrarySearchPanelProps) {
  const [query, setQuery] = useState('');
  const [shuffleAfter, setShuffleAfter] = useState(true);
  const [hover, setHover] = useState<{ card: TableCard; rect: DOMRect } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => filterLibraryCards(cards, query), [cards, query]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const take = (card: TableCard, to: ZoneName, toTop?: boolean) => {
    const shuffle = shuffleAfter && to !== 'library';
    onTake(card, to, { toTop, shuffle });
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-stretch justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="font-semibold">Rechercher dans la bibliothèque</h2>
            <p className="text-xs text-white/50">
              {filtered.length}/{cards.length} cartes · visible seulement pour vous
            </p>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, type, coût… (ex. land, counter, bolt)"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <label className="flex items-center gap-2 text-xs text-white/80 whitespace-nowrap">
            <input
              type="checkbox"
              checked={shuffleAfter}
              onChange={(e) => setShuffleAfter(e.target.checked)}
            />
            Mélanger après
          </label>
          <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-white/50 text-center py-12">Aucune carte ne correspond.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((card) => (
                <li key={card.instanceId} className="rounded-xl bg-black/30 p-2 ring-1 ring-white/10">
                  <button
                    type="button"
                    className="block w-full aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] mb-2"
                    title={`${card.name} — clic : main`}
                    onClick={() => take(card, 'hand')}
                    onMouseEnter={(event) =>
                      setHover({ card, rect: event.currentTarget.getBoundingClientRect() })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-white/70">{card.name}</span>
                    )}
                  </button>
                  <p className="text-xs font-medium truncate" title={card.name}>
                    {card.name}
                  </p>
                  {card.typeLine && (
                    <p className="text-[10px] text-white/45 truncate mb-1.5">{card.typeLine}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {DESTINATIONS.map((dest) => (
                      <button
                        key={`${dest.to}-${dest.toTop ? 'top' : 'bot'}`}
                        type="button"
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          dest.primary ? 'bg-amber-500 text-black font-semibold' : 'bg-white/10 hover:bg-white/20'
                        }`}
                        onClick={() => take(card, dest.to, dest.toTop)}
                      >
                        {dest.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {hover && <CardHoverPreview imageUrl={hover.card.imageUrl} name={hover.card.name} anchorRect={hover.rect} />}
    </div>
  );
}
