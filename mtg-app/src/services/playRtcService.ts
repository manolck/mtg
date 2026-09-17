import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import type { RtcSignalPayload } from '../types/play';

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return '';
}

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
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

async function sendSignal(input: {
  lobbyId: string;
  fromUserId: string;
  toUserId: string;
  payload: RtcSignalPayload;
}): Promise<void> {
  await pb.collection('play_rtc_signals').create({
    lobbyId: input.lobbyId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    payload: input.payload,
  });
}

export interface PlayRtcHandlers {
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onRemoteStreamEnded?: (userId: string) => void;
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
      return await navigator.mediaDevices.getUserMedia(constraints);
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
  return track;
}

export class PlayRtcMesh {
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private remoteStreams = new Map<string, MediaStream>();
  private localStream: MediaStream | null = null;
  private unsub: (() => void) | null = null;
  private destroyed = false;
  private listening = false;
  private lobbyId: string;
  private myUserId: string;
  private handlers: PlayRtcHandlers;

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
    this.localStream = stream;
    this.listenSignals();
    await this.updatePeers(peerIds);
  }

  async updatePeers(peerIds: string[]): Promise<void> {
    if (this.destroyed) return;
    const others = [...new Set(peerIds.filter((id) => id && id !== this.myUserId))];
    for (const peerId of others) {
      await this.ensurePeer(peerId, this.myUserId < peerId);
    }
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
    if (track) this.localStream.addTrack(track);

    for (const pc of this.pcs.values()) {
      const sender =
        pc.getSenders().find((s) => s.track?.kind === kind) ||
        pc.getTransceivers().find((tr) => tr.receiver.track.kind === kind)?.sender;
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
        const sender =
          pc.getSenders().find((s) => s.track?.kind === kind) ||
          pc.getTransceivers().find((tr) => tr.receiver.track.kind === kind)?.sender;
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
    this.listening = false;
    for (const pc of this.pcs.values()) {
      pc.close();
    }
    this.pcs.clear();
    this.pendingIce.clear();
    this.remoteStreams.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try {
      await pb.collection('play_rtc_signals').unsubscribe('*');
    } catch {
      /* ignore */
    }
  }

  private attachLocalMedia(pc: RTCPeerConnection): void {
    const stream = this.localStream;
    for (const kind of ['audio', 'video'] as const) {
      const track = stream?.getTracks().find((t) => t.kind === kind) ?? null;
      if (track && stream) {
        pc.addTrack(track, stream);
      } else {
        pc.addTransceiver(kind, { direction: 'sendrecv' });
      }
    }
  }

  private async ensurePeer(peerId: string, makeOffer: boolean): Promise<RTCPeerConnection> {
    const existing = this.pcs.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.pcs.set(peerId, pc);
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlers.onRemoteStreamEnded?.(peerId);
      }
    };

    if (makeOffer) {
      const offer = await pc.createOffer();
      if (this.destroyed) return pc;
      await pc.setLocalDescription(offer);
      await sendSignal({
        lobbyId: this.lobbyId,
        fromUserId: this.myUserId,
        toUserId: peerId,
        payload: { type: 'offer', sdp: offer },
      });
    }

    return pc;
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
        else this.unsub = unsub;
      })
      .catch((err) => console.warn('play_rtc_signals subscribe failed', err));

    this.unsub = () => {
      cancelled = true;
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
    const fromUserId = relationId(rec.fromUserId);
    const payload = rec.payload as RtcSignalPayload | undefined;
    if (!fromUserId || !payload?.type || this.destroyed) return;

    try {
      const pc = await this.ensurePeer(fromUserId, false);
      if (payload.type === 'offer' && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        await this.flushIce(fromUserId, pc);
        const answer = await pc.createAnswer();
        if (this.destroyed) return;
        await pc.setLocalDescription(answer);
        await sendSignal({
          lobbyId: this.lobbyId,
          fromUserId: this.myUserId,
          toUserId: fromUserId,
          payload: { type: 'answer', sdp: answer },
        });
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.signalingState !== 'have-local-offer') return;
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
      try {
        await pb.collection('play_rtc_signals').delete(rec.id);
      } catch {
        /* already gone */
      }
    }
  }
}
