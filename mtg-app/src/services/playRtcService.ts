import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import { isRealtimeUnavailable, swallowRealtimeError } from '../utils/playRealtime';
import { aggregateRtcLinkStatus, type RtcLinkStatus } from '../utils/rtcLinkStatus';
import type { RtcSignalPayload } from '../types/play';

export type { RtcLinkStatus };

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return '';
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function getIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      console.warn('VITE_ICE_SERVERS is not valid JSON; falling back to public STUN.');
    }
  }
  return DEFAULT_ICE_SERVERS;
}

async function sendSignal(input: {
  lobbyId: string;
  fromUserId: string;
  toUserId: string;
  payload: RtcSignalPayload;
}): Promise<void> {
  try {
    await pb.collection('play_rtc_signals').create({
      lobbyId: input.lobbyId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      payload: input.payload,
    });
  } catch (err) {
    console.warn('RTC signal send failed', err);
  }
}

export interface PlayRtcHandlers {
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onRemoteStreamEnded?: (userId: string) => void;
  onLinkStatus?: (status: RtcLinkStatus) => void;
}

export interface PlayMediaChoice {
  cameraId?: string;
  micId?: string;
  noiseGate?: number;
}

export const PLAY_AV_DEVICES_KEY = 'mtg-play-av-devices';
export const DEFAULT_NOISE_GATE = 45;

function parseNoiseGate(value: unknown): number | undefined {
  const next = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(next)) return undefined;
  return Math.min(100, Math.max(0, Math.round(next)));
}

export function loadPlayAvDevices(): PlayMediaChoice {
  try {
    const raw = localStorage.getItem(PLAY_AV_DEVICES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PlayMediaChoice;
    return {
      cameraId: typeof parsed.cameraId === 'string' && parsed.cameraId ? parsed.cameraId : undefined,
      micId: typeof parsed.micId === 'string' && parsed.micId ? parsed.micId : undefined,
      noiseGate: parseNoiseGate(parsed.noiseGate),
    };
  } catch {
    return {};
  }
}

export function savePlayAvDevices(choice: PlayMediaChoice): void {
  localStorage.setItem(PLAY_AV_DEVICES_KEY, JSON.stringify(choice));
}

function videoConstraints(cameraId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  if (cameraId) constraints.deviceId = { ideal: cameraId };
  return constraints;
}

function audioConstraints(micId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (micId) constraints.deviceId = { ideal: micId };
  return constraints;
}

export async function listPlayMediaDevices(): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { cameras: [], mics: [] };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    mics: devices.filter((d) => d.kind === 'audioinput'),
  };
}

export async function getPlayMedia(choice: PlayMediaChoice = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Caméra et micro non disponibles dans ce navigateur.');
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: audioConstraints(choice.micId), video: videoConstraints(choice.cameraId) },
    { audio: true, video: true },
    { audio: audioConstraints(choice.micId), video: false },
    { audio: false, video: videoConstraints(choice.cameraId) },
    { audio: true, video: false },
    { audio: false, video: true },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(hintOutgoingTrack);
      return stream;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Impossible d’accéder à la caméra ou au micro.');
}

export async function getDeviceTrack(
  kind: 'audio' | 'video',
  deviceId?: string,
): Promise<MediaStreamTrack> {
  const constraints: MediaStreamConstraints =
    kind === 'video'
      ? { audio: false, video: videoConstraints(deviceId) }
      : { video: false, audio: audioConstraints(deviceId) };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(kind === 'video' ? 'Aucune caméra disponible.' : 'Aucun micro disponible.');
  }
  hintOutgoingTrack(track);
  return track;
}

