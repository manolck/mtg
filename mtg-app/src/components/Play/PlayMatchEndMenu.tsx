interface PlayMatchEndMenuProps {
  winnerName: string;
  isWinner: boolean;
  onRematch: () => void;
  onLeave: () => void;
  rematchBusy?: boolean;
}

export function PlayMatchEndMenu({
  winnerName,
  isWinner,
  onRematch,
  onLeave,
  rematchBusy,
}: PlayMatchEndMenuProps) {
  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="play-match-end-title"
      data-testid="play-match-end"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#0b1c26]/95 ring-1 ring-amber-300/35 shadow-2xl px-5 py-6 text-center text-white">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-amber-300/90">PARTIE TERMINÉE</p>
        <h2 id="play-match-end-title" className="mt-2 text-2xl font-bold">
          {isWinner ? 'Victoire' : 'Défaite'}
        </h2>
        <p className="mt-2 text-sm text-white/70">
          {isWinner ? 'Vous avez gagné la partie.' : `${winnerName} a gagné la partie.`}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-amber-400 px-4 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
            onClick={onRematch}
            disabled={rematchBusy}
          >
            {rematchBusy ? 'Nouvelle partie…' : 'Rejouer'}
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
            onClick={onLeave}
          >
            Retour au lobby
          </button>
        </div>
      </div>
    </div>
  );
}
