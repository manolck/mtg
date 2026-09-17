import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import * as playLobbyService from '../services/playLobbyService';
import { startMatch } from '../services/playMatchService';
import type { PlayLobby, PlaySeat } from '../types/play';
import { DECK_FORMAT_LABELS } from '../types/deck';
import { isAdmin } from '../types/user';
import { emptyWaitingLobbyRemainingMs, EMPTY_WAITING_LOBBY_MS, formatCountdown } from '../utils/playLobby';
import { watchWithPoll } from '../utils/playRealtime';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';
import { SeatPane } from '../components/Play/SeatPane';
import { DeckPickerModal } from '../components/Play/DeckPickerModal';

export function PlayLobby() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { currentUser } = useAuth();
  const { profile } = useProfile();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fromTable = Boolean((location.state as { fromTable?: boolean } | null)?.fromTable);
  const [lobby, setLobby] = useState<PlayLobby | null>(null);
  const [seats, setSeats] = useState<PlaySeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const refresh = useCallback(async () => {
    if (!lobbyId) return;
    try {
      const [nextLobby, nextSeats] = await Promise.all([
        playLobbyService.getLobby(lobbyId),
        playLobbyService.listSeats(lobbyId),
      ]);
      setLobby(nextLobby);
      setSeats(nextSeats);
      if (nextLobby.status === 'closed') {
        showError('Ce lobby a été fermé.');
        navigate('/play', { replace: true });
        return;
      }
      if (nextLobby.status === 'playing' && !fromTable) {
        navigate(`/play/${lobbyId}/table`, { replace: true });
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        navigate('/play', { replace: true });
        return;
      }
      errorHandler.handleAndShowError(err);
    } finally {
      setLoading(false);
    }
  }, [lobbyId, navigate, fromTable, showError]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    if (!lobbyId) return;
    const onChange = () => {
      void refreshRef.current();
    };
    return watchWithPoll(onChange, () => playLobbyService.subscribeLobby(lobbyId, onChange));
  }, [lobbyId]);

  const mySeat = seats.find((s) => s.userId === currentUser?.uid);
  const isHost = lobby?.hostId === currentUser?.uid;
  const canDeleteLobby = isAdmin(profile);
  const emptyRemainingMs = lobby
    ? emptyWaitingLobbyRemainingMs({
        status: lobby.status,
        createdAt: lobby.createdAt,
        seatCount: seats.length,
        now,
      })
    : null;

  useEffect(() => {
    if (emptyRemainingMs === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [emptyRemainingMs === null]);

  useEffect(() => {
    if (!lobby || lobby.status !== 'waiting' || seats.length >= 1) return;
    const created = lobby.createdAt.getTime();
    const wait = Math.max(0, created + EMPTY_WAITING_LOBBY_MS - Date.now());
    const hostId = lobby.hostId;
    const id = lobby.id;
    const timer = window.setTimeout(async () => {
      if (hostId === currentUser?.uid) {
        try {
          await playLobbyService.closeLobby(id);
        } catch {
          /* already closed */
        }
      }
      showError('Aucun joueur n’a rejoint. Le lobby a été fermé.');
      navigate('/play', { replace: true });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [lobby?.id, lobby?.status, lobby?.createdAt, lobby?.hostId, seats.length, currentUser?.uid, navigate, showError]);
  const waitingOn = seats.filter((s) => !s.ready || !(s.deckSnapshot || s.deckId));
  const allReady = seats.length >= 1 && waitingOn.length === 0;
  const startHint =
    seats.length === 0
      ? 'Personne n’est assis.'
      : waitingOn.length > 0
        ? `En attente : ${waitingOn.map((s) => `${s.displayName || 'Joueur'}${s.deckSnapshot || s.deckId ? '' : ' (deck)'}`).join(', ')}`
        : 'Tout le monde est prêt.';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showSuccess('Lien du lobby copié');
    } catch {
      showError('Impossible de copier le lien.');
    }
  };

  const handleJoin = async () => {
    if (!currentUser || !lobbyId) return;
    try {
      setJoining(true);
      await playLobbyService.joinLobby({
        lobbyId,
        userId: currentUser.uid,
        displayName: profile?.pseudonym || currentUser.email || 'Joueur',
      });
      await refresh();
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!mySeat || !lobby) return;
    try {
      await playLobbyService.leaveLobby(mySeat.id);
      if (isHost) {
        await playLobbyService.closeLobby(lobby.id);
      }
      navigate('/play');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const confirmDeleteLobby = async () => {
    if (!lobby) return;
    try {
      setDeleting(true);
      await playLobbyService.deleteLobby(lobby.id);
      showSuccess(`Lobby « ${lobby.name} » supprimé`);
      navigate('/play', { replace: true });
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setDeleting(false);
    }
  };

  const handlePick = async (deckId: string) => {
    if (!mySeat) return;
    await playLobbyService.chooseDeck(mySeat.id, deckId);
    showSuccess('Deck sélectionné');
    await refresh();
  };

  const handleReady = async () => {
    if (!mySeat) return;
    if (!mySeat.deckId && !mySeat.deckSnapshot) {
      showError('Choisissez un deck avant de vous déclarer prêt.');
      return;
    }
    try {
      await playLobbyService.setReady(mySeat.id, !mySeat.ready);
      await refresh();
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleStart = async () => {
    if (!lobby || !currentUser) return;
    if (!allReady) {
      showError(startHint);
      return;
    }
    try {
      setStarting(true);
      await startMatch({
        lobbyId: lobby.id,
        hostId: currentUser.uid,
        format: lobby.format,
        seats,
      });
      navigate(`/play/${lobby.id}/table`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="page-shell">
        <p className="text-gray-600 dark:text-gray-400">Lobby introuvable.</p>
        <Link to="/play" className="text-blue-600 dark:text-blue-400 hover:underline">
          Retour aux lobbies
        </Link>
      </div>
    );
  }

  const slots = Array.from({ length: lobby.maxPlayers }, (_, i) => seats.find((s) => s.seatIndex === i));

  return (
    <div className="page-shell">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/play" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            ← Lobbies
          </Link>
          <h1 className="page-title mt-2">{lobby.name}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {DECK_FORMAT_LABELS[lobby.format]} · {seats.length}/{lobby.maxPlayers} joueurs
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xl">
            Choisissez un deck (le vôtre ou un deck communautaire), passez prêt, puis l’hôte lance la table.
            Les règles Magic restent manuelles : chacun déplace ses cartes.
          </p>
          {emptyRemainingMs !== null && lobby.status === 'waiting' && seats.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
              Aucun joueur. Fermeture dans {formatCountdown(emptyRemainingMs)}.
            </p>
          )}
          {lobby.status === 'playing' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-amber-700 dark:text-amber-300">Partie en cours.</p>
              <Link
                to={`/play/${lobby.id}/table`}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400"
              >
                Retour à la table
              </Link>
            </div>
          )}
        </div>
        {isHost && lobby.status === 'waiting' && (
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={copyLink}>
                Copier le lien
              </Button>
              <Button onClick={handleStart} loading={starting} disabled={!allReady} title={startHint}>
                Lancer la partie
              </Button>
            </div>
            <p className={`text-sm ${allReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
              {startHint}
            </p>
            {canDeleteLobby && (
              <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} loading={deleting}>
                Supprimer le lobby
              </Button>
            )}
          </div>
        )}
        {!isHost && (
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <Button variant="secondary" onClick={copyLink}>
              Copier le lien
            </Button>
            {canDeleteLobby && (
              <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} loading={deleting}>
                Supprimer le lobby
              </Button>
            )}
          </div>
        )}
        {isHost && canDeleteLobby && lobby.status !== 'waiting' && (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} loading={deleting}>
            Supprimer le lobby
          </Button>
        )}
      </div>

      <div className={`grid gap-4 ${lobby.maxPlayers > 2 ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
        {slots.map((seat, index) => (
          <SeatPane
            key={index}
            seat={seat}
            seatIndex={index}
            isHost={Boolean(seat && seat.userId === lobby.hostId)}
            isSelf={Boolean(seat && seat.userId === currentUser?.uid)}
            canJoin={!mySeat && lobby.status === 'waiting' && !seat}
            joining={joining}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onPickDeck={() => setPickerOpen(true)}
            onToggleReady={handleReady}
          />
        ))}
      </div>

      {currentUser && (
        <DeckPickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          userId={currentUser.uid}
          preferredFormat={lobby.format}
          onPick={handlePick}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Supprimer le lobby"
        message={`Supprimer « ${lobby.name} » ? Les sièges et la table associée seront effacés.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        onConfirm={() => void confirmDeleteLobby()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
