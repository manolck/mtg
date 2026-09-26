import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  countMatchActions,
  fetchMatch,
  persistMatchAction,
  verifyUserToken,
} from './persist.js';
import type { ClientMessage, ServerMessage } from './protocol.js';
import {
  actionsSince,
  addClient,
  appendAction,
  broadcast,
  getOrCreateRoom,
  getRoom,
  removeClient,
  send,
  type RoomClient,
} from './rooms.js';

const PORT = Number(process.env.PORT || 8091);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function sendJson(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function parseMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as ClientMessage;
    if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function forceUserId(action: unknown, userId: string): unknown {
  if (!action || typeof action !== 'object') return action;
  const type = (action as { type?: unknown }).type;
  if (type === 'passTurn' || type === 'setTurn') return action;
  return { ...(action as object), userId };
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/play-ws/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
    });
    res.end(JSON.stringify({ ok: true, service: 'play-sync' }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/play-ws' });

wss.on('connection', (ws) => {
  let client: RoomClient | null = null;
  let matchId: string | null = null;

  ws.on('message', (data) => {
    void (async () => {
      const msg = parseMessage(String(data));
      if (!msg) {
        sendJson(ws, { type: 'error', code: 'bad_message', message: 'Invalid JSON message' });
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'join') {
        try {
          const auth = await verifyUserToken(msg.token);
          const match = await fetchMatch(msg.matchId, auth.token);
          if (!match.playerIds.includes(auth.id)) {
            sendJson(ws, {
              type: 'error',
              code: 'forbidden',
              message: 'Not a player in this match',
            });
            ws.close(4403, 'forbidden');
            return;
          }
          const actionCount = await countMatchActions(match.id, auth.token);
          const seedSeq = Math.max(match.actionSeq, actionCount);
          const room = getOrCreateRoom(match.id, seedSeq);

          if (client && matchId) {
            const prev = getRoom(matchId);
            if (prev) removeClient(prev, client);
          }

          client = { ws, userId: auth.id, token: auth.token };
          matchId = match.id;
          addClient(room, client);

          send(client, { type: 'joined', matchId: match.id, lastSeq: room.lastSeq });

          const syncFrom =
            typeof msg.syncFrom === 'number' && Number.isFinite(msg.syncFrom)
              ? Math.max(0, Math.floor(msg.syncFrom))
              : room.lastSeq;
          const catchup = actionsSince(room, syncFrom);
          if (catchup === 'reload') {
            send(client, { type: 'reload', reason: 'seq_gap' });
          } else {
            for (const entry of catchup) {
              send(client, {
                type: 'action',
                seq: entry.seq,
                actionId: entry.actionId,
                userId: entry.userId,
                action: entry.action,
                created: entry.created,
              });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'join_failed';
          sendJson(ws, { type: 'error', code: 'join_failed', message });
          ws.close(4401, 'join_failed');
        }
        return;
      }

      if (!client || !matchId) {
        sendJson(ws, { type: 'error', code: 'not_joined', message: 'Send join first' });
        return;
      }

      const room = getRoom(matchId);
      if (!room) {
        send(client, { type: 'error', code: 'no_room', message: 'Room missing; rejoin' });
        return;
      }

      if (msg.type === 'action') {
        if (typeof msg.actionId !== 'string' || !msg.actionId || !msg.action) {
          send(client, {
            type: 'error',
            code: 'bad_action',
            message: 'actionId and action required',
            actionId: typeof msg.actionId === 'string' ? msg.actionId : undefined,
          });
          return;
        }
        const normalized = forceUserId(msg.action, client.userId);
        const existing = room.knownActionIds.has(msg.actionId)
          ? room.recent.find((item) => item.actionId === msg.actionId)
          : null;
        if (existing) {
          send(client, { type: 'action_ack', actionId: existing.actionId, seq: existing.seq });
          return;
        }
        const stored = appendAction(room, {
          actionId: msg.actionId,
          userId: client.userId,
          action: normalized,
        });
        if (!stored) return;
        send(client, { type: 'action_ack', actionId: stored.actionId, seq: stored.seq });
        broadcast(
          room,
          {
            type: 'action',
            seq: stored.seq,
            actionId: stored.actionId,
            userId: stored.userId,
            action: stored.action,
            created: stored.created,
          },
          client,
        );
        void persistMatchAction({
          matchId,
          actionId: stored.actionId,
          userId: stored.userId,
          action: stored.action,
          token: client.token,
        }).catch((err) => {
          console.warn('persistMatchAction failed', err);
        });
        return;
      }

      if (msg.type === 'rtc') {
        if (typeof msg.toUserId !== 'string' || !msg.toUserId || msg.payload == null) {
          send(client, { type: 'error', code: 'bad_rtc', message: 'toUserId and payload required' });
          return;
        }
        const signalId = `rtc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const out: ServerMessage = {
          type: 'rtc',
          fromUserId: client.userId,
          toUserId: msg.toUserId,
          payload: msg.payload,
          signalId,
        };
        for (const peer of room.clients) {
          if (peer.userId === msg.toUserId && peer.ws.readyState === 1) {
            send(peer, out);
          }
        }
        return;
      }
    })().catch((err) => {
      console.warn('message handler error', err);
    });
  });

  ws.on('close', () => {
    if (client && matchId) {
      const room = getRoom(matchId);
      if (room) removeClient(room, client);
    }
  });
});

server.listen(PORT, () => {
  console.info(`play-sync listening on :${PORT} (ws path /play-ws)`);
});
