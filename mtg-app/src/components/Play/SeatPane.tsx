import type { PlaySeat } from '../../types/play';
import { Button } from '../UI/Button';

interface SeatPaneProps {
  seat?: PlaySeat;
  seatIndex: number;
  isHost: boolean;
  isSelf: boolean;
  canJoin: boolean;
  joining?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  onPickDeck?: () => void;
  onToggleReady?: () => void;
}

export function SeatPane({
  seat,
  seatIndex,
  isHost,
  isSelf,
  canJoin,
  joining,
  onJoin,
  onLeave,
  onPickDeck,
  onToggleReady,
}: SeatPaneProps) {
  const commander = seat?.deckSnapshot?.commanders?.[0];
  const deckName = seat?.deckSnapshot?.name || (seat?.deckId ? 'Deck choisi' : null);

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col gap-3 min-h-[200px] ${
        seat?.ready
          ? 'border-emerald-400/70 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      } ${isSelf ? 'ring-2 ring-blue-400/60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Siège {seatIndex + 1}</h3>
        <div className="flex items-center gap-1.5">
          {isHost && seat && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              Hôte
            </span>
          )}
          {seat?.ready ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
              Prêt
            </span>
          ) : seat ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Pas prêt
            </span>
          ) : null}
        </div>
      </div>
      {!seat ? (
        canJoin ? (
          <div className="mt-auto">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Place libre</p>
            <Button onClick={onJoin} loading={joining} className="w-full">
              S’asseoir ici
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-auto">En attente d’un joueur…</p>
        )
      ) : (
        <>
          <p className="text-gray-900 dark:text-white font-medium truncate">
            {seat.displayName || 'Joueur'}
            {isSelf ? ' (vous)' : ''}
          </p>
          <div className="flex items-center gap-3 min-h-[52px]">
            {commander?.imageUrl ? (
              <img
                src={commander.imageUrl}
                alt={commander.name}
                className="w-10 aspect-[63/88] rounded object-cover ring-1 ring-black/10"
              />
            ) : (
              <div className="w-10 aspect-[63/88] rounded bg-gray-200 dark:bg-gray-700" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{deckName || 'Aucun deck'}</p>
              {commander && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{commander.name}</p>
              )}
              {!deckName && isSelf && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Choisissez un deck pour vous déclarer prêt.</p>
              )}
            </div>
          </div>
          {isSelf && (
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onPickDeck}>
                {deckName ? 'Changer de deck' : 'Choisir un deck'}
              </Button>
              <Button
                onClick={onToggleReady}
                disabled={!seat.deckId && !seat.deckSnapshot}
                variant={seat.ready ? 'secondary' : 'primary'}
              >
                {seat.ready ? 'Pas prêt' : 'Je suis prêt'}
              </Button>
              <Button variant="danger" onClick={onLeave}>
                Quitter
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
