import {
  EMPTY_WAITING_LOBBY_MS,
  emptyWaitingLobbyRemainingMs,
  formatCountdown,
  shouldCloseEmptyWaitingLobby,
} from '../playLobby';

describe('empty waiting lobby timeout', () => {
  const createdAt = new Date('2026-09-17T08:00:00.000Z');

  it('keeps a waiting lobby while at least one player is seated', () => {
    const late = createdAt.getTime() + EMPTY_WAITING_LOBBY_MS + 1;
    expect(shouldCloseEmptyWaitingLobby({ status: 'waiting', createdAt, seatCount: 1, now: late })).toBe(false);
    expect(shouldCloseEmptyWaitingLobby({ status: 'waiting', createdAt, seatCount: 2, now: late })).toBe(false);
    expect(
      emptyWaitingLobbyRemainingMs({
        status: 'waiting',
        createdAt,
        seatCount: 1,
        now: createdAt.getTime(),
      })
    ).toBeNull();
  });

  it('does not close a playing or already closed lobby', () => {
    const late = createdAt.getTime() + EMPTY_WAITING_LOBBY_MS + 1;
    expect(shouldCloseEmptyWaitingLobby({ status: 'playing', createdAt, seatCount: 0, now: late })).toBe(false);
    expect(shouldCloseEmptyWaitingLobby({ status: 'closed', createdAt, seatCount: 0, now: late })).toBe(false);
  });

  it('closes an empty waiting lobby after two minutes', () => {
    const justBefore = createdAt.getTime() + EMPTY_WAITING_LOBBY_MS - 1;
    const justAfter = createdAt.getTime() + EMPTY_WAITING_LOBBY_MS;
    expect(shouldCloseEmptyWaitingLobby({ status: 'waiting', createdAt, seatCount: 0, now: justBefore })).toBe(false);
    expect(shouldCloseEmptyWaitingLobby({ status: 'waiting', createdAt, seatCount: 0, now: justAfter })).toBe(true);
  });

  it('formats the countdown', () => {
    expect(formatCountdown(125_000)).toBe('2:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-1000)).toBe('0:00');
  });
});
