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
  const [cameraId, setCameraId] = useState(() => loadPlayAvDevices().cameraId ?? '');
  const [micId, setMicId] = useState(() => loadPlayAvDevices().micId ?? '');
  const [noiseGate, setNoiseGate] = useState(() => loadPlayAvDevices().noiseGate ?? DEFAULT_NOISE_GATE);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
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
    const outgoing = await gateRef.current.attach(rawAudio, noiseGateRef.current / 100);
    outgoing.enabled = micOnRef.current;
    return outgoing;
  }, []);

  const startRtc = useCallback(async (withMedia: boolean) => {
    if (!lobbyId || !currentUser || meshRef.current) return;
    const gen = ++startGenRef.current;
    const peerIds = (stateRef.current?.players || seats).map((p) => p.userId);
    const mesh = new PlayRtcMesh(lobbyId, currentUser.uid, {
      onRemoteStream: (userId, stream) => {
        setRemoteStreams((prev) => ({ ...prev, [userId]: new MediaStream(stream.getTracks()) }));
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
      else setMicOn(next);
      const capture = captureStreamRef.current;
      const hasTrack = Boolean(
        (capture || meshRef.current?.stream || localStream)?.getTracks().some((track) => track.kind === kind),
      );
      if (next && !hasTrack) {
        void enableMedia();
        return;
      }
      meshRef.current?.setTrackEnabled(kind, next);
      capture?.getTracks().forEach((track) => {
        if (track.kind === kind) track.enabled = next;
      });
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
      void (async () => {
        const outgoing = await gateRef.current?.ensureOutgoing();
        if (!outgoing || !meshRef.current) return;
        await meshRef.current.replaceTrack('audio', outgoing, { stopPrevious: false });
      })();
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
        onFlip={(instanceId, faces) =>
          send({ type: 'flip', userId: currentUser.uid, instanceId, backImageUrl: faces?.backImageUrl, backName: faces?.backName })
        }
      />
    );
  };

  return (
    <div className="h-dvh flex flex-col bg-[#07141c] text-white overflow-hidden">
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
        <p className="hidden lg:block text-[11px] text-white/45 max-w-xl truncate">
          Clic main → poser · Clic champ → engager · Clic droit → déplacer · D piocher · / bibliothèque · +/− PV
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <RtcControls
            camOn={camOn}
            micOn={micOn}
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
