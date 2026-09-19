import type { CSSProperties, MouseEvent } from 'react';
import { counterTone, listedCounterCounts } from '../../data/mtgCounters';
import type { TableCard } from '../../types/play';
import { visibleCardFace } from '../../utils/playTable';

export const MTG_CARD_BACK_URL = '/play/mtg-card-back.png';

const SIZE_CLASS = {
  sm: 'w-12 sm:w-[3.6rem]',
  md: 'w-[4.2rem] sm:w-[5.4rem]',
  lg: 'w-[5.1rem] sm:w-24 md:w-[6.6rem]',
};

interface PlayCardProps {
  card: TableCard;
  hideFace?: boolean;
  size?: keyof typeof SIZE_CLASS;
  widthPx?: number;
  style?: CSSProperties;
  className?: string;
  title?: string;
  canTransform?: boolean;
  onTransform?: () => void;
  onClick?: (event: MouseEvent) => void;
  onContextMenu?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
  onCounterDelta?: (counterId: string, delta: number) => void;
  onOpenCounters?: () => void;
  chosen?: boolean;
  stackCount?: number;
}

export function PlayCard({
  card,
  hideFace = false,
  size = 'md',
  widthPx,
  style,
  className = '',
  title,
  canTransform = false,
  onTransform,
  onClick,
  onContextMenu,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  onCounterDelta,
  onOpenCounters,
  chosen = false,
  stackCount = 1,
}: PlayCardProps) {
  const hidden = hideFace;
  const face = visibleCardFace(card);
  const src = hidden ? MTG_CARD_BACK_URL : face.imageUrl || MTG_CARD_BACK_URL;
  const counters = listedCounterCounts(card.counters);
  const shown = counters.slice(0, 4);
  const extra = counters.length - shown.length;

  return (
    <button
      type="button"
      data-play-card-id={card.instanceId}
      title={title || (hidden ? 'Carte cachée' : face.name)}
      aria-label={title || (hidden ? 'Carte cachée' : face.name)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] shadow-md ring-1 ring-white/10 shrink-0 transition-transform duration-150 hover:z-20 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        widthPx ? '' : SIZE_CLASS[size]
      } ${card.tapped ? 'rotate-90 origin-center mx-2 my-1' : ''} ${
        chosen ? 'ring-2 ring-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.55)]' : ''
      } ${className}`}
      style={widthPx ? { width: widthPx, ...style } : style}
    >
      <img
        src={src}
        alt={hidden ? 'Dos de carte' : face.name}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {card.isToken && !hidden && (
        <span className="absolute left-0.5 bottom-0.5 z-10 rounded bg-fuchsia-700/90 px-0.5 text-[7px] sm:text-[8px] font-bold uppercase tracking-wide text-white">
          Jeton
        </span>
      )}
      {stackCount > 1 && (
        <span className="absolute right-0.5 top-0.5 z-20 rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold tabular-nums text-amber-200 ring-1 ring-white/25">
          ×{stackCount}
        </span>
      )}
      {chosen && (
        <>
          <span className="absolute inset-x-0 top-0 z-20 bg-sky-500/95 px-0.5 py-0.5 text-center text-[8px] sm:text-[9px] font-bold uppercase tracking-wide text-white">
            Choisi
          </span>
          <span className="absolute inset-x-0 bottom-0 z-20 bg-sky-500/95 px-0.5 py-0.5 text-center text-[8px] sm:text-[9px] font-bold uppercase tracking-wide text-white">
            Choisi
          </span>
        </>
      )}
      {canTransform && !hidden && onTransform && (
        <span
          role="button"
          tabIndex={0}
          title={card.transformed ? 'Revenir au recto' : 'Voir le verso'}
          className="absolute bottom-0.5 right-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-[11px] text-amber-100 ring-1 ring-white/30 hover:bg-amber-500 hover:text-black"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTransform();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onTransform();
            }
          }}
        >
          ↻
        </span>
      )}
      {counters.length > 0 && (
        <span className="absolute inset-x-0 top-0 z-10 flex flex-wrap justify-center gap-0.5 p-0.5 pointer-events-none">
          {shown.map((item) => {
            const tone = counterTone(item.id);
            const toneClass =
              tone === 'plus'
                ? 'bg-emerald-600/90 text-white'
                : tone === 'minus'
                  ? 'bg-red-700/90 text-white'
                  : tone === 'loyalty'
                    ? 'bg-violet-700/90 text-white'
                    : tone === 'keyword'
                      ? 'bg-sky-700/90 text-white'
                      : 'bg-amber-500/90 text-black';
            return (
              <span
                key={item.id}
                role={onCounterDelta ? 'button' : undefined}
                title={`${item.name} × ${item.count}${onCounterDelta ? ' · clic +1 · Shift −1' : ''}`}
                className={`pointer-events-auto max-w-full truncate rounded px-0.5 text-[8px] sm:text-[9px] font-bold leading-tight tabular-nums ${toneClass} ${
                  onCounterDelta ? 'cursor-pointer hover:brightness-110' : ''
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCounterDelta?.(item.id, event.shiftKey ? -1 : 1);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenCounters?.();
                }}
              >
                {item.count} {item.name}
              </span>
            );
          })}
          {extra > 0 && (
            <span
              role={onOpenCounters ? 'button' : undefined}
              className={`pointer-events-auto rounded bg-black/75 px-0.5 text-[8px] font-semibold text-white ${
                onOpenCounters ? 'cursor-pointer' : ''
              }`}
              title="Autres marqueurs"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenCounters?.();
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              +{extra}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
