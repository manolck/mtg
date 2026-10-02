import {
  formatIceCandidateError,
  shouldRetryTurnRelay,
  shouldSwitchToTurnRelay,
} from '../rtcTurnFallback';

const blocked = { packetsSent: 0, packetsReceived: 40 };

describe('shouldSwitchToTurnRelay', () => {
  const base = {
    turnConfigured: true,
    policyIsRelay: false,
    usingRelay: false,
    sendEnabled: true,
    stats: blocked,
    oneWayMs: 2000,
  };

  it('switches after grace when TURN is configured but unused', () => {
    expect(shouldSwitchToTurnRelay(base)).toBe(true);
  });

  it('waits for the grace period', () => {
    expect(shouldSwitchToTurnRelay({ ...base, oneWayMs: 1000 })).toBe(false);
  });

  it('does nothing without TURN, while already on relay, or if we already send', () => {
    expect(shouldSwitchToTurnRelay({ ...base, turnConfigured: false })).toBe(false);
    expect(shouldSwitchToTurnRelay({ ...base, usingRelay: true })).toBe(false);
    expect(shouldSwitchToTurnRelay({ ...base, policyIsRelay: true })).toBe(false);
    expect(shouldSwitchToTurnRelay({ ...base, sendEnabled: false })).toBe(false);
    expect(
      shouldSwitchToTurnRelay({ ...base, stats: { packetsSent: 3, packetsReceived: 40 } }),
    ).toBe(false);
  });
});

describe('shouldRetryTurnRelay', () => {
  it('retries while still one-way after cooldown', () => {
    expect(
      shouldRetryTurnRelay({
        policyIsRelay: true,
        usingRelay: false,
        sendEnabled: true,
        stats: blocked,
        attempts: 1,
        sinceLastAttemptMs: 4000,
      }),
    ).toBe(true);
  });

  it('stops after max attempts', () => {
    expect(
      shouldRetryTurnRelay({
        policyIsRelay: true,
        sendEnabled: true,
        stats: blocked,
        attempts: 2,
        sinceLastAttemptMs: 9000,
      }),
    ).toBe(false);
  });
});

describe('formatIceCandidateError', () => {
  it('maps TURN 401 without echoing the URL', () => {
    expect(
      formatIceCandidateError({
        errorCode: 401,
        url: 'turn:turn.example:3478?transport=udp',
        errorText: 'Unauthorized',
      }),
    ).toBe('TURN : identifiants refusés');
  });

  it('ignores STUN-only 701 noise', () => {
    expect(formatIceCandidateError({ errorCode: 701, url: 'stun:stun.l.google.com:19302' })).toBeUndefined();
  });

  it('flags unreachable TURN', () => {
    expect(formatIceCandidateError({ errorCode: 701, url: 'turns:turn.example:5349' })).toBe(
      'TURN : serveur injoignable',
    );
  });
});
