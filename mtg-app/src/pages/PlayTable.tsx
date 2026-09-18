import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { errorHandler } from '../services/errorHandler';
import * as playLobbyService from '../services/playLobbyService';
import { applyPlayAction, getMatchByLobby, subscribeMatch } from '../services/playMatchService';
import {
  DEFAULT_NOISE_GATE,
  getDeviceTrack,
  getPlayMedia,
  listPlayMediaDevices,
  loadPlayAvDevices,
  PlayRtcMesh,
  savePlayAvDevices,
} from '../services/playRtcService';
import { MicNoiseGate } from '../utils/micNoiseGate';
import type { MatchState, PlayAction, PlayLobby, PlaySeat, ZoneName } from '../types/play';
import { isDummyUserId } from '../utils/playTable';
import { PlayerBoard } from '../components/Play/PlayerBoard';
import { VideoTile } from '../components/Play/VideoTile';
import { RtcControls } from '../components/Play/RtcControls';
import { PlayAvConsent, PLAY_AV_CONSENT_KEY } from '../components/Play/PlayAvConsent';
import { RemoteAudioHub } from '../components/Play/RemoteAudio';
import { Spinner } from '../components/UI/Spinner';
import { watchWithPoll } from '../utils/playRealtime';
import type { RtcLinkStatus } from '../utils/rtcLinkStatus';

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
  const [cameraId, setCameraId] = useState(() => loadPlayAvDevices().cameraId ?? '');
  const [micId, setMicId] = useState(() => loadPlayAvDevices().micId ?? '');
  const [noiseGate, setNoiseGate] = useState(() => loadPlayAvDevices().noiseGate ?? DEFAULT_NOISE_GATE);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [rtcLink, setRtcLink] = useState<RtcLinkStatus>('idle');
  const [attachPickId, setAttachPickId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<'all' | 'active'>('all');
  const attachPickIdRef = useRef<string | null>(null);
  attachPickIdRef.current = attachPickId;
  const meshRef = useRef<PlayRtcMesh | null>(null);
  const gateRef = useRef<MicNoiseGate | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const startGenRef = useRef(0);
  const camOnRef = useRef(camOn);
  const micOnRef = useRef(micOn);
  const noiseGateRef = useRef(noiseGate);
  const devicesRef = useRef({ cameraId, micId });
  stateRef.current = state;
  camOnRef.current = camOn;
  micOnRef.current = micOn;
  noiseGateRef.current = noiseGate;
  devicesRef.current = { cameraId, micId };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
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
        navigate(`/play/${lobbyId}`, { replace: true, state: { fromTable: true } });
        return;
      }
      if (nextLobby.status === 'closed') {
        navigate('/play', { replace: true });
        return;
      }
      if (nextLobby.status !== 'playing') {
        navigate(`/play/${lobbyId}`, { replace: true, state: { fromTable: true } });
        return;
      }
      if (!match) {
        return;
      }
      setMatchId(match.id);
      setState(match.state);
    } catch (err) {
      errorHandler.handleAndShowError(err);
      navigate('/play', { replace: true });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [lobbyId, currentUser, navigate]);

  useEffect(() => {
    void load();
    const onChange = () => {
      void load({ silent: true });
    };
    return watchWithPoll(onChange, () => () => {});
  }, [load]);

  useEffect(() => {
    if (!matchId) return;
    return subscribeMatch(matchId, (match) => {
      setState(match.state);
    });
  }, [matchId]);

  const refreshDevices = useCallback(async () => {
    try {
      const next = await listPlayMediaDevices();
      setCameras(next.cameras);
      setMics(next.mics);
    } catch {
      /* ignore */
    }
  }, []);

  const applyEnabledFlags = useCallback((stream: MediaStream) => {
    stream.getVideoTracks().forEach((track) => {
      track.enabled = camOnRef.current;
    });
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micOnRef.current;
    });
    const nextCameraId = stream.getVideoTracks()[0]?.getSettings().deviceId;
    const nextMicId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    if (nextCameraId) setCameraId(nextCameraId);
    if (nextMicId) setMicId(nextMicId);
    if (nextCameraId || nextMicId) {
      savePlayAvDevices({
        cameraId: nextCameraId || devicesRef.current.cameraId || undefined,
        micId: nextMicId || devicesRef.current.micId || undefined,
        noiseGate: noiseGateRef.current,
      });
    }
    return stream;
  }, []);

  const publishLocalStream = useCallback((stream: MediaStream | null) => {
    captureStreamRef.current = stream;
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
  }, []);

  const applyOutgoingAudio = useCallback(async (rawStream: MediaStream): Promise<MediaStreamTrack | null> => {
    const rawAudio = rawStream.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
    if (!rawAudio) return null;
    if (!gateRef.current) gateRef.current = new MicNoiseGate();
    gateRef.current.setUserEnabled(micOnRef.current);
    const outgoing = await gateRef.current.attach(rawAudio, noiseGateRef.current / 100);
    return outgoing;
  }, []);

  const startRtc = useCallback(async (withMedia: boolean) => {
    if (!lobbyId || !currentUser || meshRef.current) return;
    const gen = ++startGenRef.current;
    const peerIds = (stateRef.current?.players || seats)
      .map((p) => p.userId)
      .filter((id) => !isDummyUserId(id));
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
      onLinkStatus: setRtcLink,
    });
    meshRef.current = mesh;
    let stream = new MediaStream();
    if (withMedia) {
      try {
        stream = applyEnabledFlags(
          await getPlayMedia({
            cameraId: devicesRef.current.cameraId || undefined,
            micId: devicesRef.current.micId || undefined,
          }),
        );
        setMediaError(null);
        void refreshDevices();
      } catch (err) {
        setMediaError(
          err instanceof Error ? err.message : 'Impossible d’accéder à la caméra ou au micro.',
        );
        stream = new MediaStream();
      }
    }
    if (gen !== startGenRef.current || meshRef.current !== mesh) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    publishLocalStream(stream);
    try {
      const outgoingAudio = await applyOutgoingAudio(stream);
      if (gen !== startGenRef.current || meshRef.current !== mesh) {
        stream.getTracks().forEach((track) => track.stop());
        gateRef.current?.destroy();
        gateRef.current = null;
        return;
      }
      const sendStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...(outgoingAudio ? [outgoingAudio] : stream.getAudioTracks()),
      ]);
      await mesh.start(peerIds, sendStream);
    } catch (err) {
      console.warn('WebRTC start failed', err);
    }
  }, [applyEnabledFlags, applyOutgoingAudio, lobbyId, currentUser, publishLocalStream, refreshDevices, seats]);

  const enableMedia = useCallback(async () => {
    try {
      const stream = applyEnabledFlags(
        await getPlayMedia({
          cameraId: devicesRef.current.cameraId || undefined,
          micId: devicesRef.current.micId || undefined,
        }),
      );
      const outgoingAudio = await applyOutgoingAudio(stream);
      if (meshRef.current) {
        await meshRef.current.replaceTrack('video', stream.getVideoTracks()[0] ?? null);
        await meshRef.current.replaceTrack('audio', outgoingAudio, { stopPrevious: false });
      }
      publishLocalStream(stream);
      localStorage.setItem(PLAY_AV_CONSENT_KEY, 'yes');
      setCamOn(true);
      setMicOn(true);
      setMediaError(null);
      void refreshDevices();
    } catch (err) {
      setMediaError(
        err instanceof Error ? err.message : 'Impossible d’accéder à la caméra ou au micro.',
      );
    }
  }, [applyEnabledFlags, applyOutgoingAudio, publishLocalStream, refreshDevices]);

  const switchDevice = useCallback(
    async (kind: 'audio' | 'video', deviceId: string) => {
      if (kind === 'video') {
        setCameraId(deviceId);
      } else {
        setMicId(deviceId);
      }
      savePlayAvDevices({
        cameraId: (kind === 'video' ? deviceId : devicesRef.current.cameraId) || undefined,
        micId: (kind === 'audio' ? deviceId : devicesRef.current.micId) || undefined,
        noiseGate: noiseGateRef.current,
      });
      try {
        const track = await getDeviceTrack(kind, deviceId || undefined);
        track.enabled = kind === 'video' ? camOnRef.current : micOnRef.current;
        const capture = new MediaStream(captureStreamRef.current?.getTracks() ?? []);
        capture.getTracks().forEach((existing) => {
          if (existing.kind === kind) {
            capture.removeTrack(existing);
            existing.stop();
          }
        });
        capture.addTrack(track);
        publishLocalStream(capture);
        if (kind === 'video') {
          await meshRef.current?.replaceTrack('video', track);
        } else {
          const outgoing = await applyOutgoingAudio(capture);
          await meshRef.current?.replaceTrack('audio', outgoing, { stopPrevious: true });
        }
        setMediaError(null);
        void refreshDevices();
      } catch (err) {
        setMediaError(
          err instanceof Error
            ? err.message
            : kind === 'video'
              ? 'Impossible de changer de caméra.'
              : 'Impossible de changer de micro.',
        );
      }
    },
    [applyOutgoingAudio, publishLocalStream, refreshDevices],
  );

  const toggleTrack = useCallback(
    (kind: 'audio' | 'video') => {
      const next = kind === 'video' ? !camOnRef.current : !micOnRef.current;
      if (kind === 'video') setCamOn(next);
      else {
        setMicOn(next);
        gateRef.current?.setUserEnabled(next);
      }
      const capture = captureStreamRef.current;
      const hasTrack = Boolean(
        (capture || meshRef.current?.stream || localStream)?.getTracks().some((track) => track.kind === kind),
      );
      if (next && !hasTrack) {
        void enableMedia();
        return;
      }
      if (kind === 'video') {
        meshRef.current?.setTrackEnabled(kind, next);
        capture?.getVideoTracks().forEach((track) => {
          track.enabled = next;
        });
      }
      if (capture) publishLocalStream(capture);
    },
    [enableMedia, localStream, publishLocalStream],
  );

  const changeNoiseGate = useCallback((value: number) => {
    setNoiseGate(value);
    noiseGateRef.current = value;
    savePlayAvDevices({
      cameraId: devicesRef.current.cameraId || undefined,
      micId: devicesRef.current.micId || undefined,
      noiseGate: value,
    });
    gateRef.current?.setAmount(value / 100);
  }, []);

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
    const ids = (state?.players || seats).map((item) => item.userId);
    void meshRef.current?.updatePeers(ids);
  }, [state?.players, seats]);

  useEffect(() => {
    void refreshDevices();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onChange = () => {
      void refreshDevices();
    };
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => {
    const resumeGate = () => {
      void gateRef.current?.ensureOutgoing();
    };
    document.addEventListener('pointerdown', resumeGate);
    return () => document.removeEventListener('pointerdown', resumeGate);
  }, []);

  useEffect(() => {
    return () => {
      startGenRef.current += 1;
      captureStreamRef.current?.getTracks().forEach((track) => track.stop());
      captureStreamRef.current = null;
      gateRef.current?.destroy();
      gateRef.current = null;
      setRtcLink('idle');
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
      stateRef.current = next;
      setState(next);
      return next;
    } catch (err) {
      errorHandler.handleAndShowError(err);
      void load();
    }
  }, [matchId, currentUser, load]);

  useEffect(() => {
    if (!attachPickId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachPickId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachPickId]);

  const players = useMemo(() => {
    if (!state || !currentUser) return [];
    return [...state.players]
      .filter((player) => !isDummyUserId(player.userId))
      .sort((a, b) => {
        if (a.userId === currentUser.uid) return 1;
        if (b.userId === currentUser.uid) return -1;
        return a.seatIndex - b.seatIndex;
      });
  }, [state, currentUser]);

  if (loading || !state || !currentUser) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-screen bg-slate-950 text-slate-200">
        <Spinner />
        {!loading && lobby?.status === 'playing' && !state ? (
          <p className="text-sm text-slate-400">Connexion à la table…</p>
        ) : null}
      </div>
    );
  }

  const activePlayer = players.find((player) => player.seatIndex === state.turnSeatIndex) || players[0];
  const shownPlayers = tableView === 'active' && activePlayer ? [activePlayer] : players;
  const count = players.length;
  const shownCount = shownPlayers.length;
  const stacked = shownCount <= 2;
  const focusedOther = tableView === 'active' && Boolean(activePlayer && activePlayer.userId !== currentUser.uid);

  const renderPane = (player: (typeof players)[number], compact: boolean) => {
    const isSelf = player.userId === currentUser.uid;
    const stream = isSelf ? localStream : remoteStreams[player.userId];
    return (
      <PlayerBoard
        player={player}
        isSelf={isSelf}
        viewerId={currentUser.uid}
        opponents={players
          .filter((p) => p.userId !== currentUser.uid)
          .map((p) => ({ userId: p.userId, displayName: p.displayName }))}
        isTurn={state.turnSeatIndex === player.seatIndex}
        compact={compact}
        seatHome={tableView === 'active'}
        collapseSeatHud={shownCount > 3}
        visibleSeats={shownCount}
        videoSlot={
          <VideoTile
            stream={stream}
            muted
            label={player.displayName || (isSelf ? 'Vous' : 'Joueur')}
          />
        }
        onDraw={() => send({ type: 'draw', userId: currentUser.uid })}
        onShuffle={() => send({ type: 'shuffleLibrary', userId: currentUser.uid })}
        onMulligan={() => send({ type: 'mulligan', userId: currentUser.uid })}
        onPassTurn={() => send({ type: 'passTurn' })}
        onLife={(delta) => send({ type: 'setLife', userId: currentUser.uid, delta })}
        onPoison={(delta) => send({ type: 'setPoison', userId: currentUser.uid, delta })}
        onMove={(instanceId, from, to, options) =>
          send({
            type: 'moveCard',
            userId: currentUser.uid,
            instanceId,
            from: from as ZoneName,
            to,
            toTop: options?.toTop,
            libraryPosition: options?.libraryPosition,
            facedown: options?.facedown,
          })
        }
        onSearchLibrary={(instanceId, to, options) =>
          send({
            type: 'searchLibrary',
            userId: currentUser.uid,
            instanceId,
            to,
            toTop: options?.toTop,
            libraryPosition: options?.libraryPosition,
            shuffle: options?.shuffle,
            facedown: options?.facedown,
          })
        }
        onTap={(instanceId) => send({ type: 'tap', userId: currentUser.uid, instanceId })}
        onFlip={(instanceId, faces) =>
          send({
            type: 'flip',
            userId: currentUser.uid,
            instanceId,
            backImageUrl: faces?.backImageUrl,
            backName: faces?.backName,
            backTypeLine: faces?.backTypeLine,
          })
        }
        onSetPlaymatRow={(instanceId, row) => send({ type: 'setPlaymatRow', userId: currentUser.uid, instanceId, row })}
        onShowHand={(viewerIds) => send({ type: 'showHand', userId: currentUser.uid, viewerIds })}
        onHideHand={() => send({ type: 'hideHand', userId: currentUser.uid })}
        onShowHandCard={(instanceId, viewerIds) =>
          send({ type: 'showHandCard', userId: currentUser.uid, instanceId, viewerIds })
        }
        onHideHandCard={(instanceId) => send({ type: 'hideHandCard', userId: currentUser.uid, instanceId })}
        onRevealLibraryTop={(viewerIds) => send({ type: 'revealLibraryTop', userId: currentUser.uid, viewerIds })}
        onHideLibraryTop={() => send({ type: 'hideLibraryTop', userId: currentUser.uid })}
        tablePlayers={players}
        attachPickId={attachPickId}
        onStartAttach={(instanceId) => setAttachPickId(instanceId)}
        onPickAttachHost={(hostInstanceId) => {
          const instanceId = attachPickIdRef.current;
          if (!instanceId) return;
          void send({
            type: 'attachCard',
            userId: currentUser.uid,
            instanceId,
            hostInstanceId,
          });
          setAttachPickId(null);
        }}
        onDetach={(instanceId) =>
          send({ type: 'attachCard', userId: currentUser.uid, instanceId, hostInstanceId: null })
        }
        onSetFacedown={(instanceId, facedown) =>
          send({ type: 'setFacedown', userId: currentUser.uid, instanceId, facedown })
        }
        onSetCounter={(instanceId, counterId, delta) =>
          send({ type: 'setCounter', userId: currentUser.uid, instanceId, counterId, delta })
        }
        onAddToken={(card, quantity) =>
          send({ type: 'addToken', userId: currentUser.uid, card, quantity })
        }
        onRemoveToken={(instanceId) =>
          send({ type: 'removeToken', userId: currentUser.uid, instanceId })
        }
        onScry={(count, onTop, onBottom) =>
          send({ type: 'scry', userId: currentUser.uid, count, onTop, onBottom })
        }
        onSurveil={(count, onTop, toGraveyard) =>
          send({ type: 'surveil', userId: currentUser.uid, count, onTop, toGraveyard })
        }
        onReorderHand={(instanceId, toIndex) =>
          send({ type: 'reorderHand', userId: currentUser.uid, instanceId, toIndex })
        }
        onToggleHandChoice={(instanceId) =>
          send({ type: 'chooseHandCard', userId: currentUser.uid, ownerId: player.userId, instanceId })
        }
        onClearHandChoices={() =>
          send({ type: 'clearHandChoices', userId: currentUser.uid, ownerId: player.userId })
        }
      />
    );
  };

  return (
    <div className="h-dvh flex flex-col bg-[#07141c] text-white overflow-hidden">
      <RemoteAudioHub streams={remoteStreams} />
      <header className="shrink-0 relative z-30 flex items-center justify-between gap-2 px-2 sm:px-3 py-1.5 bg-black/40 border-b border-white/10">
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
        <div className="flex items-center rounded-lg bg-black/30 ring-1 ring-white/15 p-0.5 shrink-0">
          <button
            type="button"
            className={`px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold ${
              tableView === 'all' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
            }`}
            onClick={() => setTableView('all')}
          >
            Vue globale
          </button>
          <button
            type="button"
            title={activePlayer?.displayName ? `Plateau de ${activePlayer.displayName}` : 'Joueur dont c’est le tour'}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold ${
              tableView === 'active' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
            }`}
            onClick={() => setTableView('active')}
          >
            Joueur actif
          </button>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <RtcControls
            camOn={camOn}
            micOn={micOn}
            linkStatus={rtcLink}
            cameras={cameras}
            mics={mics}
            cameraId={cameraId}
            micId={micId}
            noiseGate={noiseGate}
            previewStream={localStream}
            error={mediaError}
            onToggleCam={() => toggleTrack('video')}
            onToggleMic={() => toggleTrack('audio')}
            onCameraChange={(id) => void switchDevice('video', id)}
            onMicChange={(id) => void switchDevice('audio', id)}
            onNoiseGateChange={changeNoiseGate}
            onEnableMedia={
              localStream?.getTracks().length ? undefined : () => void enableMedia()
            }
          />
          <button
            type="button"
            className="relative z-30 text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 min-h-[36px]"
            onClick={() => {
              captureStreamRef.current?.getTracks().forEach((track) => track.stop());
              captureStreamRef.current = null;
              gateRef.current?.destroy();
              gateRef.current = null;
              void meshRef.current?.destroy();
              meshRef.current = null;
              navigate('/play');
            }}
          >
            Quitter
          </button>
        </div>
      </header>

      {attachPickId && (
        <div className="shrink-0 relative z-30 flex items-center justify-center gap-3 px-3 py-1.5 bg-amber-400 text-black text-sm font-medium">
          <span>Choisissez la carte à laquelle attacher</span>
          <button
            type="button"
            className="px-2 py-0.5 rounded bg-black/15 hover:bg-black/25 text-xs font-semibold"
            onClick={() => setAttachPickId(null)}
          >
            Annuler
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <div
          className={
            stacked
              ? 'h-full min-h-0 flex flex-col gap-0 p-1'
              : 'h-full min-h-0 grid grid-cols-1 md:grid-cols-2 gap-1 p-1'
          }
        >
          {shownPlayers.map((player, index) => {
            const isSelf = player.userId === currentUser.uid;
            const compact = shownCount > 1 && (stacked ? !isSelf : count >= 3 && !isSelf);
            const span = !stacked && shownCount === 3 && index === 2 ? 'md:col-span-2' : '';
            const stackedSize = stacked ? 'flex-1 min-h-0' : 'min-h-0';
            return (
              <section key={player.userId} className={`${stacked ? stackedSize : `min-h-0 ${span}`}`}>
                {renderPane(player, compact)}
              </section>
            );
          })}
        </div>
        {focusedOther && (
          <button
            type="button"
            className="absolute bottom-4 right-4 z-40 min-h-[52px] px-4 sm:px-5 rounded-xl text-sm font-bold shadow-2xl bg-amber-400 text-black ring-4 ring-amber-100/90 hover:bg-amber-300"
            onClick={() => send({ type: 'passTurn' })}
          >
            Fin de tour
          </button>
        )}
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
