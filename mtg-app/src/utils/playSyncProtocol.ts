import type { PlayAction } from '../types/play';

/** Keep in sync with `server/play-sync/src/protocol.ts`. */

export type PlaySyncClientMessage =
  | { type: 'join'; matchId: string; token: string; syncFrom?: number }
  | { type: 'action'; actionId: string; action: PlayAction }
  | { type: 'rtc'; toUserId: string; payload: unknown }
  | { type: 'ping' };

export type PlaySyncServerMessage =
  | { type: 'joined'; matchId: string; lastSeq: number }
  | {
      type: 'action';
      seq: number;
      actionId: string;
      userId: string;
      action: PlayAction;
      created: string;
    }
  | { type: 'action_ack'; actionId: string; seq: number }
  | { type: 'reload'; reason: string }
  | { type: 'rtc'; fromUserId: string; toUserId: string; payload: unknown; signalId: string }
  | { type: 'error'; code: string; message: string; actionId?: string }
  | { type: 'pong' };

export interface SyncedPlayAction {
  seq: number;
  actionId: string;
  userId: string;
  action: PlayAction;
  created: string;
}

/** Pure helper — empty URL means PocketBase HTTP/poll fallback. */
export function resolvePlaySyncWsUrl(raw: string | undefined | null): string {
  return (raw ?? '').trim();
}
