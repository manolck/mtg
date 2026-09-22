import { replayMatchActions } from '../../utils/playActionLog';
import { applyMatchAction, createInitialMatchState } from '../../utils/playTable';
import type { DeckEntry } from '../../types/deck';
import type { PlaySeat } from '../../types/play';

const bolt: DeckEntry = {
  scryfallId: 'bolt',
  name: 'Lightning Bolt',
  quantity: 3,
  cmc: 1,
  imageUrl: 'https://example.com/bolt.jpg',
};

function seat(partial: Partial<PlaySeat> & Pick<PlaySeat, 'userId' | 'seatIndex'>): PlaySeat {
  return {
    id: partial.id || `seat-${partial.userId}`,
    lobbyId: partial.lobbyId || 'lobby',
    userId: partial.userId,
    seatIndex: partial.seatIndex,
    ready: partial.ready ?? true,
    deckId: partial.deckId,
    deckSnapshot: partial.deckSnapshot ?? null,
    displayName: partial.displayName,
  };
}

describe('replayMatchActions', () => {
  it('applies concurrent moves from both players without dropping either', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'A',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
        seat({
          userId: 'u2',
          seatIndex: 1,
          deckSnapshot: {
            deckId: 'd2',
            name: 'B',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 },
    );

    const cardA = state.players[0].hand[0];
    const cardB = state.players[1].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: cardA.instanceId,
      from: 'hand',
      to: 'battlefield',
      playmatX: 20,
      playmatY: 30,
    });
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u2',
      instanceId: cardB.instanceId,
      from: 'hand',
      to: 'battlefield',
      playmatX: 70,
      playmatY: 40,
    });

    const compacted = { ...state, actionSeq: 0 };
    const moveA = {
      actionId: 'a-move',
      action: {
        type: 'setPlaymatPos' as const,
        userId: 'u1',
        instanceIds: [cardA.instanceId],
        x: 11,
        y: 22,
        row: 'battlefield' as const,
      },
    };
    const moveB = {
      actionId: 'b-move',
      action: {
        type: 'setPlaymatPos' as const,
        userId: 'u2',
        instanceIds: [cardB.instanceId],
        x: 88,
        y: 66,
        row: 'battlefield' as const,
      },
    };

    const ab = replayMatchActions(compacted, [moveA, moveB]);
    const ba = replayMatchActions(compacted, [moveB, moveA]);

    expect(ab.state.players[0].battlefield.find((c) => c.instanceId === cardA.instanceId)).toMatchObject({
      playmatX: 11,
      playmatY: 22,
    });
    expect(ab.state.players[1].battlefield.find((c) => c.instanceId === cardB.instanceId)).toMatchObject({
      playmatX: 88,
      playmatY: 66,
    });
    expect(ba.state.players[0].battlefield.find((c) => c.instanceId === cardA.instanceId)).toMatchObject({
      playmatX: 11,
      playmatY: 22,
    });
    expect(ba.state.players[1].battlefield.find((c) => c.instanceId === cardB.instanceId)).toMatchObject({
      playmatX: 88,
      playmatY: 66,
    });
  });

  it('skips actions already folded into actionSeq', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'A',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 },
    );
    const card = state.players[0].hand[0];
    const play = {
      actionId: 'play-1',
      action: {
        type: 'moveCard' as const,
        userId: 'u1',
        instanceId: card.instanceId,
        from: 'hand' as const,
        to: 'battlefield' as const,
        playmatX: 50,
        playmatY: 50,
      },
    };
    state = applyMatchAction(state, play.action);
    const snapshot = { ...state, actionSeq: 1 };
    const tap = {
      actionId: 'tap-1',
      action: {
        type: 'tap' as const,
        userId: 'u1',
        instanceId: card.instanceId,
      },
    };
    const replayed = replayMatchActions(snapshot, [play, tap]);
    expect(replayed.state.players[0].hand.some((c) => c.instanceId === card.instanceId)).toBe(false);
    expect(replayed.state.players[0].battlefield[0]?.tapped).toBe(true);
    expect(replayed.appliedIds.size).toBe(2);
  });
});
