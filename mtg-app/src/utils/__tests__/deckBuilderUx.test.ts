import { groupDeckEntries, getDeckEntryTypeGroup } from '../deckGrouping';
import {
  createSampleHand,
  mulliganSampleHand,
  drawSampleCard,
  shuffleCards,
} from '../sampleHand';
import type { DeckEntry } from '../../types/deck';

describe('deckGrouping', () => {
  it('classifies type lines', () => {
    expect(getDeckEntryTypeGroup({ scryfallId: '1', name: 'Bear', quantity: 1, typeLine: 'Creature — Bear' })).toBe(
      'creature'
    );
    expect(getDeckEntryTypeGroup({ scryfallId: '2', name: 'Bolt', quantity: 1, typeLine: 'Instant' })).toBe(
      'instant'
    );
    expect(
      getDeckEntryTypeGroup({ scryfallId: '3', name: 'Forest', quantity: 1, typeLine: 'Basic Land — Forest' })
    ).toBe('land');
    expect(
      getDeckEntryTypeGroup(
        { scryfallId: '4', name: 'Atraxa', quantity: 1, typeLine: 'Legendary Creature' },
        { isCommanderZone: true }
      )
    ).toBe('commander');
  });

  it('groups and sorts by cmc then name', () => {
    const entries: DeckEntry[] = [
      { scryfallId: 'a', name: 'Zap', quantity: 2, typeLine: 'Instant', cmc: 1 },
      { scryfallId: 'b', name: 'Grizzly Bears', quantity: 1, typeLine: 'Creature — Bear', cmc: 2 },
      { scryfallId: 'c', name: 'Plains', quantity: 4, typeLine: 'Basic Land — Plains', cmc: 0 },
      { scryfallId: 'd', name: 'Ancestral Recall', quantity: 1, typeLine: 'Instant', cmc: 1 },
    ];
    const groups = groupDeckEntries(entries);
    expect(groups.map((g) => g.id)).toEqual(['creature', 'instant', 'land']);
    expect(groups.find((g) => g.id === 'instant')?.entries.map((e) => e.name)).toEqual([
      'Ancestral Recall',
      'Zap',
    ]);
    expect(groups.find((g) => g.id === 'land')?.count).toBe(4);
  });
});

describe('sampleHand', () => {
  const mainboard: DeckEntry[] = [
    { scryfallId: '1', name: 'Lightning Bolt', quantity: 4, cmc: 1, typeLine: 'Instant' },
    { scryfallId: '2', name: 'Mountain', quantity: 16, cmc: 0, typeLine: 'Basic Land — Mountain' },
    { scryfallId: '3', name: 'Goblin Guide', quantity: 4, cmc: 1, typeLine: 'Creature — Goblin' },
  ];

  it('draws 7 cards and leaves the rest in library', () => {
    let i = 0;
    const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.15, 0.85, 0.25, 0.75, 0.35, 0.65, 0.45, 0.55, 0.05, 0.95, 0.12, 0.88, 0.22, 0.78, 0.32];
    const random = () => seq[i++ % seq.length];
    const state = createSampleHand(mainboard, { random });
    expect(state.hand).toHaveLength(7);
    expect(state.library).toHaveLength(24 - 7);
    expect(state.mulliganCount).toBe(0);
  });

  it('mulligan reduces hand after putting cards on bottom', () => {
    const state = createSampleHand(mainboard, { random: () => 0.5 });
    const after = mulliganSampleHand(state, { random: () => 0.3 });
    expect(after.mulliganCount).toBe(1);
    expect(after.hand.length).toBe(6);
    expect(after.hand.length + after.library.length).toBe(24);
  });

  it('draw adds one card from library', () => {
    const state = createSampleHand(mainboard);
    const after = drawSampleCard(state);
    expect(after.hand.length).toBe(state.hand.length + 1);
    expect(after.library.length).toBe(state.library.length - 1);
  });

  it('shuffle preserves elements', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffleCards(arr).sort()).toEqual(arr);
  });
});
