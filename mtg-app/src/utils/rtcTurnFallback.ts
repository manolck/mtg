import { isOutboundAudioBlocked, type RtcAudioStats } from './rtcAudioStats';

export const ONE_WAY_RELAY_GRACE_MS = 2000;
export const RELAY_RESTART_COOLDOWN_MS = 4000;
export const MAX_RELAY_RESTARTS = 2;

export function shouldSwitchToTurnRelay(input: {
  turnConfigured: boolean;
  policyIsRelay: boolean;
  usingRelay?: boolean;
  sendEnabled: boolean;
  stats: Pick<RtcAudioStats, 'packetsSent' | 'packetsReceived'>;
  oneWayMs: number;
  graceMs?: number;
}): boolean {
  if (!input.turnConfigured || input.policyIsRelay || !input.sendEnabled || input.usingRelay) {
    return false;
  }
  if (!isOutboundAudioBlocked(input.stats)) return false;
  return input.oneWayMs >= (input.graceMs ?? ONE_WAY_RELAY_GRACE_MS);
}

export function shouldRetryTurnRelay(input: {
  policyIsRelay: boolean;
  usingRelay?: boolean;
  sendEnabled: boolean;
  stats: Pick<RtcAudioStats, 'packetsSent' | 'packetsReceived'>;
  attempts: number;
  sinceLastAttemptMs: number;
}): boolean {
  if (!input.policyIsRelay || !input.sendEnabled || input.usingRelay) return false;
  if (input.attempts >= MAX_RELAY_RESTARTS) return false;
  if (!isOutboundAudioBlocked(input.stats)) return false;
  return input.sinceLastAttemptMs >= RELAY_RESTART_COOLDOWN_MS;
}

/** User-facing TURN failure, never includes the ICE URL (credentials). */
export function formatIceCandidateError(event: {
  errorCode?: number;
  errorText?: string;
  url?: string;
}): string | undefined {
  const url = event.url?.trim() ?? '';
  const isTurn = /^turns?:/i.test(url);
  if (!isTurn) return undefined;
  const code = event.errorCode;
  if (code === 401 || code === 403) return 'TURN : identifiants refusés';
  if (code === 701) return 'TURN : serveur injoignable';
  if (typeof code === 'number' && code > 0) return `TURN : erreur ${code}`;
  return undefined;
}
