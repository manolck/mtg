import { validateDeck } from '../deckFormatRules';
import { parseDecklistText, exportDecklistText } from '../decklistParser';
import type { Deck } from '../../types/deck';
import { emptyDeckCards } from '../../types/deck';
import { computeDeckOwnership } from '../../hooks/useDeckOwnership';
import type { UserCard } from '../../types/card';

function baseDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Test',
    userId: 'u1',
    format: 'modern',
    visibility: 'private',
    cards: emptyDeckCards(),
    commanders: [],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('deckFormatRules', () => {
  it('warns when modern deck is under 60 in draft mode', () => {
    const result = validateDeck(
      baseDeck({
        cards: {
          mainboard: [{ scryfallId: '1', name: 'Bolt', quantity: 4 }],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'draft'
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === 'min_size')).toBe(true);
  });

  it('errors when modern deck is under 60 in share mode', () => {
    const result = validateDeck(
      baseDeck({
        cards: {
          mainboard: [{ scryfallId: '1', name: 'Bolt', quantity: 4 }],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'share'
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((w) => w.code === 'min_size')).toBe(true);
  });

  it('requires commander and exact 100 for commander share', () => {
    const result = validateDeck(
      baseDeck({
        format: 'commander',
        commanders: [],
        cards: {
          mainboard: Array.from({ length: 99 }, (_, i) => ({
            scryfallId: `c${i}`,
            name: `Card ${i}`,
            quantity: 1,
          })),
          sideboard: [],
          maybeboard: [],
        },
      }),
      'share'
    );
    expect(result.errors.some((e) => e.code === 'commander_required')).toBe(true);
  });
});

describe('decklistParser', () => {
  it('parses quantities and zones', () => {
    const lines = parseDecklistText(`Deck
4 Lightning Bolt
1 Sol Ring (C21) 7

Sideboard
2 Rest in Peace
`);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 4, name: 'Lightning Bolt', zone: 'mainboard' }),
        expect.objectContaining({
          quantity: 1,
          name: 'Sol Ring',
          setCode: 'c21',
          collectorNumber: '7',
        }),
        expect.objectContaining({ quantity: 2, name: 'Rest in Peace', zone: 'sideboard' }),
      ])
    );
  });

  it('round-trips export', () => {
    const text = exportDecklistText({
      mainboard: [{ scryfallId: '1', name: 'Lightning Bolt', quantity: 4 }],
      sideboard: [{ scryfallId: '2', name: 'Rest in Peace', quantity: 2 }],
    });
    expect(text).toContain('4 Lightning Bolt');
    expect(text).toContain('Sideboard');
    expect(text).toContain('2 Rest in Peace');
  });
});

describe('computeDeckOwnership', () => {
  it('computes missing quantities', () => {
    const deck = baseDeck({
      cards: {
        mainboard: [{ scryfallId: 'sf-1', name: 'Lightning Bolt', quantity: 4 }],
        sideboard: [],
        maybeboard: [],
      },
    });
    const collection: UserCard[] = [
      {
        id: 'i1',
        name: 'Lightning Bolt',
        quantity: 2,
        userId: 'u1',
        createdAt: new Date(),
        mtgData: { id: 'sf-1', name: 'Lightning Bolt' },
      },
    ];
    const stats = computeDeckOwnership(deck, collection);
    expect(stats.totalNeeded).toBe(4);
    expect(stats.totalOwned).toBe(2);
    expect(stats.totalMissing).toBe(2);
    expect(stats.missing[0].missingQty).toBe(2);
  });
});
