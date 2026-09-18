import { useEffect, useRef, useState } from 'react';
import type { MTGCard } from '../../types/card';
import type { TokenBlueprint } from '../../types/play';
import { searchPlayTokens } from '../../services/scryfallSearchService';
import { CardHoverPreview } from '../Card/CardHoverPreview';

interface TokenSearchPanelProps {
  onClose: () => void;
  onAdd: (card: TokenBlueprint, quantity: number) => void;
}

const COMMON_CHIPS = [
  'Treasure',
  'Food',
  'Clue',
  'Blood',
  'Saproling',
  'Soldier',
  'Zombie',
  'Goblin',
  'Spirit',
  'Beast',
  'Thopter',
  'Copy',
];

function toBlueprint(card: MTGCard): TokenBlueprint | null {
  const scryfallId = (card.id || '').trim();
  const name = (card.name || '').trim();
  if (!scryfallId || !name) return null;
  return {
    scryfallId,
    name,
    imageUrl: card.imageUrl,
    backImageUrl: card.backImageUrl,
    backName: card.backName,
    manaCost: card.manaCost,
    typeLine: card.type,
    cmc: card.cmc,
  };
}

export function TokenSearchPanel({ onClose, onAdd }: TokenSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [results, setResults] = useState<MTGCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ card: MTGCard; rect: DOMRect } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const cards = await searchPlayTokens(query, 40);
        if (!cancelled) setResults(cards);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const addCard = (card: MTGCard) => {
    const blueprint = toBlueprint(card);
    if (!blueprint) return;
    onAdd(blueprint, quantity);
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-stretch justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/10 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">Ajouter un jeton</h2>
              <p className="text-xs text-white/50">Recherche Scryfall · is:token · le jeton arrive sur le champ de bataille</p>
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Saproling, soldat, treasure, 1/1…"
              className="px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-full min-w-0 sm:flex-1 sm:min-w-[180px]"
            />
            <div className="flex items-center gap-1.5 text-xs text-white/80 whitespace-nowrap">
              <span>Quantité</span>
              <button
                type="button"
                className="h-7 w-7 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <span className="w-5 text-center tabular-nums font-semibold">{quantity}</span>
              <button
                type="button"
                className="h-7 w-7 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setQuantity((n) => Math.min(12, n + 1))}
              >
                +
              </button>
            </div>
            <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20" onClick={onClose}>
              Fermer
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
                  query === chip ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
                onClick={() => setQuery(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-white/50 text-center py-12">Recherche des jetons…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-white/50 text-center py-12">Aucun jeton ne correspond.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {results.map((card) => (
                <li key={card.id || card.name} className="rounded-xl bg-black/30 p-2 ring-1 ring-white/10">
                  <button
                    type="button"
                    className="block w-full aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] mb-2"
                    title={`${card.name} — poser ×${quantity}`}
                    onClick={() => addCard(card)}
                    onMouseEnter={(event) =>
                      setHover({ card, rect: event.currentTarget.getBoundingClientRect() })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-white/70 px-1">
                        {card.name}
                      </span>
                    )}
                  </button>
                  <p className="text-xs font-medium truncate" title={card.name}>
                    {card.name}
                  </p>
                  {card.type ? <p className="text-[10px] text-white/45 truncate mb-1.5">{card.type}</p> : null}
                  <button
                    type="button"
                    className="w-full px-1.5 py-1 rounded bg-amber-500 text-black text-[11px] font-semibold hover:bg-amber-400"
                    onClick={() => addCard(card)}
                  >
                    Poser ×{quantity}
                  </button>
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
