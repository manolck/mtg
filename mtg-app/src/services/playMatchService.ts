import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import { applyMatchAction, createInitialMatchState } from '../utils/playTable';
import { replayMatchActions } from '../utils/playActionLog';
import type {
  MatchActionRecord,
  MatchState,
  PlayAction,
  PlayMatch,
  PlaySeat,
} from '../types/play';
import type { DeckFormat } from '../types/deck';
import { snapshotSeatDeck, updateLobbyStatus } from './playLobbyService';
import { isRealtimeUnavailable, safeRealtimeUnsub, swallowRealtimeError } from '../utils/playRealtime';

export { replayMatchActions } from '../utils/playActionLog';

const COMPACT_MIN_INTERVAL_MS = 3000;

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
  return {
    ...raw,
    actionSeq: typeof raw.actionSeq === 'number' ? raw.actionSeq : 0,
  };
}

function asPlayAction(value: unknown): PlayAction | null {
  if (!value || typeof value !== 'object') return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  return value as PlayAction;
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

function recordToMatchAction(record: { id: string; [key: string]: unknown }): MatchActionRecord | null {
  const action = asPlayAction(record.action);
  const actionId = typeof record.actionId === 'string' ? record.actionId : '';
  if (!action || !actionId) return null;
  return {
    id: record.id,
    matchId: relationId(record.matchId),
    actionId,
    userId: relationId(record.userId),
    action,
    created: typeof record.created === 'string' ? record.created : '',
  };
}

export function newMatchActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function actionFrom(action: PlayAction, userId: string): PlayAction {
  if (action.type === 'passTurn') return action;
  return { ...action, userId };
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

export async function listMatchActions(matchId: string): Promise<MatchActionRecord[]> {
  const records = await pb.collection('play_match_actions').getFullList({
    filter: pbEqual('matchId', matchId),
    sort: 'created,id',
  });
  return records
    .map((record) => recordToMatchAction(record as { id: string; [key: string]: unknown }))
    .filter((item): item is MatchActionRecord => Boolean(item));
}

export async function loadMatchWithActions(lobbyId: string): Promise<{
  match: PlayMatch;
  state: MatchState;
  appliedIds: Set<string>;
  actionCount: number;
} | null> {
  const match = await getMatchByLobby(lobbyId);
  if (!match) return null;
  const actions = await listMatchActions(match.id);
  const { state, appliedIds } = replayMatchActions(match.state, actions);
  return { match, state, appliedIds, actionCount: actions.length };
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
  actionId?: string;
  onApplied?: (state: MatchState) => void;
}): Promise<{ state: MatchState; actionId: string; changed: boolean }> {
  const actionId = input.actionId || newMatchActionId();
  const normalized = actionFrom(input.action, input.userId);
  const next = applyMatchAction(input.current, normalized);
  if (next.version === input.current.version) {
    return { state: input.current, actionId, changed: false };
  }
  input.onApplied?.(next);
  try {
    await pb.collection('play_match_actions').create({
      matchId: input.matchId,
      actionId,
      userId: input.userId,
      action: normalized,
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    // Duplicate actionId (already appended) — treat as success for idempotence.
    if (status !== 400) throw err;
  }
  return { state: next, actionId, changed: true };
}

let lastCompactAt = 0;

/** Fold current live state into the match snapshot for faster reloads. */
export async function compactMatchSnapshot(input: {
  matchId: string;
  userId: string;
  state: MatchState;
  actionCount: number;
  force?: boolean;
}): Promise<MatchState | null> {
  const seq = Math.max(0, Math.floor(input.actionCount));
  const currentSeq = Math.max(0, Math.floor(input.state.actionSeq ?? 0));
  if (!input.force && seq <= currentSeq) return null;
  const now = Date.now();
  if (!input.force && now - lastCompactAt < COMPACT_MIN_INTERVAL_MS) return null;
  lastCompactAt = now;
  const nextState: MatchState = { ...input.state, actionSeq: seq };
  await pb.collection('play_matches').update(input.matchId, {
    state: nextState,
    updatedBy: input.userId,
  });
  return nextState;
}

export function subscribeMatch(matchId: string, onUpdate: (match: PlayMatch) => void): () => void {
  if (isRealtimeUnavailable()) return () => {};
  let cancelled = false;
  let unsub: (() => void) | undefined;
  pb.collection('play_matches')
    .subscribe(matchId, (e) => {
      if (cancelled || e.action === 'delete') return;
      try {
        onUpdate(recordToMatch(e.record as { id: string; [key: string]: unknown }));
      } catch (err) {
        console.warn('play_matches record ignored', err);
      }
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

export function subscribeMatchActions(
  matchId: string,
  onAction: (entry: MatchActionRecord) => void,
): () => void {
  if (isRealtimeUnavailable()) return () => {};
  let cancelled = false;
  let unsub: (() => void) | undefined;
  pb.collection('play_match_actions')
    .subscribe('*', (e) => {
      if (cancelled || e.action !== 'create') return;
      const entry = recordToMatchAction(e.record as { id: string; [key: string]: unknown });
      if (!entry || entry.matchId !== matchId) return;
      onAction(entry);
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
