import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import { getDeckById } from './deckService';
import { snapshotFromDeck } from '../utils/playTable';
import { shouldCloseEmptyWaitingLobby } from '../utils/playLobby';
import { safeRealtimeUnsub, swallowRealtimeError } from '../utils/playRealtime';
import type { DeckFormat } from '../types/deck';
import type { DeckSnapshot, LobbyStatus, PlayLobby, PlaySeat } from '../types/play';

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return '';
}

function asSnapshot(value: unknown): DeckSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as DeckSnapshot;
  if (!raw.deckId || !Array.isArray(raw.mainboard)) return null;
  return raw;
}

function recordToLobby(record: { id: string; [key: string]: unknown }): PlayLobby {
  return {
    id: record.id,
    hostId: relationId(record.hostId),
    name: String(record.name || ''),
    format: (record.format as DeckFormat) || 'commander',
    maxPlayers: Number(record.maxPlayers) || 2,
    status: (record.status as LobbyStatus) || 'waiting',
    createdAt: new Date(String(record.created || Date.now())),
    updatedAt: record.updated ? new Date(String(record.updated)) : undefined,
  };
}

function recordToSeat(record: { id: string; [key: string]: unknown }): PlaySeat {
  return {
    id: record.id,
    lobbyId: relationId(record.lobbyId),
    userId: relationId(record.userId),
    seatIndex: Number(record.seatIndex) || 0,
    ready: Boolean(record.ready),
    deckId: record.deckId ? String(record.deckId) : undefined,
    deckSnapshot: asSnapshot(record.deckSnapshot),
    displayName: record.displayName ? String(record.displayName) : undefined,
  };
}

export async function listLobbies(): Promise<PlayLobby[]> {
  const records = await pb.collection('play_lobbies').getFullList({
    filter: 'status != "closed"',
    sort: '-created',
  });
  return records.map(recordToLobby);
}

export async function getLobby(lobbyId: string): Promise<PlayLobby> {
  const record = await pb.collection('play_lobbies').getOne(lobbyId);
  return recordToLobby(record);
}

export async function createLobby(input: {
  hostId: string;
  name: string;
  format: DeckFormat;
  maxPlayers: number;
}): Promise<PlayLobby> {
  const maxPlayers = Math.min(4, Math.max(2, input.maxPlayers));
  const record = await pb.collection('play_lobbies').create({
    hostId: input.hostId,
    name: input.name.trim(),
    format: input.format,
    maxPlayers,
    status: 'waiting',
  });
  return recordToLobby(record);
}

export async function updateLobbyStatus(lobbyId: string, status: LobbyStatus): Promise<PlayLobby> {
  const record = await pb.collection('play_lobbies').update(lobbyId, { status });
  return recordToLobby(record);
}

export async function closeLobby(lobbyId: string): Promise<void> {
  let seats: PlaySeat[] = [];
  try {
    seats = await listSeats(lobbyId);
  } catch {
    seats = [];
  }
  for (const seat of seats) {
    try {
      await leaveLobby(seat.id);
    } catch {
      /* seat already gone */
    }
  }
  await updateLobbyStatus(lobbyId, 'closed');
}

export async function deleteLobby(lobbyId: string): Promise<void> {
  await pb.collection('play_lobbies').delete(lobbyId);
}

export async function closeStaleEmptyLobbies(hostId: string, now = Date.now()): Promise<number> {
  const lobbies = await listLobbies();
  const mine = lobbies.filter((lobby) => lobby.hostId === hostId && lobby.status === 'waiting');
  let closed = 0;
  for (const lobby of mine) {
    let seatCount = 0;
    try {
      seatCount = (await listSeats(lobby.id)).length;
    } catch {
      continue;
    }
    if (!shouldCloseEmptyWaitingLobby({ status: lobby.status, createdAt: lobby.createdAt, seatCount, now })) {
      continue;
    }
    try {
      await closeLobby(lobby.id);
      closed += 1;
    } catch {
      /* another client may have closed it */
    }
  }
  return closed;
}

