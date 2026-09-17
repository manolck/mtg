import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { errorHandler } from '../services/errorHandler';
import * as playLobbyService from '../services/playLobbyService';
import { applyPlayAction, getMatchByLobby, subscribeMatch } from '../services/playMatchService';
import { getDisplayMedia, PlayRtcMesh } from '../services/playRtcService';
import type { MatchState, PlayAction, PlayLobby, PlaySeat, ZoneName } from '../types/play';
import { PlayerBoard } from '../components/Play/PlayerBoard';
import { VideoTile } from '../components/Play/VideoTile';
import { RtcControls } from '../components/Play/RtcControls';
import { PlayAvConsent, PLAY_AV_CONSENT_KEY } from '../components/Play/PlayAvConsent';
import { Spinner } from '../components/UI/Spinner';

export function PlayTable() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<PlayLobby | null>(null);
  const [seats, setSeats] = useState<PlaySeat[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [consentOpen, setConsentOpen] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const meshRef = useRef<PlayRtcMesh | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  stateRef.current = state;

  const load = useCallback(async () => {
    if (!lobbyId || !currentUser) return;
    try {
      const [nextLobby, nextSeats, match] = await Promise.all([
        playLobbyService.getLobby(lobbyId),
        playLobbyService.listSeats(lobbyId),
        getMatchByLobby(lobbyId),
      ]);
      setLobby(nextLobby);
      setSeats(nextSeats);
      const seated = nextSeats.some((s) => s.userId === currentUser.uid);
      if (!seated) {
        navigate(`/play/${lobbyId}`, { replace: true });
        return;
      }
      if (nextLobby.status !== 'playing' || !match) {
        navigate(`/play/${lobbyId}`, { replace: true });
        return;
      }
      setMatchId(match.id);
      setState(match.state);
    } catch (err) {
      errorHandler.handleAndShowError(err);
      navigate('/play', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [lobbyId, currentUser, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!matchId) return;
    return subscribeMatch(matchId, (match) => {
      setState(match.state);
    });
  }, [matchId]);

  const startRtc = useCallback(async (withMedia: boolean) => {
    if (!lobbyId || !currentUser || meshRef.current) return;
    const peerIds = (stateRef.current?.players || seats).map((p) => p.userId);
    const mesh = new PlayRtcMesh(lobbyId, currentUser.uid, {
      onRemoteStream: (userId, stream) => {
        setRemoteStreams((prev) => ({ ...prev, [userId]: stream }));
      },
      onRemoteStreamEnded: (userId) => {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      },
    });
    meshRef.current = mesh;
    try {
      const stream = withMedia ? await getDisplayMedia() : new MediaStream();
      setLocalStream(stream);
      await mesh.start(peerIds, stream);
    } catch (err) {
      console.warn('WebRTC start failed', err);
    }
  }, [lobbyId, currentUser, seats]);

  useEffect(() => {
    if (!matchId || !currentUser || !lobbyId) return;
    const stored = localStorage.getItem(PLAY_AV_CONSENT_KEY);
    if (stored === 'yes' || stored === 'no') {
      void startRtc(stored === 'yes');
    } else {
      setConsentOpen(true);
    }
  }, [matchId, currentUser, lobbyId, startRtc]);

  useEffect(() => {
    return () => {
      void meshRef.current?.destroy();
      meshRef.current = null;
    };
  }, []);

  const send = useCallback(async (action: PlayAction) => {
    if (!matchId || !currentUser || !stateRef.current) return;
    try {
      const next = await applyPlayAction({
        matchId,
        userId: currentUser.uid,
        current: stateRef.current,
        action,
      });
      setState(next);
    } catch (err) {
      errorHandler.handleAndShowError(err);
      void load();
    }
  }, [matchId, currentUser, load]);

  const players = useMemo(() => {
    if (!state || !currentUser) return [];
    return [...state.players].sort((a, b) => {
      if (a.userId === currentUser.uid) return 1;
      if (b.userId === currentUser.uid) return -1;
      return a.seatIndex - b.seatIndex;
    });
  }, [state, currentUser]);

  const count = players.length;
  const stacked = count <= 2;

  if (loading || !state || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Spinner />
      </div>
    );
  }

  const renderPane = (player: (typeof players)[number], compact: boolean) => {
    const isSelf = player.userId === currentUser.uid;
    const stream = isSelf ? localStream : remoteStreams[player.userId];
    return (
      <PlayerBoard
        player={player}
        isSelf={isSelf}
        isTurn={state.turnSeatIndex === player.seatIndex}
        compact={compact}
        videoSlot={
          <VideoTile
            stream={stream}
            muted={isSelf}
            label={player.displayName || (isSelf ? 'Vous' : 'Joueur')}
          />
        }
        onDraw={() => send({ type: 'draw', userId: currentUser.uid })}
        onShuffle={() => send({ type: 'shuffleLibrary', userId: currentUser.uid })}
        onMulligan={() => send({ type: 'mulligan', userId: currentUser.uid })}
        onPassTurn={() => send({ type: 'passTurn' })}
        onLife={(delta) => send({ type: 'setLife', userId: currentUser.uid, delta })}
        onPoison={(delta) => send({ type: 'setPoison', userId: currentUser.uid, delta })}
        onMove={(instanceId, from, to) =>
          send({ type: 'moveCard', userId: currentUser.uid, instanceId, from: from as ZoneName, to })
        }
        onSearchLibrary={(instanceId, to, options) =>
          send({
            type: 'searchLibrary',
            userId: currentUser.uid,
            instanceId,
            to,
            toTop: options?.toTop,
            shuffle: options?.shuffle,
          })
        }
        onTap={(instanceId) => send({ type: 'tap', userId: currentUser.uid, instanceId })}
        onFlip={(instanceId) => send({ type: 'flip', userId: currentUser.uid, instanceId })}
      />
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#07141c] text-white overflow-hidden">
      <header className="shrink-0 relative z-30 flex items-center justify-between gap-3 px-3 py-1.5 bg-black/40 border-b border-white/10">
        <div className="min-w-0">
          <Link
            to={`/play/${lobbyId}`}
            state={{ fromTable: true }}
            className="text-xs text-sky-300 hover:underline"
          >
            ← Lobby
          </Link>
          <p className="text-sm font-semibold truncate leading-tight">{lobby?.name || 'Table'}</p>
        </div>
        <p className="hidden lg:block text-[11px] text-white/45 max-w-xl truncate">
          Clic main → poser · Clic champ → engager · Clic droit → déplacer · D piocher · / bibliothèque · +/− PV
        </p>
        <div className="flex items-center gap-2">
          <RtcControls
            camOn={camOn}
            micOn={micOn}
            onToggleCam={() => {
              const next = !camOn;
              setCamOn(next);
              meshRef.current?.setTrackEnabled('video', next);
            }}
            onToggleMic={() => {
              const next = !micOn;
              setMicOn(next);
              meshRef.current?.setTrackEnabled('audio', next);
            }}
          />
          <button
            type="button"
            className="relative z-30 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            onClick={() => {
              void meshRef.current?.destroy();
              meshRef.current = null;
              navigate('/play');
            }}
          >
            Quitter
          </button>
        </div>
      </header>

      <div
        className={
          stacked
            ? 'flex-1 min-h-0 flex flex-col gap-1 p-1'
            : `flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1 p-1`
        }
      >
        {players.map((player, index) => {
          const isSelf = player.userId === currentUser.uid;
          const compact = stacked ? !isSelf : count >= 3 && !isSelf;
          const span = !stacked && count === 3 && index === 2 ? 'md:col-span-2' : '';
          const stackedSize = stacked ? (isSelf ? 'flex-[1.65] min-h-0' : 'h-[34%] min-h-[140px] max-h-[42%]') : 'min-h-0';
          return (
            <section key={player.userId} className={`${stacked ? stackedSize : `min-h-0 ${span}`}`}>
              {renderPane(player, compact)}
            </section>
          );
        })}
      </div>

      <PlayAvConsent
        isOpen={consentOpen}
        onAccept={() => {
          localStorage.setItem(PLAY_AV_CONSENT_KEY, 'yes');
          setConsentOpen(false);
          void startRtc(true);
        }}
        onDecline={() => {
          localStorage.setItem(PLAY_AV_CONSENT_KEY, 'no');
          setConsentOpen(false);
          void startRtc(false);
        }}
      />
    </div>
  );
}
