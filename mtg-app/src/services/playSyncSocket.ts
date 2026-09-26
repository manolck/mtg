import { pb } from './pocketbase';
import {
  resolvePlaySyncWsUrl,
  type PlaySyncClientMessage,
  type PlaySyncServerMessage,
  type SyncedPlayAction,
} from '../utils/playSyncProtocol';
import type { PlayAction, RtcSignalPayload } from '../types/play';

export function getPlaySyncWsUrl(): string {
  return resolvePlaySyncWsUrl(import.meta.env.VITE_PLAY_WS_URL);
}

export function isPlaySyncSocketConfigured(): boolean {
  return Boolean(getPlaySyncWsUrl());
}

const RECONNECT_MS = 1200;
const PING_MS = 20000;
const MAX_QUEUED_ACTIONS = 32;

export type PlaySyncStatus = 'idle' | 'connecting' | 'joined' | 'closed';

export interface PlaySyncHandlers {
  onJoined?: (lastSeq: number) => void;
  onAction?: (entry: SyncedPlayAction) => void;
  onActionAck?: (actionId: string, seq: number) => void;
  onReload?: (reason: string) => void;
  onRtc?: (fromUserId: string, payload: RtcSignalPayload, signalId: string) => void;
  onError?: (code: string, message: string, actionId?: string) => void;
  onStatus?: (status: PlaySyncStatus) => void;
}

interface QueuedAction {
  actionId: string;
  action: PlayAction;
}

interface QueuedRtc {
  toUserId: string;
  payload: RtcSignalPayload;
}

/**
 * Live match sync over WebSocket. No-op constructor when VITE_PLAY_WS_URL is unset —
 * callers should keep the PocketBase HTTP/poll path in that case.
 */
export class PlaySyncSocket {
  private ws: WebSocket | null = null;
  private matchId: string | null = null;
  private lastSeq = 0;
  private status: PlaySyncStatus = 'idle';
  private destroyed = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private queue: QueuedAction[] = [];
  private rtcQueue: QueuedRtc[] = [];
  private handlers: PlaySyncHandlers;
  private joined = false;

  constructor(handlers: PlaySyncHandlers = {}) {
    this.handlers = handlers;
  }

  get configured(): boolean {
    return isPlaySyncSocketConfigured();
  }

  get isJoined(): boolean {
    return this.joined && this.status === 'joined';
  }

  get currentLastSeq(): number {
    return this.lastSeq;
  }

  connect(matchId: string, syncFrom = 0): void {
    if (!this.configured || this.destroyed) return;
    this.matchId = matchId;
    this.lastSeq = Math.max(0, syncFrom);
    this.open();
  }

  setLastSeq(seq: number): void {
    this.lastSeq = Math.max(this.lastSeq, Math.max(0, Math.floor(seq)));
  }

  sendAction(actionId: string, action: PlayAction): boolean {
    if (!this.configured || this.destroyed) return false;
    const payload: PlaySyncClientMessage = { type: 'action', actionId, action };
    if (this.ws?.readyState === WebSocket.OPEN && this.joined) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    if (this.queue.length >= MAX_QUEUED_ACTIONS) {
      this.queue.shift();
    }
    this.queue.push({ actionId, action });
    return true;
  }

  sendRtc(toUserId: string, payload: RtcSignalPayload): void {
    if (!this.configured || this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN && this.joined) {
      const message: PlaySyncClientMessage = { type: 'rtc', toUserId, payload };
      this.ws.send(JSON.stringify(message));
      return;
    }
    if (this.rtcQueue.length >= MAX_QUEUED_ACTIONS) this.rtcQueue.shift();
    this.rtcQueue.push({ toUserId, payload });
  }

  destroy(): void {
    this.destroyed = true;
    this.joined = false;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus('closed');
  }

  private setStatus(status: PlaySyncStatus): void {
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  private clearTimers(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer != null || !this.matchId) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, RECONNECT_MS);
  }

  private open(): void {
    if (this.destroyed || !this.matchId) return;
    const url = getPlaySyncWsUrl();
    if (!url) return;

    this.joined = false;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }

    this.setStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.destroyed || this.ws !== ws) return;
      const token = pb.authStore.token;
      if (!token) {
        this.handlers.onError?.('no_token', 'Not authenticated');
        ws.close();
        return;
      }
      const join: PlaySyncClientMessage = {
        type: 'join',
        matchId: this.matchId!,
        token,
        syncFrom: this.lastSeq,
      };
      ws.send(JSON.stringify(join));
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' } satisfies PlaySyncClientMessage));
        }
      }, PING_MS);
    };

    ws.onmessage = (event) => {
      if (this.destroyed || this.ws !== ws) return;
      let msg: PlaySyncServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as PlaySyncServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.joined = false;
      this.ws = null;
      this.clearTimers();
      if (!this.destroyed) {
        this.setStatus('connecting');
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      /* onclose will reconnect */
    };
  }

  private handleServerMessage(msg: PlaySyncServerMessage): void {
    switch (msg.type) {
      case 'joined':
        this.joined = true;
        this.lastSeq = Math.max(this.lastSeq, msg.lastSeq);
        this.setStatus('joined');
        this.handlers.onJoined?.(msg.lastSeq);
        this.flushQueue();
        break;
      case 'action':
        this.handlers.onAction?.({
          seq: msg.seq,
          actionId: msg.actionId,
          userId: msg.userId,
          action: msg.action,
          created: msg.created,
        });
        break;
      case 'action_ack':
        this.handlers.onActionAck?.(msg.actionId, msg.seq);
        break;
      case 'reload':
        this.handlers.onReload?.(msg.reason);
        break;
      case 'rtc':
        this.handlers.onRtc?.(msg.fromUserId, msg.payload as RtcSignalPayload, msg.signalId);
        break;
      case 'error':
        this.handlers.onError?.(msg.code, msg.message, msg.actionId);
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.joined) return;
    const pending = this.queue.splice(0, this.queue.length);
    for (const item of pending) {
      this.ws.send(
        JSON.stringify({
          type: 'action',
          actionId: item.actionId,
          action: item.action,
        } satisfies PlaySyncClientMessage),
      );
    }
    const rtcPending = this.rtcQueue.splice(0, this.rtcQueue.length);
    for (const item of rtcPending) {
      this.ws.send(
        JSON.stringify({
          type: 'rtc',
          toUserId: item.toUserId,
          payload: item.payload,
        } satisfies PlaySyncClientMessage),
      );
    }
  }
}
