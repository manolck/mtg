import { useEffect, useMemo, useState } from 'react';
import type { TableCard } from '../../types/play';
import { CardHoverPreview } from '../Card/CardHoverPreview';
import { MTG_CARD_BACK_URL } from './PlayCard';

export type LibraryLookMode = 'scry' | 'surveil';

interface LibraryLookPanelProps {
  mode: LibraryLookMode;
  library: TableCard[];
  onClose: () => void;
  onConfirm: (count: number, onTop: string[], other: string[]) => void;
}

function moveId(ids: string[], instanceId: string, direction: -1 | 1): string[] {
  const idx = ids.indexOf(instanceId);
  const next = idx + direction;
  if (idx < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

export function LibraryLookPanel({ mode, library, onClose, onConfirm }: LibraryLookPanelProps) {
  const maxN = Math.min(7, library.length);
  const [count, setCount] = useState(() => Math.min(1, maxN));
  const [onTop, setOnTop] = useState(() => library.slice(0, Math.min(1, maxN)).map((card) => card.instanceId));
  const [other, setOther] = useState<string[]>([]);
  const [hover, setHover] = useState<{ card: TableCard; rect: DOMRect } | null>(null);

  const looked = useMemo(() => library.slice(0, count), [library, count]);
  const lookedKey = looked.map((card) => card.instanceId).join('|');
  const byId = useMemo(() => new Map(looked.map((card) => [card.instanceId, card])), [looked]);

  useEffect(() => {
    setOnTop(lookedKey ? lookedKey.split('|') : []);
    setOther([]);
  }, [lookedKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isScry = mode === 'scry';
  const otherLabel = isScry ? 'Dessous' : 'Cimetière';
  const title = isScry ? 'Regard (Scry)' : 'Surveillance (Surveil)';
  const help = isScry
    ? 'Vous regardez les cartes du dessus de votre bibliothèque, puis vous les remettez au-dessus ou en dessous.'
    : 'Vous regardez les cartes du dessus de votre bibliothèque, puis vous les remettez au-dessus ou dans votre cimetière.';

  const sendToTop = (instanceId: string) => {
    setOther((ids) => ids.filter((id) => id !== instanceId));
    setOnTop((ids) => (ids.includes(instanceId) ? ids : [...ids, instanceId]));
  };
  const sendToOther = (instanceId: string) => {
    setOnTop((ids) => ids.filter((id) => id !== instanceId));
    setOther((ids) => (ids.includes(instanceId) ? ids : [...ids, instanceId]));
  };

  const renderColumn = (
    ids: string[],
    label: string,
    empty: string,
    onSendHere: (id: string) => void,
    onReorder: (id: string, direction: -1 | 1) => void,
  ) => (
    <section className="flex-1 min-w-0 rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
        {label} · {ids.length}
      </p>
      {ids.length === 0 ? (
        <p className="text-sm text-white/40 italic py-6 text-center">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {ids.map((id, index) => {
            const card = byId.get(id);
            if (!card) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg bg-black/30 p-1.5">
                <button
                  type="button"
                  className="w-[4.5rem] shrink-0 aspect-[63/88] rounded overflow-hidden bg-[#1a1520]"
                  onMouseEnter={(event) =>
                    card.imageUrl
                      ? setHover({ card, rect: event.currentTarget.getBoundingClientRect() })
                      : setHover(null)
                  }
                  onMouseLeave={() => setHover(null)}
                >
                  <img
                    src={card.imageUrl || MTG_CARD_BACK_URL}
                    alt={card.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{card.name}</p>
                  {card.typeLine ? <p className="text-[10px] text-white/45 truncate">{card.typeLine}</p> : null}
                  <p className="text-[10px] text-white/35">#{index + 1}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="h-6 w-7 rounded bg-white/10 text-xs hover:bg-white/20 disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => onReorder(id, -1)}
                    title="Monter"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="h-6 w-7 rounded bg-white/10 text-xs hover:bg-white/20 disabled:opacity-30"
                    disabled={index === ids.length - 1}
                    onClick={() => onReorder(id, 1)}
                    title="Descendre"
                  >
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-white/10 text-[11px] hover:bg-white/20"
                  onClick={() => onSendHere(id)}
                >
                  {label === 'Dessus' ? otherLabel : 'Dessus'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="fixed inset-0 z-[96] flex items-stretch justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/10 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">{title}</h2>
              <p className="text-xs text-white/50">{help}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 disabled:opacity-40"
                disabled={looked.length === 0}
                onClick={() => {
                  onConfirm(count, onTop, other);
                  onClose();
                }}
              >
                Valider
              </button>
              <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20" onClick={onClose}>
                Annuler
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-white/60 mr-1">Cartes</span>
            {Array.from({ length: Math.max(1, maxN) }, (_, index) => index + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`h-8 w-8 rounded-lg text-sm font-semibold ${
                  count === n ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
                onClick={() => setCount(n)}
                disabled={library.length === 0}
              >
                {n}
              </button>
            ))}
            {library.length === 0 ? <p className="text-sm text-white/45">Bibliothèque vide.</p> : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {looked.length === 0 ? (
            <p className="text-sm text-white/50 text-center py-12">Aucune carte à regarder.</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              {renderColumn(
                onTop,
                'Dessus',
                'Aucune carte au-dessus.',
                sendToOther,
                (id, direction) => setOnTop((ids) => moveId(ids, id, direction)),
              )}
              {renderColumn(
                other,
                otherLabel,
                isScry ? 'Aucune carte en dessous.' : 'Aucune carte au cimetière.',
                sendToTop,
                (id, direction) => setOther((ids) => moveId(ids, id, direction)),
              )}
            </div>
          )}
          <p className="text-[11px] text-white/35 mt-3">
            {isScry
              ? 'Le n°1 de « Dessus » devient le dessus de la bibliothèque. Le dernier de « Dessous » va tout en bas.'
              : 'Le n°1 de « Dessus » devient le dessus de la bibliothèque. Les cartes du cimetière y arrivent dans cet ordre.'}
          </p>
        </div>
      </div>
      {hover && <CardHoverPreview imageUrl={hover.card.imageUrl} name={hover.card.name} anchorRect={hover.rect} />}
    </div>
  );
}
