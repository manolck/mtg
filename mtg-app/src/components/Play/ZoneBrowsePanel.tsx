import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableCard, ZoneName } from '../../types/play';
import { ZONE_LABELS } from '../../types/play';
import { canSeeGraveOrExileFace, filterPublicZoneCards, visibleCardFace } from '../../utils/playTable';
import { listedCounterCounts } from '../../data/mtgCounters';
import { CardHoverPreview } from '../Card/CardHoverPreview';
import { MTG_CARD_BACK_URL } from './PlayCard';

interface ZoneBrowsePanelProps {
  zone: 'graveyard' | 'exile';
  cards: TableCard[];
  ownerId: string;
  ownerName?: string;
  viewerId: string;
  canAct: boolean;
  onClose: () => void;
  onTake?: (card: TableCard, to: ZoneName, options?: { toTop?: boolean; facedown?: boolean }) => void;
  onSetFacedown?: (instanceId: string, facedown: boolean) => void;
  onOpenCounters?: (instanceId: string) => void;
}

const DESTINATIONS: Array<{ to: ZoneName; label: string; primary?: boolean }> = [
  { to: 'battlefield', label: 'Champ', primary: true },
  { to: 'hand', label: 'Main' },
  { to: 'graveyard', label: 'Cimetière' },
  { to: 'exile', label: 'Exil' },
  { to: 'command', label: 'CMD' },
];

export function ZoneBrowsePanel({
  zone,
  cards,
  ownerId,
  ownerName,
  viewerId,
  canAct,
  onClose,
  onTake,
  onSetFacedown,
  onOpenCounters,
}: ZoneBrowsePanelProps) {
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<{ imageUrl?: string; name: string; rect: DOMRect } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () => filterPublicZoneCards(cards, query, ownerId, viewerId),
    [cards, query, ownerId, viewerId],
  );
  const hiddenCount = cards.filter((card) => card.facedown).length;

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

  return (
    <div className="fixed inset-0 z-[96] flex items-stretch justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-6xl max-h-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="font-semibold">
              {ZONE_LABELS[zone]}
              {ownerName ? ` · ${ownerName}` : ''}
            </h2>
            <p className="text-xs text-white/50">
              {filtered.length}/{cards.length} cartes · consultable par tous
              {hiddenCount > 0 ? ` · ${hiddenCount} face cachée${hiddenCount > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, type, coût…"
            className="px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-full min-w-0 sm:flex-1 sm:min-w-[180px]"
          />
          <button type="button" className="px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-white/50 text-center py-12">
              {cards.length === 0 ? 'Zone vide.' : 'Aucune carte ne correspond.'}
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((card) => {
                const canSee = canSeeGraveOrExileFace(ownerId, card, viewerId);
                const face = visibleCardFace(card);
                const label = canSee ? face.name : 'Face cachée';
                const counters = listedCounterCounts(card.counters);
                return (
                  <li key={card.instanceId} className="rounded-xl bg-black/30 p-2 ring-1 ring-white/10">
                    <button
                      type="button"
                      className="block w-full aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] mb-2"
                      title={label}
                      onMouseEnter={(event) => {
                        if (!canSee || !face.imageUrl) {
                          setHover(null);
                          return;
                        }
                        setHover({
                          imageUrl: face.imageUrl,
                          name: face.name,
                          rect: event.currentTarget.getBoundingClientRect(),
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                    >
                      <img
                        src={canSee && face.imageUrl ? face.imageUrl : MTG_CARD_BACK_URL}
                        alt={label}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <p className="text-sm font-medium truncate" title={label}>
                      {label}
                      {card.facedown && canSee ? ' · cachée' : ''}
                    </p>
                    {canSee && card.typeLine ? (
                      <p className="text-xs text-white/55 truncate mb-1.5">{card.typeLine}</p>
                    ) : (
                      <p className="text-[10px] text-white/35 truncate mb-1.5">{canSee ? '\u00a0' : 'Dos de carte'}</p>
                    )}
                    {canSee && counters.length > 0 && (
                      <p className="text-[10px] text-amber-200 truncate mb-1">
                        {counters.map((item) => `${item.count} ${item.name}`).join(' · ')}
                      </p>
                    )}
                    {canAct && (
                      <div className="flex flex-wrap gap-1">
                        {DESTINATIONS.filter((dest) => dest.to !== zone).map((dest) => (
                          <button
                            key={dest.to}
                            type="button"
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              dest.primary ? 'bg-amber-500 text-black font-semibold' : 'bg-white/10 hover:bg-white/20'
                            }`}
                            onClick={() => onTake?.(card, dest.to)}
                          >
                            {dest.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 hover:bg-white/20"
                          onClick={() => onSetFacedown?.(card.instanceId, !card.facedown)}
                        >
                          {card.facedown ? 'Révéler' : 'Cacher'}
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 hover:bg-white/20"
                          onClick={() => onOpenCounters?.(card.instanceId)}
                        >
                          Marqueurs
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {hover && <CardHoverPreview imageUrl={hover.imageUrl} name={hover.name} anchorRect={hover.rect} />}
    </div>
  );
}
