import {
  applyMatchAction,
  createInitialMatchState,
  filterLibraryCards,
  isPlaymatLand,
  snapshotFromDeck,
  splitBattlefield,
} from '../playTable';
import type { DeckEntry } from '../../types/deck';
import type { PlaySeat } from '../../types/play';

const bolt: DeckEntry = {
  scryfallId: 'bolt',
  name: 'Lightning Bolt',
  quantity: 3,
  cmc: 1,
  imageUrl: 'https://example.com/bolt.jpg',
};

const commander: DeckEntry = {
  scryfallId: 'kaalia',
  name: 'Kaalia of the Vast',
  quantity: 1,
  cmc: 4,
};

function seat(partial: Partial<PlaySeat> & Pick<PlaySeat, 'userId' | 'seatIndex'>): PlaySeat {
  return {
    id: partial.id || `seat-${partial.userId}`,
    lobbyId: 'lobby1',
    ready: true,
    ...partial,
  };
}

describe('playTable', () => {
  it('snapshots deck zones used at the table', () => {
    const snap = snapshotFromDeck({
      id: 'd1',
      name: 'Aggro',
      format: 'modern',
      cards: { mainboard: [bolt] },
      commanders: [],
    });
    expect(snap.mainboard).toHaveLength(1);
    expect(snap.deckId).toBe('d1');
  });

  it('expands quantities, draws 7, and puts commanders in the command zone', () => {
    const state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          displayName: 'A',
          deckSnapshot: {
            deckId: 'd1',
            name: 'Kaalia',
            format: 'commander',
            mainboard: [bolt],
            commanders: [commander],
          },
        }),
      ],
      'commander',
      { random: () => 0 }
    );

    const player = state.players[0];
    expect(player.life).toBe(40);
    expect(player.hand).toHaveLength(3);
    expect(player.library).toHaveLength(0);
    expect(player.command).toHaveLength(1);
    expect(player.command[0].name).toBe('Kaalia of the Vast');
    expect(state.version).toBe(1);
  });

  it('starts constructed at 20 life', () => {
    const state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Burn',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    expect(state.players[0].life).toBe(20);
    expect(state.players[0].hand).toHaveLength(7);
    expect(state.players[0].library).toHaveLength(3);
  });

  it('draws, taps, moves, and increments version', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Burn',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const before = state.players[0].hand.length;
    state = applyMatchAction(state, { type: 'draw', userId: 'u1' });
    expect(state.players[0].hand.length).toBe(before + 1);
    expect(state.version).toBe(2);

    const card = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: card.instanceId,
      from: 'hand',
      to: 'battlefield',
    });
    expect(state.players[0].battlefield[0].instanceId).toBe(card.instanceId);

    state = applyMatchAction(state, { type: 'tap', userId: 'u1', instanceId: card.instanceId });
    expect(state.players[0].battlefield[0].tapped).toBe(true);

    state = applyMatchAction(state, { type: 'setLife', userId: 'u1', delta: -2 });
    expect(state.players[0].life).toBe(18);
  });

  it('filters library by name and type', () => {
    const cards = [
      { instanceId: '1', scryfallId: 'a', name: 'Island', typeLine: 'Basic Land — Island', tapped: false, facedown: false },
      { instanceId: '2', scryfallId: 'b', name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}', tapped: false, facedown: false },
    ];
    expect(filterLibraryCards(cards, 'bolt')).toHaveLength(1);
    expect(filterLibraryCards(cards, 'land')).toHaveLength(1);
    expect(filterLibraryCards(cards, '')).toHaveLength(2);
  });

  it('searches a card from library into hand and can shuffle the rest', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Burn',
            format: 'modern',
            mainboard: [
              { ...bolt, quantity: 8 },
              { scryfallId: 'island', name: 'Island', quantity: 4, typeLine: 'Basic Land — Island' },
            ],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const fromLib = state.players[0].library[2];
    expect(fromLib).toBeTruthy();
    const libBefore = state.players[0].library.length;
    state = applyMatchAction(
      state,
      { type: 'searchLibrary', userId: 'u1', instanceId: fromLib.instanceId, to: 'hand', shuffle: true },
      { random: () => 0.3 }
    );
    expect(state.players[0].hand.some((c) => c.instanceId === fromLib.instanceId)).toBe(true);
    expect(state.players[0].library.length).toBe(libBefore - 1);
    expect(state.players[0].library.some((c) => c.instanceId === fromLib.instanceId)).toBe(false);
  });

  it('passes the turn to the next seat', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'a',
            name: 'A',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 8 }],
            commanders: [],
          },
        }),
        seat({
          userId: 'u2',
          seatIndex: 1,
          deckSnapshot: {
            deckId: 'b',
            name: 'B',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 8 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    expect(state.turnSeatIndex).toBe(0);
    state = applyMatchAction(state, { type: 'passTurn' });
    expect(state.turnSeatIndex).toBe(1);
    state = applyMatchAction(state, { type: 'passTurn' });
    expect(state.turnSeatIndex).toBe(0);
  });

  it('splits battlefield lands from other permanents', () => {
    expect(isPlaymatLand({ name: 'Forest', typeLine: 'Basic Land — Forest' })).toBe(true);
    expect(isPlaymatLand({ name: 'Disciple of Freyalise // Garden of Freyalise', typeLine: 'Creature — Elf Druid // Land' })).toBe(
      false
    );
    expect(isPlaymatLand({ name: 'Kinnan, Bonder Prodigy', typeLine: 'Legendary Creature — Merfolk Druid' })).toBe(false);
    const { lands, other } = splitBattlefield([
      { instanceId: '1', scryfallId: 'a', name: 'Forest', typeLine: 'Basic Land — Forest', tapped: false, facedown: false },
      { instanceId: '2', scryfallId: 'b', name: 'Kinnan, Bonder Prodigy', typeLine: 'Legendary Creature — Merfolk Druid', tapped: false, facedown: false },
    ]);
    expect(lands.map((c) => c.name)).toEqual(['Forest']);
    expect(other.map((c) => c.name)).toEqual(['Kinnan, Bonder Prodigy']);
  });
});
