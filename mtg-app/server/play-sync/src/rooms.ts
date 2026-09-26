import type { WebSocket } from 'ws';
import { RECENT_ACTION_LIMIT } from './protocol.js';

export interface StoredAction {
  seq: number;
  actionId: string;
  userId: string;
  action: unknown;
  created: string;
}

export interface RoomClient {
  ws: WebSocket;
  userId: string;
  token: string;
}

export interface MatchRoom {
  matchId: string;
  lastSeq: number;
  clients: Set<RoomClient>;
  recent: StoredAction[];
  knownActionIds: Set<string>;
}

const rooms = new Map<string, MatchRoom>();

export function getOrCreateRoom(matchId: string, seedSeq: number): MatchRoom {
  let room = rooms.get(matchId);
  if (!room) {
    room = {
      matchId,
      lastSeq: Math.max(0, seedSeq),
      clients: new Set(),
      recent: [],
      knownActionIds: new Set(),
    };
    rooms.set(matchId, room);
  }
  return room;
}

export function getRoom(matchId: string): MatchRoom | undefined {
  return rooms.get(matchId);
}

export function addClient(room: MatchRoom, client: RoomClient): void {
  room.clients.add(client);
}

export function removeClient(room: MatchRoom, client: RoomClient): void {
  room.clients.delete(client);
  if (room.clients.size === 0) {
    // Keep room briefly in memory for reconnect; prune empty rooms after idle.
    // Immediate delete is fine — cold join reseeds from PB.
    rooms.delete(room.matchId);
  }
}

export function appendAction(
  room: MatchRoom,
  input: { actionId: string; userId: string; action: unknown },
): StoredAction | null {
  if (room.knownActionIds.has(input.actionId)) {
    const existing = room.recent.find((item) => item.actionId === input.actionId);
    return existing ?? null;
  }
  room.lastSeq += 1;
  const stored: StoredAction = {
    seq: room.lastSeq,
    actionId: input.actionId,
    userId: input.userId,
    action: input.action,
    created: new Date().toISOString(),
  };
  room.knownActionIds.add(input.actionId);
  room.recent.push(stored);
  if (room.recent.length > RECENT_ACTION_LIMIT) {
    const dropped = room.recent.shift();
    if (dropped) room.knownActionIds.delete(dropped.actionId);
  }
  return stored;
}

/** Actions with seq > syncFrom. Null means gap too large → client should reload. */
export function actionsSince(room: MatchRoom, syncFrom: number): StoredAction[] | 'reload' {
  if (syncFrom >= room.lastSeq) return [];
  if (room.recent.length === 0) {
    return syncFrom < room.lastSeq ? 'reload' : [];
  }
  const oldest = room.recent[0].seq;
  if (syncFrom + 1 < oldest) return 'reload';
  return room.recent.filter((item) => item.seq > syncFrom);
}

export function broadcast(
  room: MatchRoom,
  message: object,
  except?: RoomClient,
): void {
  const raw = JSON.stringify(message);
  for (const client of room.clients) {
    if (client === except) continue;
    if (client.ws.readyState === 1 /* OPEN */) {
      client.ws.send(raw);
    }
  }
}

export function send(client: RoomClient, message: object): void {
  if (client.ws.readyState === 1) {
    client.ws.send(JSON.stringify(message));
  }
}
