import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableCard } from '../../types/play';
import {
  COMMON_COUNTERS,
  MTG_COUNTERS,
  findCounterTypes,
  listedCounterCounts,
  normalizeCounterId,
} from '../../data/mtgCounters';
import { visibleCardFace } from '../../utils/playTable';

interface CounterPickerProps {
  card: TableCard;
  onClose: () => void;
  onSetCounter: (counterId: string, delta: number) => void;
}

export function CounterPicker({ card, onClose, onSetCounter }: CounterPickerProps) {
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const current = listedCounterCounts(card.counters);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return findCounterTypes(query).slice(0, 60);
  }, [query]);

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

  const addCustom = () => {
    const id = normalizeCounterId(custom);
    if (!id) return;
    onSetCounter(id, 1);
    setCustom('');
  };

  return (
    <div className="fixed inset-0 z-[97] flex items-stretch justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{visibleCardFace(card).name}</h2>
              <p className="text-xs text-white/50">Marqueurs · liste complète MTG</p>
            </div>
            <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {current.length > 0 && (
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Sur cette carte</p>
                <button
                  type="button"
                  className="text-[11px] text-amber-200 hover:text-amber-100"
                  onClick={() => onSetCounter('*', 0)}
                >
                  Tout retirer
                </button>
              </div>
              <ul className="space-y-1.5">
                {current.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5">
                    <span className="flex-1 min-w-0 text-sm truncate" title={item.name}>
                      {item.name}
                    </span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded bg-white/10 hover:bg-white/20 text-sm"
                      onClick={() => onSetCounter(item.id, -1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums font-semibold">{item.count}</span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded bg-white/10 hover:bg-white/20 text-sm"
                      onClick={() => onSetCounter(item.id, 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white/70"
                      onClick={() => onSetCounter(item.id, -item.count)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Fréquents</p>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_COUNTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="px-2 py-1 rounded-lg bg-amber-500/90 text-black text-[11px] font-semibold hover:bg-amber-400"
                  onClick={() => onSetCounter(item.id, 1)}
                  title={`Ajouter un marqueur ${item.name}`}
                >
                  + {item.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Rechercher</p>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="charge, oil, flying, +1/+1…"
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {query.trim() ? (
              matches.length === 0 ? (
                <p className="text-sm text-white/50 text-center py-4">Aucun type correspondant.</p>
              ) : (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg ring-1 ring-white/10 divide-y divide-white/5">
                  {matches.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10"
                        onClick={() => onSetCounter(item.id, 1)}
                      >
                        {item.name}
                        <span className="text-white/40 text-[11px]"> · +1</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-[11px] text-white/40 mt-1.5">Tapez pour parcourir les {MTG_COUNTERS.length} types officiels.</p>
            )}
          </section>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addCustom();
            }}
          >
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="Type personnalisé…"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/20 disabled:opacity-40"
              disabled={!normalizeCounterId(custom)}
            >
              Ajouter
            </button>
          </form>
          <p className="text-[10px] text-white/35">
            Les marqueurs restent sur la carte si elle change de zone. Clic sur un badge : +1 · Shift+clic : −1.
          </p>
        </div>
      </div>
    </div>
  );
}