function senderForKind(pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | undefined {
  const withTrack = pc.getSenders().find((sender) => sender.track?.kind === kind);
  if (withTrack) return withTrack;
  const transceiver = pc.getTransceivers().find((item) => {
    return item.sender.track?.kind === kind || item.receiver.track.kind === kind;
  });
  return transceiver?.sender;
}

function hintOutgoingTrack(track: MediaStreamTrack): void {
  if (track.kind === 'audio') {
    try {
      track.contentHint = 'speech';
    } catch {
      /* Safari */
    }
  }
}

const SIGNAL_POLL_CONNECTING_MS = 300;
const SIGNAL_POLL_CONNECTED_MS = 1500;
const ICE_DISCONNECT_RESTART_MS = 2500;

export class PlayRtcMesh {
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private pendingAnswer = new Map<string, RTCSessionDescriptionInit>();
  private remoteStreams = new Map<string, MediaStream>();
  private offererPeers = new Set<string>();
  private makingOffer = new Set<string>();
  private suppressNegotiation = new Set<string>();
  private restarting = new Set<string>();
  private restartTimers = new Map<string, number>();
  private lastRecoverAt = new Map<string, number>();
  private localStream: MediaStream | null = null;
  private unsub: (() => void) | null = null;
  private signalPoll: number | null = null;
  private signalPollMs = SIGNAL_POLL_CONNECTING_MS;
  private seenSignals = new Set<string>();
  private destroyed = false;
  private listening = false;
  private lobbyId: string;
  private myUserId: string;
  private handlers: PlayRtcHandlers;
  private peerIds: string[] = [];

  constructor(lobbyId: string, myUserId: string, handlers: PlayRtcHandlers) {
    this.lobbyId = lobbyId;
    this.myUserId = myUserId;
    this.handlers = handlers;
  }

  get stream(): MediaStream | null {
    return this.localStream;
  }

  async start(peerIds: string[], stream: MediaStream): Promise<void> {
    if (this.destroyed) return;
    stream.getTracks().forEach(hintOutgoingTrack);
    this.localStream = stream;
    this.listenSignals();
    await this.updatePeers(peerIds);
    this.emitLinkStatus();
  }

  async updatePeers(peerIds: string[]): Promise<void> {
    if (this.destroyed) return;
    const others = [...new Set(peerIds.filter((id) => id && id !== this.myUserId))];
    this.peerIds = others;
    for (const existing of [...this.pcs.keys()]) {
      if (!others.includes(existing)) this.dropPeer(existing, true);
    }
    for (const peerId of others) {
      await this.ensurePeer(peerId, this.myUserId < peerId);
    }
    this.emitLinkStatus();
  }

  setTrackEnabled(kind: 'audio' | 'video', enabled: boolean): void {
    this.localStream?.getTracks().forEach((track) => {
      if (track.kind === kind) track.enabled = enabled;
    });
  }

  async replaceTrack(
    kind: 'audio' | 'video',
    track: MediaStreamTrack | null,
    options?: { stopPrevious?: boolean },
  ): Promise<void> {
    if (this.destroyed) return;
    if (!this.localStream) this.localStream = new MediaStream();
    const stopPrevious = options?.stopPrevious !== false;
    this.localStream.getTracks().forEach((existing) => {
      if (existing.kind === kind) {
        this.localStream?.removeTrack(existing);
        if (stopPrevious && existing !== track) existing.stop();
      }
    });
    if (track) {
      hintOutgoingTrack(track);
      this.localStream.addTrack(track);
    }

    for (const pc of this.pcs.values()) {
      const sender = senderForKind(pc, kind);
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch (err) {
          console.warn('replaceTrack failed', err);
        }
      } else if (track) {
        pc.addTrack(track, this.localStream);
      }
    }
  }

  async replaceMedia(stream: MediaStream): Promise<void> {
    if (this.destroyed) return;
    const previous = this.localStream;
    this.localStream = stream;
    for (const kind of ['audio', 'video'] as const) {
      const track = kind === 'audio' ? stream.getAudioTracks()[0] ?? null : stream.getVideoTracks()[0] ?? null;
      for (const pc of this.pcs.values()) {
        const sender = senderForKind(pc, kind);
        if (sender) {
          try {
            await sender.replaceTrack(track);
          } catch (err) {
            console.warn('replaceTrack failed', err);
          }
        } else if (track) {
          pc.addTrack(track, stream);
        }
      }
    }
    previous?.getTracks().forEach((track) => {
      if (!stream.getTracks().includes(track)) track.stop();
    });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.unsub?.();
    this.unsub = null;
    this.clearSignalPoll();
    this.listening = false;
    for (const timer of this.restartTimers.values()) window.clearTimeout(timer);
    this.restartTimers.clear();
    for (const pc of this.pcs.values()) {
      pc.close();
    }
    this.pcs.clear();
    this.pendingIce.clear();
    this.pendingAnswer.clear();
    this.remoteStreams.clear();
    this.offererPeers.clear();
    this.makingOffer.clear();
    this.suppressNegotiation.clear();
    this.restarting.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try {
      await pb.collection('play_rtc_signals').unsubscribe('*');
    } catch {
      /* PocketBase 0.22 realtime client id */
    }
  }

  private attachLocalMedia(pc: RTCPeerConnection): void {
    const stream = this.localStream;
    for (const kind of ['audio', 'video'] as const) {
      const track = stream?.getTracks().find((t) => t.kind === kind) ?? null;
      if (track && stream) {
        hintOutgoingTrack(track);
        pc.addTrack(track, stream);
      } else {
        pc.addTransceiver(kind, { direction: 'sendrecv' });
      }
    }
  }

  private peerConfig(): RTCConfiguration {
    return {
      iceServers: getIceServers(),
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };
  }

  private async ensurePeer(peerId: string, makeOffer: boolean): Promise<RTCPeerConnection> {
    const existing = this.pcs.get(peerId);
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
      return existing;
    }
    if (existing) this.dropPeer(peerId, false);

    const pc = new RTCPeerConnection(this.peerConfig());
    this.pcs.set(peerId, pc);
    if (makeOffer) this.offererPeers.add(peerId);
    this.suppressNegotiation.add(peerId);
    this.attachLocalMedia(pc);

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.destroyed) return;
      void sendSignal({
        lobbyId: this.lobbyId,
        fromUserId: this.myUserId,
        toUserId: peerId,
        payload: { type: 'ice', candidate: event.candidate.toJSON() },
      });
    };

    pc.ontrack = (event) => {
      let stream = event.streams[0] || this.remoteStreams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
      }
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      this.remoteStreams.set(peerId, stream);
      this.handlers.onRemoteStream(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      this.onPeerState(peerId);
    };
    pc.oniceconnectionstatechange = () => {
      this.onPeerState(peerId);
    };

    pc.onnegotiationneeded = () => {
      if (this.suppressNegotiation.has(peerId)) return;
      void this.renegotiate(peerId);
    };

    if (makeOffer) {
      await this.createAndSendOffer(peerId, false);
    }
    this.suppressNegotiation.delete(peerId);
    this.emitLinkStatus();
    return pc;
  }

  private onPeerState(peerId: string): void {
    const pc = this.pcs.get(peerId);
    if (!pc || this.destroyed) return;
    this.emitLinkStatus();
    const conn = pc.connectionState;
    const ice = pc.iceConnectionState;
    if (conn === 'connected' || ice === 'connected' || ice === 'completed') {
      this.clearRestartTimer(peerId);
      return;
    }
    if (conn === 'closed') {
      this.handlers.onRemoteStreamEnded?.(peerId);
      return;
    }
    if (conn === 'failed' || ice === 'failed') {
      void this.recoverPeer(peerId);
      return;
    }
    if (conn === 'disconnected' || ice === 'disconnected') {
      this.scheduleRestart(peerId);
    }
  }

  private scheduleRestart(peerId: string): void {
    if (this.restartTimers.has(peerId) || this.restarting.has(peerId)) return;
    const timer = window.setTimeout(() => {
      this.restartTimers.delete(peerId);
      const pc = this.pcs.get(peerId);
      if (!pc || this.destroyed) return;
      if (pc.connectionState === 'connected') return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
      void this.recoverPeer(peerId);
    }, ICE_DISCONNECT_RESTART_MS);
    this.restartTimers.set(peerId, timer);
  }

  private clearRestartTimer(peerId: string): void {
    const timer = this.restartTimers.get(peerId);
    if (timer != null) window.clearTimeout(timer);
    this.restartTimers.delete(peerId);
  }

  private async recoverPeer(peerId: string): Promise<void> {
    if (this.destroyed || this.restarting.has(peerId)) return;
    const now = Date.now();
    if (now - (this.lastRecoverAt.get(peerId) || 0) < 3000) return;
    this.lastRecoverAt.set(peerId, now);
    this.restarting.add(peerId);
    try {
      const pc = this.pcs.get(peerId);
      if (pc && this.offererPeers.has(peerId) && pc.signalingState !== 'closed') {
        try {
          await this.createAndSendOffer(peerId, true);
          return;
        } catch (err) {
          console.warn('ICE restart failed', err);
        }
      }
      this.dropPeer(peerId, true);
      await this.ensurePeer(peerId, this.myUserId < peerId);
    } finally {
      this.restarting.delete(peerId);
      this.emitLinkStatus();
    }
  }

  private dropPeer(peerId: string, notify: boolean): void {
    this.clearRestartTimer(peerId);
    const pc = this.pcs.get(peerId);
    this.pcs.delete(peerId);
    this.offererPeers.delete(peerId);
    this.makingOffer.delete(peerId);
    this.suppressNegotiation.delete(peerId);
    this.pendingIce.delete(peerId);
    this.pendingAnswer.delete(peerId);
    this.remoteStreams.delete(peerId);
    if (pc && pc.signalingState !== 'closed') {
      try {
        pc.close();
      } catch {
        /* already closed */
      }
    }
    if (notify) this.handlers.onRemoteStreamEnded?.(peerId);
  }

  private async createAndSendOffer(peerId: string, iceRestart: boolean): Promise<void> {
    const pc = this.pcs.get(peerId);
    if (!pc || this.destroyed) return;
    this.makingOffer.add(peerId);
    try {
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (this.destroyed || pc.signalingState === 'closed') return;
      await pc.setLocalDescription(offer);
      await sendSignal({
        lobbyId: this.lobbyId,
        fromUserId: this.myUserId,
        toUserId: peerId,
        payload: { type: 'offer', sdp: pc.localDescription ?? offer },
      });
      await this.applyPendingAnswer(peerId);
    } finally {
      this.makingOffer.delete(peerId);
    }
  }

  private async applyPendingAnswer(peerId: string): Promise<void> {
    const sdp = this.pendingAnswer.get(peerId);
    const pc = this.pcs.get(peerId);
    if (!sdp || !pc || pc.signalingState !== 'have-local-offer') return;
    this.pendingAnswer.delete(peerId);
    await pc.setRemoteDescription(sdp);
    await this.flushIce(peerId, pc);
  }

  private async renegotiate(peerId: string): Promise<void> {
    const pc = this.pcs.get(peerId);
    if (!pc || this.destroyed || !this.offererPeers.has(peerId)) return;
    if (pc.signalingState !== 'stable') return;
    try {
      await this.createAndSendOffer(peerId, false);
    } catch (err) {
      console.warn('RTC renegotiation failed', err);
    }
  }

  private emitLinkStatus(): void {
    const status = aggregateRtcLinkStatus(
      this.peerIds.map((id) => this.pcs.get(id)?.connectionState),
    );
    this.handlers.onLinkStatus?.(status);
    this.syncSignalPoll(status);
  }

  private syncSignalPoll(status: RtcLinkStatus): void {
    const next = status === 'connected' ? SIGNAL_POLL_CONNECTED_MS : SIGNAL_POLL_CONNECTING_MS;
    if (!this.listening || this.signalPollMs === next) return;
    this.signalPollMs = next;
    if (this.signalPoll == null) return;
    window.clearInterval(this.signalPoll);
    this.signalPoll = window.setInterval(() => {
      if (!this.destroyed) void this.drainExistingSignals();
    }, next);
  }

  private clearSignalPoll(): void {
    if (this.signalPoll != null) {
      window.clearInterval(this.signalPoll);
      this.signalPoll = null;
    }
  }

  private async flushIce(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingIce.get(peerId) || [];
    this.pendingIce.delete(peerId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('ICE candidate failed', err);
      }
    }
  }

  private listenSignals(): void {
    if (this.listening) return;
    this.listening = true;
    let cancelled = false;
    let stopSubscribe: (() => void) | undefined;
    if (!isRealtimeUnavailable()) {
      pb.collection('play_rtc_signals')
        .subscribe('*', (e) => {
          if (cancelled || e.action !== 'create') return;
          const rec = e.record as { id: string; [key: string]: unknown };
          if (relationId(rec.lobbyId) !== this.lobbyId) return;
          if (relationId(rec.toUserId) !== this.myUserId) return;
          void this.handleSignal(rec);
        })
        .then((unsub) => {
          if (cancelled) unsub();
          else stopSubscribe = unsub;
        })
        .catch(swallowRealtimeError);
    }

    this.signalPollMs = SIGNAL_POLL_CONNECTING_MS;
    this.signalPoll = window.setInterval(() => {
      if (!cancelled && !this.destroyed) void this.drainExistingSignals();
    }, this.signalPollMs);

    this.unsub = () => {
      cancelled = true;
      stopSubscribe?.();
      this.clearSignalPoll();
    };

    void this.drainExistingSignals();
  }

  private async drainExistingSignals(): Promise<void> {
    try {
      const records = await pb.collection('play_rtc_signals').getFullList({
        filter: `${pbEqual('lobbyId', this.lobbyId)} && ${pbEqual('toUserId', this.myUserId)}`,
        sort: 'created',
      });
      for (const rec of records) {
        await this.handleSignal(rec as { id: string; [key: string]: unknown });
      }
    } catch (err) {
      console.warn('Could not drain RTC signals', err);
    }
  }

  private async handleSignal(rec: { id: string; [key: string]: unknown }): Promise<void> {
    if (!rec.id || this.seenSignals.has(rec.id)) return;
    this.seenSignals.add(rec.id);
    const fromUserId = relationId(rec.fromUserId);
    const payload = rec.payload as RtcSignalPayload | undefined;
    if (!fromUserId || !payload?.type || this.destroyed) {
      await this.forgetSignal(rec.id);
      return;
    }

    try {
      const pc = await this.ensurePeer(fromUserId, false);
      if (payload.type === 'offer' && payload.sdp) {
        const polite = this.myUserId > fromUserId;
        const collision = this.makingOffer.has(fromUserId) || pc.signalingState !== 'stable';
        if (collision) {
          if (!polite) return;
          try {
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
          } catch {
            this.dropPeer(fromUserId, false);
            await this.ensurePeer(fromUserId, false);
          }
        }
        const live = this.pcs.get(fromUserId);
        if (!live) return;
        await live.setRemoteDescription(payload.sdp);
        await this.flushIce(fromUserId, live);
        const answer = await live.createAnswer();
        if (this.destroyed) return;
        await live.setLocalDescription(answer);
        await sendSignal({
          lobbyId: this.lobbyId,
          fromUserId: this.myUserId,
          toUserId: fromUserId,
          payload: { type: 'answer', sdp: live.localDescription ?? answer },
        });
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.signalingState !== 'have-local-offer') {
          this.pendingAnswer.set(fromUserId, payload.sdp);
          return;
        }
        await pc.setRemoteDescription(payload.sdp);
        await this.flushIce(fromUserId, pc);
      } else if (payload.type === 'ice' && payload.candidate) {
        if (!pc.remoteDescription) {
          const queued = this.pendingIce.get(fromUserId) || [];
          queued.push(payload.candidate);
          this.pendingIce.set(fromUserId, queued);
        } else {
          await pc.addIceCandidate(payload.candidate);
        }
      }
    } catch (err) {
      console.warn('RTC signal handling failed', err);
    } finally {
      await this.forgetSignal(rec.id);
    }
  }

  private async forgetSignal(id: string): Promise<void> {
    try {
      await pb.collection('play_rtc_signals').delete(id);
    } catch {
      /* already gone */
    }
  }
}
