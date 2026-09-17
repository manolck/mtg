import type { MouseEvent } from 'react';
import type { TableCard } from '../../types/play';
import { visibleCardFace } from '../../utils/playTable';

export const MTG_CARD_BACK_URL = '/play/mtg-card-back.png';

const SIZE_CLASS = {
  sm: 'w-10 sm:w-12',
  md: 'w-14 sm:w-[4.5rem]',
  lg: 'w-[4.25rem] sm:w-20 md:w-[5.5rem]',
};

interface PlayCardProps {
  card: TableCard;
  hideFace?: boolean;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  title?: string;
  canTransform?: boolean;
  onTransform?: () => void;
  onClick?: (event: MouseEvent) => void;
  onContextMenu?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
}

export function PlayCard({
  card,
  hideFace = false,
  size = 'md',
  className = '',
  title,
  canTransform = false,
  onTransform,
  onClick,
  onContextMenu,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: PlayCardProps) {
  const hidden = hideFace || card.facedown;
  const face = visibleCardFace(card);
  const src = hidden ? MTG_CARD_BACK_URL : face.imageUrl || MTG_CARD_BACK_URL;

  return (
    <button
      type="button"
      title={title || (hidden ? 'Carte cachée' : face.name)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] shadow-md ring-1 ring-white/10 shrink-0 transition-transform duration-150 hover:z-20 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        SIZE_CLASS[size]
      } ${card.tapped ? 'rotate-90 origin-center mx-2 my-1' : ''} ${className}`}
    >
      <img
        src={src}
        alt={hidden ? 'Dos de carte' : face.name}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
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
    </button>
  );
}
