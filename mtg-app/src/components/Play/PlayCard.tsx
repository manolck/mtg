import type { MouseEvent } from 'react';
import type { TableCard } from '../../types/play';

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
  onClick,
  onContextMenu,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: PlayCardProps) {
  const hidden = hideFace || card.facedown;
  const src = !hidden && card.imageUrl ? card.imageUrl : '';

  return (
    <button
      type="button"
      title={title || (hidden ? 'Carte cachée' : card.name)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative aspect-[63/88] rounded-md overflow-hidden bg-[#1a1520] shadow-md ring-1 ring-white/10 shrink-0 transition-transform duration-150 hover:z-20 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        SIZE_CLASS[size]
      } ${card.tapped ? 'rotate-90 origin-center mx-2 my-1' : ''} ${className}`}
    >
      {src ? (
        <img src={src} alt={card.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,#2a2233_0_8px,#1a1520_8px_16px)] text-[9px] font-semibold tracking-wide text-amber-100/80">
          MTG
        </span>
      )}
    </button>
  );
}
