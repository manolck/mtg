import type { LobbyStatus } from '../types/play';

export const EMPTY_WAITING_LOBBY_MS = 2 * 60 * 1000;
const MIN_PLAYERS_TO_KEEP = 1;

export function emptyWaitingLobbyRemainingMs(input: {
  status: LobbyStatus | string;
  createdAt: Date;
  seatCount: number;
  now?: number;
}): number | null {
  if (input.status !== 'waiting' || input.seatCount >= MIN_PLAYERS_TO_KEEP) return null;
  return input.createdAt.getTime() + EMPTY_WAITING_LOBBY_MS - (input.now ?? Date.now());
}

export function shouldCloseEmptyWaitingLobby(input: {
  status: LobbyStatus | string;
  createdAt: Date;
  seatCount: number;
  now?: number;
}): boolean {
  const remaining = emptyWaitingLobbyRemainingMs(input);
  return remaining !== null && remaining <= 0;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
