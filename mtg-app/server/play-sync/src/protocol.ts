/** Wire protocol shared conceptually with the Vite client (`src/utils/playSyncProtocol.ts`). */

export type ClientMessage =
  | { type: 'join'; matchId: string; token: string; syncFrom?: number }
  | { type: 'action'; actionId: string; action: unknown }
  | { type: 'rtc'; toUserId: string; payload: unknown }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'joined'; matchId: string; lastSeq: number }
  | {
      type: 'action';
      seq: number;
      actionId: string;
      userId: string;
      action: unknown;
      created: string;
    }
  | { type: 'action_ack'; actionId: string; seq: number }
  | { type: 'reload'; reason: string }
  | { type: 'rtc'; fromUserId: string; toUserId: string; payload: unknown; signalId: string }
  | { type: 'error'; code: string; message: string; actionId?: string }
  | { type: 'pong' };

export const RECENT_ACTION_LIMIT = 500;
