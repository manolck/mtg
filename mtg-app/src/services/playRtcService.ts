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

export class PlayRtcMesh {
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private localStream: MediaStream | null = null;
  private unsub: (() => void) | null = null;
  private destroyed = false;
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
    this.localStream = stream;
    const others = peerIds.filter((id) => id && id !== this.myUserId);
    for (const peerId of others) {
      await this.ensurePeer(peerId, this.myUserId < peerId);
    }
    this.listenSignals();
  }

  setTrackEnabled(kind: 'audio' | 'video', enabled: boolean): void {
    this.localStream?.getTracks().forEach((track) => {
      if (track.kind === kind) track.enabled = enabled;
    });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.unsub?.();
    this.unsub = null;
    for (const pc of this.pcs.values()) {
      pc.close();
    }
    this.pcs.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try {
      await pb.collection('play_rtc_signals').unsubscribe('*');
    } catch {
      /* ignore */
    }
  }

  private async ensurePeer(peerId: string, makeOffer: boolean): Promise<RTCPeerConnection> {
    const existing = this.pcs.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.pcs.set(peerId, pc);

    this.localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream as MediaStream);
    });

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
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.handlers.onRemoteStream(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        this.handlers.onRemoteStreamEnded?.(peerId);
      }
    };

    if (makeOffer) {
      const offer = await pc.createOffer();
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
    if (!fromUserId || !payload?.type) return;

    try {
      const pc = await this.ensurePeer(fromUserId, false);
      if (payload.type === 'offer' && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        await this.flushIce(fromUserId, pc);
        const answer = await pc.createAnswer();
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

export async function getDisplayMedia(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
  });
}