export async function listSeats(lobbyId: string): Promise<PlaySeat[]> {
  const records = await pb.collection('play_seats').getFullList({
    filter: pbEqual('lobbyId', lobbyId),
    sort: 'seatIndex',
  });
  return records.map(recordToSeat);
}

export async function joinLobby(input: {
  lobbyId: string;
  userId: string;
  displayName?: string;
}): Promise<PlaySeat> {
  const lobby = await getLobby(input.lobbyId);
  if (lobby.status !== 'waiting') {
    throw new Error('Ce lobby n’accepte plus de joueurs.');
  }
  const seats = await listSeats(input.lobbyId);
  const existing = seats.find((s) => s.userId === input.userId);
  if (existing) return existing;
  if (seats.length >= lobby.maxPlayers) {
    throw new Error('Ce lobby est complet.');
  }
  const taken = new Set(seats.map((s) => s.seatIndex));
  const seatIndex = [0, 1, 2, 3].find((i) => i < lobby.maxPlayers && !taken.has(i));
  if (seatIndex === undefined) {
    throw new Error('Aucun siège disponible.');
  }
  const record = await pb.collection('play_seats').create({
    lobbyId: input.lobbyId,
    userId: input.userId,
    seatIndex,
    ready: false,
    displayName: input.displayName || '',
  });
  return recordToSeat(record);
}

export async function leaveLobby(seatId: string): Promise<void> {
  await pb.collection('play_seats').delete(seatId);
}

export async function chooseDeck(seatId: string, deckId: string): Promise<PlaySeat> {
  const deck = await getDeckById(deckId);
  const deckSnapshot = snapshotFromDeck(deck);
  const record = await pb.collection('play_seats').update(seatId, {
    deckId,
    deckSnapshot,
    ready: false,
  });
  return recordToSeat(record);
}

export async function setReady(seatId: string, ready: boolean): Promise<PlaySeat> {
  const record = await pb.collection('play_seats').update(seatId, { ready });
  return recordToSeat(record);
}

export async function snapshotSeatDeck(seat: PlaySeat): Promise<PlaySeat> {
  if (seat.deckSnapshot?.mainboard) return seat;
  if (!seat.deckId) throw new Error('Aucun deck choisi.');
  return chooseDeck(seat.id, seat.deckId);
}

export function subscribeLobby(
  lobbyId: string,
  onChange: () => void
): () => void {
  let cancelled = false;
  const unsubs: Array<() => void> = [];

  pb.collection('play_lobbies')
    .subscribe(lobbyId, () => {
      if (!cancelled) onChange();
    })
    .then((unsub) => {
      if (cancelled) safeRealtimeUnsub(unsub);
      else unsubs.push(unsub);
    })
    .catch(swallowRealtimeError);

  pb.collection('play_seats')
    .subscribe('*', (e) => {
      const recLobby = relationId((e.record as { lobbyId?: unknown }).lobbyId);
      if (!cancelled && recLobby === lobbyId) onChange();
    })
    .then((unsub) => {
      if (cancelled) safeRealtimeUnsub(unsub);
      else unsubs.push(unsub);
    })
    .catch(swallowRealtimeError);

  return () => {
    cancelled = true;
    unsubs.forEach(safeRealtimeUnsub);
  };
}

export function subscribeLobbyList(onChange: () => void): () => void {
  let cancelled = false;
  let unsub: (() => void) | undefined;
  pb.collection('play_lobbies')
    .subscribe('*', () => {
      if (!cancelled) onChange();
    })
    .then((next) => {
      if (cancelled) safeRealtimeUnsub(next);
      else unsub = next;
    })
    .catch(swallowRealtimeError);
  return () => {
    cancelled = true;
    if (unsub) safeRealtimeUnsub(unsub);
  };
}
