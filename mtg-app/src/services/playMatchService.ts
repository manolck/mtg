import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import { applyMatchAction, createInitialMatchState } from '../utils/playTable';
import type { MatchState, PlayAction, PlayMatch, PlaySeat } from '../types/play';
import type { DeckFormat } from '../types/deck';
import { snapshotSeatDeck, updateLobbyStatus } from './playLobbyService';

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(relationId).filter(Boolean).join(',');
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return '';
}

function relationIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(relationId).filter(Boolean);
  const single = relationId(value);
  return single ? [single] : [];
}

function asState(value: unknown): MatchState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as MatchState;
  if (!Array.isArray(raw.players) || typeof raw.version !== 'number') return null;
  return raw;
}

function recordToMatch(record: { id: string; [key: string]: unknown }): PlayMatch {
  const state = asState(record.state);
  if (!state) {
    throw new Error('État de partie invalide.');
  }
  return {
    id: record.id,
    lobbyId: relationId(record.lobbyId),
    state,
    updatedBy: relationId(record.updatedBy),
    playerIds: relationIds(record.playerIds),
  };
}

export async function getMatchByLobby(lobbyId: string): Promise<PlayMatch | null> {
  try {
    const record = await pb.collection('play_matches').getFirstListItem(pbEqual('lobbyId', lobbyId));
    return recordToMatch(record);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

export async function startMatch(input: {
  lobbyId: string;
  hostId: string;
  format: DeckFormat;
  seats: PlaySeat[];
}): Promise<PlayMatch> {
  const existing = await getMatchByLobby(input.lobbyId);
  if (existing) {
    await updateLobbyStatus(input.lobbyId, 'playing');
    return existing;
  }

  const readySeats: PlaySeat[] = [];
  for (const seat of input.seats) {
    if (!seat.deckId && !seat.deckSnapshot) {
      throw new Error('Tous les joueurs doivent choisir un deck.');
    }
    readySeats.push(await snapshotSeatDeck(seat));
  }

  const state = createInitialMatchState(readySeats, input.format);
  const playerIds = readySeats.map((s) => s.userId);
  const record = await pb.collection('play_matches').create({
    lobbyId: input.lobbyId,
    state,
    updatedBy: input.hostId,
    playerIds,
  });
  await updateLobbyStatus(input.lobbyId, 'playing');
  return recordToMatch(record);
}

export async function applyPlayAction(input: {
  matchId: string;
  userId: string;
  current: MatchState;
  action: PlayAction;
}): Promise<MatchState> {
  const next = applyMatchAction(input.current, actionFrom(input.action, input.userId));
  if (next.version === input.current.version) return input.current;
  await pb.collection('play_matches').update(input.matchId, {
    state: next,
    updatedBy: input.userId,
  });
  return next;
}

function actionFrom(action: PlayAction, userId: string): PlayAction {
  if (action.type === 'passTurn') return action;
  return { ...action, userId };
}

export function subscribeMatch(matchId: string, onUpdate: (match: PlayMatch) => void): () => void {
  let cancelled = false;
  pb.collection('play_matches')
    .subscribe(matchId, (e) => {
      if (cancelled || e.action === 'delete') return;
      try {
        onUpdate(recordToMatch(e.record as { id: string; [key: string]: unknown }));
      } catch (err) {
        console.warn('play_matches record ignored', err);
      }
    })
    .catch((err) => console.warn('play_matches subscribe failed', err));
  return () => {
    cancelled = true;
    pb.collection('play_matches').unsubscribe(matchId);
  };
}
