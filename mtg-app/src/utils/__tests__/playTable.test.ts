import {
  applyMatchAction,
  attachmentsOn,
  canSeeGraveOrExileFace,
  canSeeHandCard,
  canSeeLibraryTop,
  canSeePlayerHand,
  createInitialMatchState,
  filterLibraryCards,
  filterPublicZoneCards,
  isPlaymatAttachable,
  isPlaymatLand,
  isHandCardChosen,
  snapshotFromDeck,
  splitBattlefield,
  tableBattlefieldCards,
  visibleOpponentHand,
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

  it('reorders cards in hand by toIndex', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Order',
            format: 'modern',
            mainboard: [
              { scryfallId: 'a', name: 'Alpha', quantity: 1 },
              { scryfallId: 'b', name: 'Bravo', quantity: 1 },
              { scryfallId: 'c', name: 'Charlie', quantity: 1 },
              { scryfallId: 'd', name: 'Delta', quantity: 1 },
              { scryfallId: 'e', name: 'Echo', quantity: 1 },
              { scryfallId: 'f', name: 'Foxtrot', quantity: 1 },
              { scryfallId: 'g', name: 'Golf', quantity: 1 },
            ],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const ids = state.players[0].hand.map((card) => card.instanceId);
    const moved = ids[0];
    state = applyMatchAction(state, { type: 'reorderHand', userId: 'u1', instanceId: moved, toIndex: 2 });
    expect(state.players[0].hand.map((card) => card.instanceId)).toEqual([ids[1], ids[2], moved, ids[3], ids[4], ids[5], ids[6]]);

    const unchanged = applyMatchAction(state, { type: 'reorderHand', userId: 'u1', instanceId: moved, toIndex: 2 });
    expect(unchanged.version).toBe(state.version);

    const last = ids[6];
    state = applyMatchAction(state, { type: 'reorderHand', userId: 'u1', instanceId: last, toIndex: 0 });
    expect(state.players[0].hand[0].instanceId).toBe(last);
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
    expect(
      filterLibraryCards(
        [{ ...cards[1], name: 'Éclair', oracleName: 'Lightning Bolt' }],
        'bolt',
      ),
    ).toHaveLength(1);
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

  it('splits battlefield lands, enchantments and other permanents', () => {
    expect(isPlaymatLand({ name: 'Forest', typeLine: 'Basic Land — Forest' })).toBe(true);
    expect(isPlaymatLand({ name: 'Forêt', typeLine: 'Terrain de base — Forêt' })).toBe(true);
    expect(isPlaymatLand({ name: 'Disciple of Freyalise // Garden of Freyalise', typeLine: 'Creature — Elf Druid // Land' })).toBe(
      false
    );
    expect(isPlaymatLand({ name: 'Kinnan, Bonder Prodigy', typeLine: 'Legendary Creature — Merfolk Druid' })).toBe(false);
    const { lands, enchantments, other } = splitBattlefield([
      { instanceId: '1', scryfallId: 'a', name: 'Forest', typeLine: 'Basic Land — Forest', tapped: false, facedown: false },
      { instanceId: '2', scryfallId: 'b', name: 'Kinnan, Bonder Prodigy', typeLine: 'Legendary Creature — Merfolk Druid', tapped: false, facedown: false },
      { instanceId: '3', scryfallId: 'c', name: 'Rhystic Study', typeLine: 'Enchantment', tapped: false, facedown: false },
      { instanceId: '4', scryfallId: 'd', name: 'Nylea, God of the Hunt', typeLine: 'Legendary Enchantment Creature — God', tapped: false, facedown: false },
    ]);
    expect(lands.map((c) => c.name)).toEqual(['Forest']);
    expect(enchantments.map((c) => c.name)).toEqual(['Rhystic Study']);
    expect(other.map((c) => c.name)).toEqual(['Kinnan, Bonder Prodigy', 'Nylea, God of the Hunt']);
    const attached = splitBattlefield([
      { instanceId: 'h', scryfallId: 'h', name: 'Bear', typeLine: 'Creature — Bear', tapped: false, facedown: false },
      {
        instanceId: 'a',
        scryfallId: 'a',
        name: 'Snake Umbra',
        typeLine: 'Enchantment — Aura',
        tapped: false,
        facedown: false,
        attachedTo: 'h',
      },
    ]);
    expect(attached.enchantments).toHaveLength(0);
    expect(attached.other.map((c) => c.name)).toEqual(['Bear']);
  });

  it('moves transformed lands and animated lands between playmat rows', () => {
    expect(
      isPlaymatLand({
        name: 'Ojer Kaslem, Deepest Growth',
        typeLine: 'Legendary Creature — God',
        backName: 'Temple of Cultivation',
        backTypeLine: 'Land',
        transformed: true,
      }),
    ).toBe(true);
    expect(
      isPlaymatLand({
        name: 'Ojer Kaslem, Deepest Growth',
        typeLine: 'Legendary Creature — God',
        backName: 'Temple of Cultivation',
        backTypeLine: 'Land',
        transformed: false,
      }),
    ).toBe(false);
    expect(
      isPlaymatLand({
        name: 'Ojer Kaslem, Deepest Growth // Temple of Cultivation',
        typeLine: 'Legendary Creature — God // Land',
        transformed: true,
      }),
    ).toBe(true);
    expect(isPlaymatLand({ name: 'Mutavault', typeLine: 'Land', playmatRow: 'battlefield' })).toBe(false);
    expect(isPlaymatLand({ name: 'Grizzly Bears', typeLine: 'Creature — Bear', playmatRow: 'lands' })).toBe(true);

    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Lands',
            format: 'modern',
            mainboard: [{ scryfallId: 'forest', name: 'Forest', typeLine: 'Basic Land — Forest', quantity: 8 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 },
    );
    const forest = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: forest.instanceId,
      from: 'hand',
      to: 'battlefield',
    });
    expect(splitBattlefield(state.players[0].battlefield).lands.map((card) => card.instanceId)).toEqual([forest.instanceId]);

    state = applyMatchAction(state, {
      type: 'setPlaymatRow',
      userId: 'u1',
      instanceId: forest.instanceId,
      row: 'battlefield',
    });
    expect(state.players[0].battlefield[0].playmatRow).toBe('battlefield');
    expect(splitBattlefield(state.players[0].battlefield).other.map((card) => card.instanceId)).toEqual([forest.instanceId]);

    state = applyMatchAction(state, {
      type: 'setPlaymatRow',
      userId: 'u1',
      instanceId: forest.instanceId,
      row: 'lands',
    });
    expect(splitBattlefield(state.players[0].battlefield).lands.map((card) => card.instanceId)).toEqual([forest.instanceId]);

    state = applyMatchAction(state, {
      type: 'setPlaymatRow',
      userId: 'u1',
      instanceId: forest.instanceId,
      row: null,
    });
    expect(state.players[0].battlefield[0].playmatRow).toBeUndefined();

    state = applyMatchAction(state, {
      type: 'setPlaymatRow',
      userId: 'u1',
      instanceId: forest.instanceId,
      row: 'battlefield',
    });
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: forest.instanceId,
      from: 'battlefield',
      to: 'graveyard',
    });
    expect(state.players[0].graveyard[0].playmatRow).toBeUndefined();
  });

  it('flips only double-faced cards to their printed back', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'DFC',
            format: 'modern',
            mainboard: [
              { ...bolt, quantity: 7 },
              {
                scryfallId: 'westvale',
                name: 'Westvale Abbey',
                quantity: 1,
                imageUrl: 'https://example.com/westvale-front.jpg',
                backImageUrl: 'https://example.com/ormendahl.jpg',
                backName: 'Ormendahl, Profane Prince',
              },
            ],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const playerId = 'u1';
    const player = state.players[0];
    const dfc = [...player.hand, ...player.library].find((card) => card.scryfallId === 'westvale');
    const regular = player.hand.find((card) => card.scryfallId === 'bolt');
    expect(dfc && regular).toBeTruthy();
    const dfcFrom = player.hand.some((card) => card.instanceId === dfc!.instanceId) ? 'hand' : 'library';
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: playerId,
      instanceId: dfc!.instanceId,
      from: dfcFrom,
      to: 'battlefield',
    });
    const afterRegular = applyMatchAction(state, { type: 'flip', userId: playerId, instanceId: regular!.instanceId });
    expect(afterRegular).toBe(state);

    state = applyMatchAction(state, {
      type: 'flip',
      userId: playerId,
      instanceId: dfc!.instanceId,
      backImageUrl: dfc!.backImageUrl,
      backName: dfc!.backName,
      backTypeLine: 'Legendary Creature — Demon',
    });
    const flipped = state.players[0].battlefield.find((c) => c.instanceId === dfc!.instanceId);
    expect(flipped?.transformed).toBe(true);
    expect(flipped?.facedown).toBe(false);
    expect(flipped?.backImageUrl).toBe('https://example.com/ormendahl.jpg');
    expect(flipped?.backTypeLine).toBe('Legendary Creature — Demon');

    state = applyMatchAction(state, { type: 'flip', userId: playerId, instanceId: dfc!.instanceId });
    expect(state.players[0].battlefield.find((c) => c.instanceId === dfc!.instanceId)?.transformed).toBe(false);
  });

  it('puts a card on top, bottom, or Nth from top of the library', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Order',
            format: 'modern',
            mainboard: [
              { scryfallId: 'a', name: 'Alpha', quantity: 1 },
              { scryfallId: 'b', name: 'Bravo', quantity: 1 },
              { scryfallId: 'c', name: 'Charlie', quantity: 1 },
              { scryfallId: 'd', name: 'Delta', quantity: 1 },
              { scryfallId: 'e', name: 'Echo', quantity: 1 },
              { scryfallId: 'f', name: 'Foxtrot', quantity: 1 },
              { scryfallId: 'g', name: 'Golf', quantity: 1 },
              { scryfallId: 'h', name: 'Hotel', quantity: 1 },
            ],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const handCard = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: handCard.instanceId,
      from: 'hand',
      to: 'library',
      toTop: true,
    });
    expect(state.players[0].library[0].instanceId).toBe(handCard.instanceId);

    const nextHand = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: nextHand.instanceId,
      from: 'hand',
      to: 'library',
    });
    const lib = state.players[0].library;
    expect(lib[lib.length - 1].instanceId).toBe(nextHand.instanceId);

    const third = state.players[0].hand[0];
    const countBefore = state.players[0].library.length;
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: third.instanceId,
      from: 'hand',
      to: 'library',
      libraryPosition: 2,
    });
    expect(state.players[0].library[1].instanceId).toBe(third.instanceId);
    expect(state.players[0].library).toHaveLength(countBefore + 1);

    const lastHand = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: lastHand.instanceId,
      from: 'hand',
      to: 'library',
      libraryPosition: 99,
    });
    const after = state.players[0].library;
    expect(after[after.length - 1].instanceId).toBe(lastHand.instanceId);
  });

  it('shows and hides a hand, a card, and the library top to chosen viewers', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          displayName: 'A',
          deckSnapshot: {
            deckId: 'a',
            name: 'A',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
        seat({
          userId: 'u2',
          seatIndex: 1,
          displayName: 'B',
          deckSnapshot: {
            deckId: 'b',
            name: 'B',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const owner = () => state.players[0];
    const card = owner().hand[0];

    state = applyMatchAction(state, { type: 'showHand', userId: 'u1', viewerIds: ['u2'] });
    expect(canSeePlayerHand(owner(), 'u2')).toBe(true);
    expect(canSeePlayerHand(owner(), 'u3')).toBe(false);

    state = applyMatchAction(state, { type: 'hideHand', userId: 'u1' });
    expect(canSeePlayerHand(owner(), 'u2')).toBe(false);

    state = applyMatchAction(state, {
      type: 'showHandCard',
      userId: 'u1',
      instanceId: card.instanceId,
      viewerIds: ['*'],
    });
    expect(canSeeHandCard(owner(), card, 'u2')).toBe(true);
    expect(visibleOpponentHand(owner(), 'u2')).toHaveLength(1);

    state = applyMatchAction(state, { type: 'hideHandCard', userId: 'u1', instanceId: card.instanceId });
    expect(canSeeHandCard(owner(), card, 'u2')).toBe(false);

    state = applyMatchAction(state, { type: 'revealLibraryTop', userId: 'u1', viewerIds: ['u2'] });
    expect(canSeeLibraryTop(owner(), 'u2')).toBe(true);
    expect(canSeeLibraryTop(owner(), 'u1')).toBe(true);

    state = applyMatchAction(state, { type: 'hideLibraryTop', userId: 'u1' });
    expect(canSeeLibraryTop(owner(), 'u2')).toBe(false);

    state = applyMatchAction(state, { type: 'revealLibraryTop', userId: 'u1', viewerIds: ['u1'] });
    expect(canSeeLibraryTop(owner(), 'u1')).toBe(true);
    expect(canSeeLibraryTop(owner(), 'u2')).toBe(false);

    state = applyMatchAction(state, { type: 'revealLibraryTop', userId: 'u1', viewerIds: ['*'] });
    state = applyMatchAction(state, { type: 'shuffleLibrary', userId: 'u1' }, { random: () => 0.4 });
    expect(canSeeLibraryTop(owner(), 'u2')).toBe(false);
  });

  it('lets an opponent choose several cards in a hand, visible to the owner', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'a',
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
            deckId: 'b',
            name: 'B',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 }
    );
    const target = () => state.players[1];
    const first = target().hand[0];
    const second = target().hand[1];

    state = applyMatchAction(state, {
      type: 'chooseHandCard',
      userId: 'u1',
      ownerId: 'u2',
      instanceId: first.instanceId,
    });
    state = applyMatchAction(state, {
      type: 'chooseHandCard',
      userId: 'u1',
      ownerId: 'u2',
      instanceId: second.instanceId,
    });
    expect(isHandCardChosen(target(), first.instanceId)).toBe(true);
    expect(isHandCardChosen(target(), second.instanceId)).toBe(true);
    expect(target().chosenHandCards).toEqual([
      { instanceId: first.instanceId, by: 'u1' },
      { instanceId: second.instanceId, by: 'u1' },
    ]);

    const beforeOwn = state.version;
    state = applyMatchAction(state, {
      type: 'chooseHandCard',
      userId: 'u1',
      ownerId: 'u1',
      instanceId: state.players[0].hand[0].instanceId,
    });
    expect(state.version).toBe(beforeOwn);

    state = applyMatchAction(state, {
      type: 'chooseHandCard',
      userId: 'u1',
      ownerId: 'u2',
      instanceId: first.instanceId,
    });
    expect(isHandCardChosen(target(), first.instanceId)).toBe(false);
    expect(isHandCardChosen(target(), second.instanceId)).toBe(true);

    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u2',
      instanceId: second.instanceId,
      from: 'hand',
      to: 'graveyard',
    });
    expect(isHandCardChosen(target(), second.instanceId)).toBe(false);

    const third = target().hand[0];
    state = applyMatchAction(state, {
      type: 'chooseHandCard',
      userId: 'u1',
      ownerId: 'u2',
      instanceId: third.instanceId,
    });
    state = applyMatchAction(state, { type: 'clearHandChoices', userId: 'u1', ownerId: 'u2' });
    expect(target().chosenHandCards).toEqual([]);
  });

  it('attaches several auras or equipment to a host and clears them if the host leaves', () => {
    expect(isPlaymatAttachable({ typeLine: 'Enchantment — Aura' })).toBe(true);
    expect(isPlaymatAttachable({ typeLine: 'Artifact — Equipment' })).toBe(true);
    expect(isPlaymatAttachable({ typeLine: 'Enchantment' })).toBe(false);

    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Attach',
            format: 'modern',
            mainboard: [
              { scryfallId: 'bear', name: 'Grizzly Bears', quantity: 4, typeLine: 'Creature — Bear' },
              { scryfallId: 'umbra', name: 'Snake Umbra', quantity: 4, typeLine: 'Enchantment — Aura' },
              { scryfallId: 'sword', name: 'Sword of Fire and Ice', quantity: 4, typeLine: 'Artifact — Equipment' },
            ],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0.35 },
    );
    const owned = () => [...state.players[0].hand, ...state.players[0].library];
    const zoneOf = (instanceId: string) =>
      state.players[0].hand.some((card) => card.instanceId === instanceId) ? 'hand' : 'library';
    const creature = owned().find((card) => card.name === 'Grizzly Bears');
    const aura = owned().find((card) => card.name === 'Snake Umbra');
    const gear = owned().find((card) => card.name === 'Sword of Fire and Ice');
    expect(creature && aura && gear).toBeTruthy();

    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: creature!.instanceId,
      from: zoneOf(creature!.instanceId),
      to: 'battlefield',
    });
    state = applyMatchAction(state, {
      type: 'attachCard',
      userId: 'u1',
      instanceId: aura!.instanceId,
      hostInstanceId: creature!.instanceId,
    });
    state = applyMatchAction(state, {
      type: 'attachCard',
      userId: 'u1',
      instanceId: gear!.instanceId,
      hostInstanceId: creature!.instanceId,
    });

    const battlefield = state.players[0].battlefield;
    expect(battlefield.find((card) => card.instanceId === aura!.instanceId)?.attachedTo).toBe(creature!.instanceId);
    expect(battlefield.find((card) => card.instanceId === gear!.instanceId)?.attachedTo).toBe(creature!.instanceId);
    expect(attachmentsOn(creature!.instanceId, tableBattlefieldCards(state.players)).map((card) => card.name).sort()).toEqual([
      'Snake Umbra',
      'Sword of Fire and Ice',
    ]);
    expect(splitBattlefield(battlefield).enchantments).toHaveLength(0);
    expect(splitBattlefield(battlefield).other.map((card) => card.name)).toEqual(['Grizzly Bears']);

    state = applyMatchAction(state, {
      type: 'attachCard',
      userId: 'u1',
      instanceId: gear!.instanceId,
      hostInstanceId: null,
    });
    expect(state.players[0].battlefield.find((card) => card.instanceId === gear!.instanceId)?.attachedTo).toBeUndefined();

    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: creature!.instanceId,
      from: 'battlefield',
      to: 'graveyard',
    });
    expect(state.players[0].battlefield.find((card) => card.instanceId === aura!.instanceId)?.attachedTo).toBeUndefined();
    expect(state.players[0].graveyard.some((card) => card.instanceId === creature!.instanceId)).toBe(true);
  });

  it('lets the owner see facedown graveyard and exile cards while opponents see the back', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          displayName: 'A',
          deckSnapshot: {
            deckId: 'a',
            name: 'A',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
        seat({
          userId: 'u2',
          seatIndex: 1,
          displayName: 'B',
          deckSnapshot: {
            deckId: 'b',
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
    const card = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: card.instanceId,
      from: 'hand',
      to: 'graveyard',
      facedown: true,
    });
    const hidden = state.players[0].graveyard.find((item) => item.instanceId === card.instanceId);
    expect(hidden?.facedown).toBe(true);
    expect(canSeeGraveOrExileFace('u1', hidden!, 'u1')).toBe(true);
    expect(canSeeGraveOrExileFace('u1', hidden!, 'u2')).toBe(false);
    expect(filterPublicZoneCards(state.players[0].graveyard, 'bolt', 'u1', 'u2')).toHaveLength(0);
    expect(filterPublicZoneCards(state.players[0].graveyard, 'bolt', 'u1', 'u1').length).toBeGreaterThan(0);

    state = applyMatchAction(state, { type: 'setFacedown', userId: 'u1', instanceId: card.instanceId, facedown: false });
    expect(state.players[0].graveyard.find((item) => item.instanceId === card.instanceId)?.facedown).toBe(false);
    expect(canSeeGraveOrExileFace('u1', state.players[0].graveyard[0], 'u2')).toBe(true);

    const exileCard = state.players[0].hand[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: exileCard.instanceId,
      from: 'hand',
      to: 'exile',
      facedown: true,
    });
    expect(state.players[0].exile[0].facedown).toBe(true);
    expect(canSeeGraveOrExileFace('u1', state.players[0].exile[0], 'u2')).toBe(false);
  });

  it('adds, stacks, and clears counters on cards, keeping them across zones', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Counters',
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
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: card.instanceId,
      from: 'hand',
      to: 'battlefield',
    });
    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: card.instanceId,
      counterId: '+1/+1',
      delta: 2,
    });
    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: card.instanceId,
      counterId: '−1/−1',
      delta: 1,
    });
    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: card.instanceId,
      counterId: 'Charge',
      delta: 1,
    });
    let onBoard = state.players[0].battlefield.find((item) => item.instanceId === card.instanceId);
    expect(onBoard?.counters).toEqual({ '+1/+1': 2, '-1/-1': 1, Charge: 1 });

    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: card.instanceId,
      counterId: '+1/+1',
      delta: -1,
    });
    onBoard = state.players[0].battlefield.find((item) => item.instanceId === card.instanceId);
    expect(onBoard?.counters?.['+1/+1']).toBe(1);

    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: card.instanceId,
      from: 'battlefield',
      to: 'graveyard',
    });
    expect(state.players[0].graveyard.find((item) => item.instanceId === card.instanceId)?.counters).toEqual({
      '+1/+1': 1,
      '-1/-1': 1,
      Charge: 1,
    });

    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: card.instanceId,
      counterId: '*',
      delta: 0,
    });
    expect(state.players[0].graveyard.find((item) => item.instanceId === card.instanceId)?.counters).toBeUndefined();

    const libraryCard = state.players[0].library[0];
    const before = state.version;
    state = applyMatchAction(state, {
      type: 'setCounter',
      userId: 'u1',
      instanceId: libraryCard.instanceId,
      counterId: '+1/+1',
      delta: 1,
    });
    expect(state.version).toBe(before);
    expect(state.players[0].library[0].counters).toBeUndefined();
  });

  it('creates searchable tokens on the battlefield and can remove them', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Tokens',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 10 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 },
    );
    state = applyMatchAction(state, {
      type: 'addToken',
      userId: 'u1',
      quantity: 2,
      card: {
        scryfallId: 'saproling',
        name: 'Saproling',
        typeLine: 'Token Creature — Saproling',
        imageUrl: 'https://example.com/saproling.jpg',
      },
    });
    const tokens = state.players[0].battlefield.filter((card) => card.isToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((card) => card.name === 'Saproling' && card.facedown === false)).toBe(true);
    expect(new Set(tokens.map((card) => card.instanceId)).size).toBe(2);

    const first = tokens[0];
    state = applyMatchAction(state, {
      type: 'moveCard',
      userId: 'u1',
      instanceId: first.instanceId,
      from: 'battlefield',
      to: 'graveyard',
    });
    expect(state.players[0].battlefield.find((card) => card.instanceId === first.instanceId)).toBeUndefined();
    expect(state.players[0].graveyard.some((card) => card.instanceId === first.instanceId)).toBe(false);
    expect(state.players[0].graveyard.some((card) => card.isToken)).toBe(false);

    const remaining = state.players[0].battlefield.find((card) => card.isToken);
    expect(remaining).toBeTruthy();
    state = applyMatchAction(state, { type: 'removeToken', userId: 'u1', instanceId: remaining!.instanceId });
    expect(state.players[0].battlefield.filter((card) => card.isToken)).toHaveLength(0);

    const creature = state.players[0].hand[0];
    const version = state.version;
    state = applyMatchAction(state, { type: 'removeToken', userId: 'u1', instanceId: creature.instanceId });
    expect(state.version).toBe(version);
  });

  it('lets the owner scry cards to the top or bottom and surveil into the graveyard', () => {
    let state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          deckSnapshot: {
            deckId: 'd1',
            name: 'Look',
            format: 'modern',
            mainboard: [{ ...bolt, quantity: 12 }],
            commanders: [],
          },
        }),
      ],
      'modern',
      { random: () => 0 },
    );
    const first = state.players[0].library[0];
    const second = state.players[0].library[1];
    const third = state.players[0].library[2];
    state = applyMatchAction(state, {
      type: 'scry',
      userId: 'u1',
      count: 2,
      onTop: [second.instanceId],
      onBottom: [first.instanceId],
    });
    const afterScry = state.players[0].library;
    expect(afterScry[0].instanceId).toBe(second.instanceId);
    expect(afterScry[1].instanceId).toBe(third.instanceId);
    expect(afterScry[afterScry.length - 1].instanceId).toBe(first.instanceId);

    const top = afterScry[0];
    const next = afterScry[1];
    state = applyMatchAction(state, {
      type: 'surveil',
      userId: 'u1',
      count: 2,
      onTop: [next.instanceId],
      toGraveyard: [top.instanceId],
    });
    expect(state.players[0].library[0].instanceId).toBe(next.instanceId);
    expect(state.players[0].graveyard.map((card) => card.instanceId)).toContain(top.instanceId);
    expect(state.players[0].library.some((card) => card.instanceId === top.instanceId)).toBe(false);
  });

  it('ignores addSeat so dummy boards cannot be added', () => {
    const state = createInitialMatchState(
      [
        seat({
          userId: 'u1',
          seatIndex: 0,
          displayName: 'Host',
          deckSnapshot: {
            deckId: 'd1',
            name: 'Solo',
            format: 'commander',
            mainboard: [{ ...bolt, quantity: 12 }],
            commanders: [{ ...commander, quantity: 1 }],
          },
        }),
      ],
      'commander',
      { random: () => 0 },
    );
    expect(state.players).toHaveLength(1);
    const next = applyMatchAction(state, { type: 'addSeat', userId: 'u1', seatIndex: 1, displayName: 'Siège 2' }, { random: () => 0 });
    expect(next.players).toHaveLength(1);
    expect(next).toBe(state);
  });
});
