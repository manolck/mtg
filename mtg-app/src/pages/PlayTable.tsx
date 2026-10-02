import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { errorHandler } from '../services/errorHandler';
import * as playLobbyService from '../services/playLobbyService';
import {
  actionFrom,
  applyPlayAction,
  compactMatchSnapshot,
  listMatchActions,
  loadMatchWithActions,
  newMatchActionId,
  subscribeMatchActions,
} from '../services/playMatchService';
import { isPlaySyncSocketConfigured, PlaySyncSocket } from '../services/playSyncSocket';
import {
  getPlayMic,
  isTurnConfigured,
  listPlayMics,
  loadPlayAvDevices,
  PlayRtcMesh,
  savePlayAvDevices,
} from '../services/playRtcService';
import type { MatchActionRecord, MatchState, PlayAction, PlayLobby, PlaySeat, ZoneName } from '../types/play';
import { applyMatchAction, isDummyUserId, matchWinner, rebuildMatchPlayers, startingLifeFor } from '../utils/playTable';
import { createSeqActionBuffer } from '../utils/playSyncSeqBuffer';
import type { SyncedPlayAction } from '../utils/playSyncProtocol';
import { PlayerBoard } from '../components/Play/PlayerBoard';
import { PlayTableChat } from '../components/Play/PlayTableChat';
import { RtcControls } from '../components/Play/RtcControls';
import { PlayAvConsent, PLAY_AV_CONSENT_KEY } from '../components/Play/PlayAvConsent';
import { PlayMatchEndMenu } from '../components/Play/PlayMatchEndMenu';
import { RemoteAudioHub } from '../components/Play/RemoteAudio';
import { unlockRemoteAudio } from '../utils/unlockRemoteAudio';
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
  const [micOn, setMicOn] = useState(true);
  const [micId, setMicId] = useState(() => loadPlayAvDevices().micId ?? '');
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [rtcLink, setRtcLink] = useState<RtcLinkStatus>('idle');
  const [hearBlocked, setHearBlocked] = useState(false);
  const [attachPickId, setAttachPickId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<'all' | 'active' | 'alive'>('all');
  const [firstPlayerNotice, setFirstPlayerNotice] = useState<string | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  const attachPickIdRef = useRef<string | null>(null);
  const attachOwnerRef = useRef<string | null>(null);
  attachPickIdRef.current = attachPickId;
  const meshRef = useRef<PlayRtcMesh | null>(null);
  const syncSocketRef = useRef<PlaySyncSocket | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const appliedIdsRef = useRef<Set<string>>(new Set());
  const startGenRef = useRef(0);
  const micOnRef = useRef(micOn);
  const micIdRef = useRef(micId);
  const useSocketSync = isPlaySyncSocketConfigured();
  stateRef.current = state;
  micOnRef.current = micOn;
  micIdRef.current = micId;

  const applyRemoteAction = useCallback((entry: MatchActionRecord | SyncedPlayAction) => {
    if (appliedIdsRef.current.has(entry.actionId)) return;
    const current = stateRef.current;
    if (!current) return;
    appliedIdsRef.current.add(entry.actionId);
    const next = applyMatchAction(current, entry.action);
    if (next.version === current.version) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const seqBufferRef = useRef(
    createSeqActionBuffer({
      onApply: (entry) => {
        applyRemoteAction(entry);
      },
    }),
  );

  const syncActions = useCallback(async (id: string) => {
    const actions = await listMatchActions(id);
    for (const entry of actions) {
      applyRemoteAction(entry);
    }
  }, [applyRemoteAction]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!lobbyId || !currentUser) return;
    try {
      const [nextLobby, nextSeats, loaded] = await Promise.all([
        playLobbyService.getLobby(lobbyId),
        playLobbyService.listSeats(lobbyId),
        loadMatchWithActions(lobbyId),
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
      if (!loaded) {
        return;
      }
      setMatchId(loaded.match.id);
      if (opts?.silent && stateRef.current) {
        if (!useSocketSync) await syncActions(loaded.match.id);
      } else {
        appliedIdsRef.current = loaded.appliedIds;
        stateRef.current = loaded.state;
        setState(loaded.state);
        seqBufferRef.current.reset(loaded.actionCount);
        syncSocketRef.current?.setLastSeq(loaded.actionCount);
      }
    } catch (err) {
      errorHandler.handleAndShowError(err);
      navigate('/play', { replace: true });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [lobbyId, currentUser, navigate, syncActions, useSocketSync]);

  useEffect(() => {
    void load();
    const onChange = () => {
      void load({ silent: true });
    };
    // Lobby/seat status only — action sync is socket or dedicated poll below.
    return watchWithPoll(onChange, () => () => {});
  }, [load]);

  useEffect(() => {
    if (!matchId || useSocketSync) return;
    return watchWithPoll(
      () => {
        void syncActions(matchId);
      },
      () => subscribeMatchActions(matchId, applyRemoteAction),
    );
  }, [matchId, syncActions, applyRemoteAction, useSocketSync]);

  useEffect(() => {
    if (!matchId || !currentUser || !useSocketSync) return;
    const reloadFromPb = () => {
      void load();
    };
    const socket = new PlaySyncSocket({
      onJoined: (lastSeq) => {
        seqBufferRef.current.reset(Math.max(seqBufferRef.current.lastSeq, lastSeq));
        socket.setLastSeq(seqBufferRef.current.lastSeq);
      },
      onAction: (entry) => {
        const result = seqBufferRef.current.push(entry);
        socket.setLastSeq(seqBufferRef.current.lastSeq);
        if (result === 'reload') reloadFromPb();
      },
      onActionAck: (actionId, seq) => {
        const result = seqBufferRef.current.acknowledge(seq, actionId);
        socket.setLastSeq(seqBufferRef.current.lastSeq);
        if (result === 'reload') {
          reloadFromPb();
          return;
        }
        const current = stateRef.current;
        if (!current || !matchId || !currentUser) return;
        void compactMatchSnapshot({
          matchId,
          userId: currentUser.uid,
          state: current,
          actionCount: seq,
        }).then((compacted) => {
          if (!compacted || !stateRef.current) return;
          if ((stateRef.current.actionSeq ?? 0) < (compacted.actionSeq ?? 0)) {
            const merged = { ...stateRef.current, actionSeq: compacted.actionSeq };
            stateRef.current = merged;
            setState(merged);
          }
        });
      },
      onReload: () => reloadFromPb(),
      onRtc: (fromUserId, payload, signalId) => {
        meshRef.current?.handleSocketSignal(fromUserId, payload, signalId);
      },
      onError: (code, message, actionId) => {
        if (actionId) appliedIdsRef.current.delete(actionId);
        console.warn('play-sync', code, message);
        if (code === 'join_failed' || code === 'forbidden') {
          errorHandler.handleAndShowError(new Error(message));
        }
      },
    });
    syncSocketRef.current = socket;
    socket.connect(matchId, seqBufferRef.current.lastSeq);
    return () => {
      socket.destroy();
      if (syncSocketRef.current === socket) syncSocketRef.current = null;
    };
  }, [matchId, currentUser, useSocketSync, load]);
  const refreshDevices = useCallback(async () => {
    try {
      setMics(await listPlayMics());
    } catch {
      /* ignore */
    }
  }, []);

  const rememberMic = useCallback((stream: MediaStream) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micOnRef.current;
    });
    const nextMicId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    if (nextMicId) {
      setMicId(nextMicId);
      micIdRef.current = nextMicId;
      savePlayAvDevices({ micId: nextMicId });
    }
    return stream;
  }, []);

  const publishLocalStream = useCallback((stream: MediaStream | null) => {
    captureStreamRef.current = stream;
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
  }, []);

  const startRtc = useCallback(async (withMedia: boolean) => {
    if (!lobbyId || !currentUser || meshRef.current) return;
    const gen = ++startGenRef.current;
    const peerIds = (stateRef.current?.players || seats)
      .map((p) => p.userId)
      .filter((id) => !isDummyUserId(id));
    const mesh = new PlayRtcMesh(
      lobbyId,
      currentUser.uid,
      {
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
      },
      useSocketSync
        ? {
            send: (toUserId, payload) => {
              syncSocketRef.current?.sendRtc(toUserId, payload);
            },
          }
        : null,
    );
    meshRef.current = mesh;
    let stream = new MediaStream();
    if (withMedia) {
      try {
        stream = rememberMic(await getPlayMic(micIdRef.current || undefined));
        setMediaError(null);
        void refreshDevices();
      } catch (err) {
        setMediaError(err instanceof Error ? err.message : 'Impossible d’accéder au micro.');
        stream = new MediaStream();
      }
    }
    if (gen !== startGenRef.current || meshRef.current !== mesh) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    publishLocalStream(stream);
    try {
      await mesh.start(peerIds, stream);
    } catch (err) {
      console.warn('WebRTC start failed', err);
    }
  }, [lobbyId, currentUser, publishLocalStream, rememberMic, refreshDevices, seats, useSocketSync]);

  const enableMedia = useCallback(async () => {
    try {
      const stream = rememberMic(await getPlayMic(micIdRef.current || undefined));
      if (meshRef.current) {
        await meshRef.current.replaceMedia(stream);
        meshRef.current.setTrackEnabled('audio', true);
      }
      publishLocalStream(stream);
      localStorage.setItem(PLAY_AV_CONSENT_KEY, 'yes');
      setMicOn(true);
      setMediaError(null);
      void refreshDevices();
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Impossible d’accéder au micro.');
    }
  }, [publishLocalStream, rememberMic, refreshDevices]);

  const switchMic = useCallback(
    async (deviceId: string) => {
      const previousId = micIdRef.current;
      setMicId(deviceId);
      micIdRef.current = deviceId;
      savePlayAvDevices({ micId: deviceId || undefined });
      try {
        const stream = await getPlayMic(deviceId || undefined, {
          strictDevice: Boolean(deviceId),
        });
        const capture = rememberMic(stream);
        await meshRef.current?.replaceMedia(capture);
        publishLocalStream(capture);
        setMediaError(null);
        void refreshDevices();
      } catch (err) {
        setMicId(previousId);
        micIdRef.current = previousId;
        savePlayAvDevices({ micId: previousId || undefined });
        setMediaError(err instanceof Error ? err.message : 'Impossible de changer de micro.');
      }
    },
    [publishLocalStream, rememberMic, refreshDevices],
  );

  const getAudioStats = useCallback(
    () =>
      meshRef.current?.getAudioStats() ??
      Promise.resolve({ packetsSent: 0, packetsReceived: 0, packetsLost: 0 }),
    [],
  );

  const toggleMic = useCallback(() => {
    const next = !micOnRef.current;
    setMicOn(next);
    const capture = captureStreamRef.current;
    const hasTrack = Boolean(
      (capture || meshRef.current?.stream || localStream)?.getAudioTracks().some((track) => track.readyState === 'live'),
    );
    if (next && !hasTrack) {
      void enableMedia();
      return;
    }
    if (meshRef.current) {
      meshRef.current.setTrackEnabled('audio', next);
    } else {
      capture?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }
    if (capture) publishLocalStream(capture);
  }, [enableMedia, localStream, publishLocalStream]);

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
    return () => {
      startGenRef.current += 1;
      captureStreamRef.current?.getTracks().forEach((track) => track.stop());
      captureStreamRef.current = null;
      setRtcLink('idle');
      void meshRef.current?.destroy();
      meshRef.current = null;
    };
  }, []);

  const send = useCallback(async (action: PlayAction) => {
    if (!matchId || !currentUser || !stateRef.current) return;
    const actionId = newMatchActionId();
    const normalized = actionFrom(action, currentUser.uid);
    const previous = stateRef.current;
    const next = applyMatchAction(previous, normalized);
    if (next.version === previous.version) return;

    appliedIdsRef.current.add(actionId);
    stateRef.current = next;
    setState(next);

    const socket = syncSocketRef.current;
    if (useSocketSync && socket) {
      const ok = socket.sendAction(actionId, normalized);
      if (!ok) {
        appliedIdsRef.current.delete(actionId);
        void load();
      }
      return next;
    }

    try {
      const result = await applyPlayAction({
        matchId,
        userId: currentUser.uid,
        current: previous,
        action: normalized,
        actionId,
      });
      if (!result.changed) {
        appliedIdsRef.current.delete(actionId);
        stateRef.current = previous;
        setState(previous);
        return;
      }
      void compactMatchSnapshot({
        matchId,
        userId: currentUser.uid,
        state: next,
        actionCount: appliedIdsRef.current.size,
      }).then((compacted) => {
        if (!compacted || !stateRef.current) return;
        if ((stateRef.current.actionSeq ?? 0) < (compacted.actionSeq ?? 0)) {
          const merged = { ...stateRef.current, actionSeq: compacted.actionSeq };
          stateRef.current = merged;
          setState(merged);
        }
      });
      return next;
    } catch (err) {
      appliedIdsRef.current.delete(actionId);
      stateRef.current = previous;
      setState(previous);
      errorHandler.handleAndShowError(err);
      void load();
    }
  }, [matchId, currentUser, load, useSocketSync]);

  const rematch = useCallback(async () => {
    const current = stateRef.current;
    if (!current || !currentUser || rematchBusy) return;
    if (!matchWinner(current)) return;
    const players = rebuildMatchPlayers(current, seats);
    if (!players) {
      errorHandler.handleAndShowError(new Error('Impossible de relancer : decks introuvables.'));
      return;
    }
    setRematchBusy(true);
    try {
      const next = await send({
        type: 'restartMatch',
        userId: currentUser.uid,
        players,
        turnSeatIndex: players[0]?.seatIndex ?? 0,
      });
      if (next && matchId) {
        void compactMatchSnapshot({
          matchId,
          userId: currentUser.uid,
          state: next,
          actionCount: appliedIdsRef.current.size,
          force: true,
        });
      }
    } finally {
      setRematchBusy(false);
    }
  }, [currentUser, matchId, rematchBusy, seats, send]);

  const rollFirstPlayer = useCallback(() => {
    const current = stateRef.current;
    if (!current?.players.length) return;
    const real = current.players.filter((player) => !isDummyUserId(player.userId) && !player.eliminated);
    const pool = real.length > 0 ? real : current.players.filter((player) => !player.eliminated);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    void send({ type: 'setTurn', seatIndex: pick.seatIndex });
    const label = pick.displayName || 'Joueur';
    const message = `${label} commence`;
    setFirstPlayerNotice(message);
    window.setTimeout(() => {
      setFirstPlayerNotice((prev) => (prev === message ? null : prev));
    }, 4500);
  }, [send]);

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
    return [...state.players].sort((a, b) => {
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

  const activePlayer = players.find((player) => player.seatIndex === state.turnSeatIndex && !player.eliminated)
    || players.find((player) => !player.eliminated)
    || players[0];
  const filteredPlayers =
    tableView === 'active' && activePlayer
      ? [activePlayer]
      : tableView === 'alive'
        ? players.filter((player) => !player.eliminated)
        : players;
  const shownPlayers = filteredPlayers.length > 0 ? filteredPlayers : players;
  const shownCount = shownPlayers.length;
  const stacked = shownCount <= 2;
  const winner = matchWinner(state);

  const renderPane = (player: (typeof players)[number], compact: boolean) => {
    const isSelf = player.userId === currentUser.uid;
    const boardUserId = player.userId;
    const homeLayout = isSelf || tableView === 'active';
    return (
      <PlayerBoard
        player={player}
        isSelf={isSelf}
        viewerId={currentUser.uid}
        opponents={players
          .filter((p) => p.userId !== currentUser.uid)
          .map((p) => ({ userId: p.userId, displayName: p.displayName }))}
        isTurn={state.turnSeatIndex === player.seatIndex}
        compact={homeLayout ? false : compact}
        seatHome={homeLayout}
        visibleSeats={homeLayout ? 1 : shownCount}
        startingLife={startingLifeFor(state.format, state.players.length)}
        deckName={seats.find((seat) => seat.userId === player.userId)?.deckSnapshot?.name}
        onDraw={() => send({ type: 'draw', userId: boardUserId })}
        onShuffle={() => send({ type: 'shuffleLibrary', userId: boardUserId })}
        onMulligan={() => send({ type: 'mulligan', userId: boardUserId })}
        onPassTurn={() => send({ type: 'passTurn' })}
        onLife={(delta) => send({ type: 'setLife', userId: boardUserId, delta })}
        onPoison={(delta) => send({ type: 'setPoison', userId: boardUserId, delta })}
        onSetPlaymat={(playmatId) => send({ type: 'setPlaymat', userId: boardUserId, playmatId })}
        onSetEliminated={(eliminated) => send({ type: 'setEliminated', userId: boardUserId, eliminated })}
        onMove={(instanceId, from, to, options) =>
          send({
            type: 'moveCard',
            userId: boardUserId,
            instanceId,
            from: from as ZoneName,
            to,
            toTop: options?.toTop,
            libraryPosition: options?.libraryPosition,
            facedown: options?.facedown,
            playmatX: options?.playmatX,
            playmatY: options?.playmatY,
            playmatRow: options?.playmatRow,
          })
        }
        onSearchLibrary={(instanceId, to, options) =>
          send({
            type: 'searchLibrary',
            userId: boardUserId,
            instanceId,
            to,
            toTop: options?.toTop,
            libraryPosition: options?.libraryPosition,
            shuffle: options?.shuffle,
            facedown: options?.facedown,
          })
        }
        onTap={(instanceId, instanceIds) =>
          send({ type: 'tap', userId: boardUserId, instanceId, instanceIds })
        }
        onFlip={(instanceId, faces) =>
          send({
            type: 'flip',
            userId: boardUserId,
            instanceId,
            backImageUrl: faces?.backImageUrl,
            backName: faces?.backName,
            backTypeLine: faces?.backTypeLine,
          })
        }
        onSetPlaymatRow={(instanceId, row) => send({ type: 'setPlaymatRow', userId: boardUserId, instanceId, row })}
        onSetPlaymatPos={(instanceIds, x, y, row) =>
          send({ type: 'setPlaymatPos', userId: boardUserId, instanceIds, x, y, row })
        }
        onShowHand={(viewerIds) => send({ type: 'showHand', userId: boardUserId, viewerIds })}
        onHideHand={() => send({ type: 'hideHand', userId: boardUserId })}
        onShowHandCard={(instanceId, viewerIds) =>
          send({ type: 'showHandCard', userId: boardUserId, instanceId, viewerIds })
        }
        onHideHandCard={(instanceId) => send({ type: 'hideHandCard', userId: boardUserId, instanceId })}
        onRevealLibraryTop={(viewerIds) => send({ type: 'revealLibraryTop', userId: boardUserId, viewerIds })}
        onHideLibraryTop={() => send({ type: 'hideLibraryTop', userId: boardUserId })}
        tablePlayers={players}
        attachPickId={attachPickId}
        onStartAttach={(instanceId) => {
          attachOwnerRef.current = boardUserId;
          setAttachPickId(instanceId);
        }}
        onPickAttachHost={(hostInstanceId) => {
          const instanceId = attachPickIdRef.current;
          if (!instanceId) return;
          void send({
            type: 'attachCard',
            userId: attachOwnerRef.current || boardUserId,
            instanceId,
            hostInstanceId,
          });
          setAttachPickId(null);
          attachOwnerRef.current = null;
        }}
        onDetach={(instanceId) =>
          send({ type: 'attachCard', userId: boardUserId, instanceId, hostInstanceId: null })
        }
        onSetFacedown={(instanceId, facedown) =>
          send({ type: 'setFacedown', userId: boardUserId, instanceId, facedown })
        }
        onSetCounter={(instanceId, counterId, delta) =>
          send({ type: 'setCounter', userId: boardUserId, instanceId, counterId, delta })
        }
        onAddToken={(card, quantity, playmat) =>
          send({
            type: 'addToken',
            userId: boardUserId,
            card,
            quantity,
            playmatX: playmat?.playmatX,
            playmatY: playmat?.playmatY,
            playmatRow: playmat?.playmatRow,
          })
        }
        onRemoveToken={(instanceId) =>
          send({ type: 'removeToken', userId: boardUserId, instanceId })
        }
        onScry={(count, onTop, onBottom) =>
          send({ type: 'scry', userId: boardUserId, count, onTop, onBottom })
        }
        onSurveil={(count, onTop, toGraveyard) =>
          send({ type: 'surveil', userId: boardUserId, count, onTop, toGraveyard })
        }
        onMill={(count) => send({ type: 'mill', userId: boardUserId, count })}
        onReorderHand={(instanceId, toIndex) =>
          send({ type: 'reorderHand', userId: boardUserId, instanceId, toIndex })
        }
        onTransferCard={(instanceId, from, toUserId, to, options) =>
          send({
            type: 'transferCard',
            userId: currentUser.uid,
            fromUserId: boardUserId,
            toUserId,
            instanceId,
            from: from as ZoneName,
            to,
            playmatX: options?.playmatX,
            playmatY: options?.playmatY,
            playmatRow: options?.playmatRow,
          })
        }
        onToggleHandChoice={(instanceId) =>
          send({ type: 'chooseHandCard', userId: currentUser.uid, ownerId: player.userId, instanceId })
        }
        onClearHandChoices={() =>
          send({ type: 'clearHandChoices', userId: currentUser.uid, ownerId: player.userId })
        }
        chatMessages={isSelf ? state.chat : undefined}
        onSendChat={isSelf ? (action) => void send(action) : undefined}
      />
    );
  };

  return (
    <div className="h-dvh relative flex flex-col bg-[#07141c] text-white overflow-hidden">
      <RemoteAudioHub streams={remoteStreams} onBlockedChange={setHearBlocked} />
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
            Tous
          </button>
          <button
            type="button"
            title="Masquer les plateaux des joueurs éliminés"
            className={`px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold ${
              tableView === 'alive' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
            }`}
            onClick={() => setTableView('alive')}
          >
            Vivants
          </button>
          <button
            type="button"
            title={activePlayer?.displayName ? `Plateau de ${activePlayer.displayName}` : 'Joueur dont c’est le tour'}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold ${
              tableView === 'active' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
            }`}
            onClick={() => setTableView('active')}
          >
            Actif
          </button>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            className="relative z-30 text-xs px-2.5 sm:px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 min-h-[36px] font-semibold"
            onClick={rollFirstPlayer}
            title="Désigne au hasard le joueur qui commence"
          >
            1ᵉʳ joueur
          </button>
          <RtcControls
            micOn={micOn}
            linkStatus={rtcLink}
            mics={mics}
            micId={micId}
            previewStream={localStream}
            error={mediaError}
            hearBlocked={hearBlocked}
            hasTurnConfigured={isTurnConfigured()}
            getAudioStats={getAudioStats}
            onToggleMic={toggleMic}
            onMicChange={(id) => void switchMic(id)}
            onUnlockHear={() => {
              unlockRemoteAudio();
              setHearBlocked(false);
            }}
            onEnableMedia={
              localStream?.getAudioTracks().length ? undefined : () => void enableMedia()
            }
          />
          <button
            type="button"
            className="relative z-30 text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 min-h-[36px]"
            onClick={() => {
              captureStreamRef.current?.getTracks().forEach((track) => track.stop());
              captureStreamRef.current = null;
              void meshRef.current?.destroy();
              meshRef.current = null;
              navigate('/play');
            }}
          >
            Quitter
          </button>
        </div>
      </header>

      {firstPlayerNotice && (
        <div className="shrink-0 relative z-30 flex items-center justify-center px-3 py-1.5 bg-amber-400 text-black text-sm font-semibold">
          {firstPlayerNotice}
        </div>
      )}

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
        {stacked ? (
          <div className="h-full min-h-0 flex flex-col gap-1 p-1">
            {shownPlayers.map((player) => {
              const isSelf = player.userId === currentUser.uid;
              const homeLayout = isSelf || tableView === 'active';
              const compact = shownCount > 1 && !homeLayout;
              return (
                <section
                  key={player.userId}
                  className={`${homeLayout ? 'flex-[1.75] min-h-0 basis-0' : 'flex-[1] min-h-0 basis-0'} overflow-hidden`}
                >
                  {renderPane(player, compact)}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="h-full min-h-0 flex flex-col gap-1 p-1">
            <div
              className={`min-h-0 flex-[0.68] grid gap-1 ${
                shownPlayers.filter((p) => p.userId !== currentUser.uid).length >= 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2'
              }`}
            >
              {shownPlayers
                .filter((player) => player.userId !== currentUser.uid)
                .map((player) => (
                  <section key={player.userId} className="min-h-0 overflow-hidden">
                    {renderPane(player, true)}
                  </section>
                ))}
            </div>
            {shownPlayers
              .filter((player) => player.userId === currentUser.uid)
              .map((player) => (
                <section key={player.userId} className="min-h-0 flex-[1.32] overflow-hidden">
                  {renderPane(player, false)}
                </section>
              ))}
          </div>
        )}
        {!shownPlayers.some((player) => player.userId === currentUser.uid) && (
          <div className="absolute bottom-4 left-3 z-40 group/cmd">
            <PlayTableChat
              messages={state.chat || []}
              selfId={currentUser.uid}
              selfName={players.find((item) => item.userId === currentUser.uid)?.displayName}
              players={state.players}
              onSend={(action) => void send(action)}
            />
          </div>
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
      {winner && (
        <PlayMatchEndMenu
          winnerName={winner.displayName || 'Joueur'}
          isWinner={winner.userId === currentUser.uid}
          rematchBusy={rematchBusy}
          onRematch={() => void rematch()}
          onLeave={() => navigate(`/play/${lobbyId}`, { state: { fromTable: true } })}
        />
      )}
    </div>
  );
}
