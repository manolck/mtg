import {
  distributeCounts,
  parseColoredPips,
  recommendLandCount,
  suggestBasicLands,
} from '../autoLands';
import type { Deck } from '../../types/deck';
import { emptyDeckCards } from '../../types/deck';

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Test',
    userId: 'u1',
    format: 'commander',
    visibility: 'private',
    cards: emptyDeckCards(),
    commanders: [],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('autoLands', () => {
  it('counts colored pips including hybrids', () => {
    expect(parseColoredPips('{2}{W}{W}{B}')).toEqual({ W: 2, U: 0, B: 1, R: 0, G: 0 });
    expect(parseColoredPips('{W/U}')).toEqual({ W: 0.5, U: 0.5, B: 0, R: 0, G: 0 });
    expect(parseColoredPips('{W/P}')).toEqual({ W: 1, U: 0, B: 0, R: 0, G: 0 });
  });

  it('recommends more lands for a higher curve', () => {
    expect(recommendLandCount('commander', 3)).toBe(36);
    expect(recommendLandCount('commander', 4)).toBeGreaterThan(recommendLandCount('commander', 3));
    expect(recommendLandCount('modern', 3)).toBe(24);
  });

  it('distributes with largest remainder', () => {
    expect(distributeCounts(10, { R: 2, W: 1, B: 1 })).toEqual({ R: 5, B: 3, W: 2 });
  });

  it('suggests basics from commander identity and spell pips', () => {
    const result = suggestBasicLands(
      deck({
        commanders: [
          {
            scryfallId: 'kaalia',
            name: 'Kaalia of the Vast',
            quantity: 1,
            cmc: 5,
            manaCost: '{4}{R}{W}{B}',
            colorIdentity: ['W', 'B', 'R'],
            typeLine: 'Legendary Creature — Angel',
          },
        ],
        cards: {
          mainboard: [
            {
              scryfallId: 'bolt',
              name: 'Lightning Bolt',
              quantity: 1,
              cmc: 1,
              manaCost: '{R}',
              colors: ['R'],
              colorIdentity: ['R'],
              typeLine: 'Instant',
            },
            {
              scryfallId: 'path',
              name: 'Path to Exile',
              quantity: 1,
              cmc: 1,
              manaCost: '{W}',
              colors: ['W'],
              colorIdentity: ['W'],
              typeLine: 'Instant',
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      })
    );
    expect(result.reason).toBe('ok');
    expect(result.toAdd).toBeGreaterThan(0);
    expect(result.basics.every((b) => ['Plains', 'Swamp', 'Mountain'].includes(b.name))).toBe(true);
    const mountains = result.basics.find((b) => b.name === 'Mountain')?.quantity || 0;
    const islands = result.basics.find((b) => b.name === 'Island');
    expect(islands).toBeUndefined();
    expect(mountains).toBeGreaterThan(0);
    expect(result.basics.reduce((sum, b) => sum + b.quantity, 0)).toBe(result.toAdd);
  });

  it('uses Wastes when identity is colorless', () => {
    const result = suggestBasicLands(
      deck({
        commanders: [
          {
            scryfallId: 'k',
            name: 'Kozilek, the Great Distortion',
            quantity: 1,
            cmc: 10,
            manaCost: '{8}{C}{C}',
            colorIdentity: [],
            typeLine: 'Legendary Creature — Eldrazi',
          },
        ],
        cards: {
          mainboard: [
            {
              scryfallId: 'sol',
              name: 'Sol Ring',
              quantity: 1,
              cmc: 1,
              manaCost: '{1}',
              typeLine: 'Artifact',
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      })
    );
    expect(result.basics).toEqual([
      expect.objectContaining({ name: 'Wastes', quantity: result.toAdd }),
    ]);
  });

  it('does not add lands when the base is already large enough', () => {
    const result = suggestBasicLands(
      deck({
        format: 'modern',
        cards: {
          mainboard: [
            {
              scryfallId: 'bolt',
              name: 'Lightning Bolt',
              quantity: 4,
              cmc: 1,
              manaCost: '{R}',
              colorIdentity: ['R'],
              typeLine: 'Instant',
            },
            {
              scryfallId: 'm',
              name: 'Mountain',
              quantity: 40,
              typeLine: 'Basic Land — Mountain',
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      })
    );
    expect(result.reason).toBe('already_enough');
    expect(result.toAdd).toBe(0);
    expect(result.basics).toEqual([]);
  });
});
