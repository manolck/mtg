import type { ReactNode } from 'react';
import type { Deck } from '../../types/deck';
import { getDeckBackdropUrl, pickDeckIconCard } from '../../utils/deckArt';

interface DeckCoverCardProps {
  deck: Deck;
  children: ReactNode;
  className?: string;
}

export function DeckCoverCard({ deck, children, className = '' }: DeckCoverCardProps) {
  const backdrop = getDeckBackdropUrl(deck);
  const icon = pickDeckIconCard(deck);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-black/20 dark:border-white/10 shadow-sm min-h-[200px] ${className}`}
    >
      <div className="absolute inset-0 bg-slate-900" />
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className="absolute inset-0 h-full w-full object-cover scale-110"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
      {icon?.imageUrl && (
        <img
          src={icon.imageUrl}
          alt=""
          className="pointer-events-none absolute -right-3 -top-8 w-[4.5rem] sm:w-20 rotate-12 rounded-lg opacity-90 shadow-2xl ring-1 ring-white/25"
        />
      )}
      <div className="relative z-10 flex h-full flex-col p-5 text-white">{children}</div>
    </div>
  );
}
