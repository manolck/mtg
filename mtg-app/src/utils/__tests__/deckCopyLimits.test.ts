import {
  maxCopiesForEntry,
  parseCopyLimitFromOracleText,
} from '../deckCopyLimits';
import { validateDeck } from '../../services/deckFormatRules';
import type { Deck } from '../../types/deck';
import { emptyDeckCards } from '../../types/deck';

const SEVEN_DWARVES_TEXT =
  'Seven Dwarves gets +1/+1 for each other creature named Seven Dwarves you control. A deck can have up to seven cards named Seven Dwarves.';

const RELENTLESS_RATS_TEXT =
  'Relentless Rats gets +1/+1 for each other creature named Relentless Rats you control. A deck can have any number of cards named Relentless Rats.';

const NAZGUL_TEXT =
  'A deck can have up to nine cards named Nazgûl.';

describe('parseCopyLimitFromOracleText', () => {
  it('detects any-number exceptions', () => {
    expect(parseCopyLimitFromOracleText(RELENTLESS_RATS_TEXT)).toBe(Number.POSITIVE_INFINITY);
    expect(
      parseCopyLimitFromOracleText(
        'A deck can have any number of cards named Hare Apparent.'
      )
    ).toBe(Number.POSITIVE_INFINITY);
    expect(
      parseCopyLimitFromOracleText(
        'Draw two cards. A deck can have any number of cards named Sphinx\'s Approach.'
      )
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('detects capped exceptions from number words', () => {
    expect(parseCopyLimitFromOracleText(SEVEN_DWARVES_TEXT)).toBe(7);
    expect(parseCopyLimitFromOracleText(NAZGUL_TEXT)).toBe(9);
  });

  it('detects capped exceptions from digits', () => {
    expect(
      parseCopyLimitFromOracleText('A deck can have up to 7 cards named Seven Dwarves.')
    ).toBe(7);
  });

  it('returns null when no exception', () => {
    expect(parseCopyLimitFromOracleText('Deal 3 damage to any target.')).toBeNull();
    expect(parseCopyLimitFromOracleText('')).toBeNull();
    expect(parseCopyLimitFromOracleText(undefined)).toBeNull();
  });
});

describe('maxCopiesForEntry', () => {
  it('allows 7 Seven Dwarves in modern and commander', () => {
    const entry = {
      name: 'Seven Dwarves',
      typeLine: 'Creature — Dwarf',
      oracleText: SEVEN_DWARVES_TEXT,
    };
    expect(maxCopiesForEntry(entry, 'modern')).toBe(7);
    expect(maxCopiesForEntry(entry, 'commander')).toBe(7);
  });

  it('allows unlimited Relentless Rats in commander', () => {
    expect(
      maxCopiesForEntry(
        {
          name: 'Relentless Rats',
          typeLine: 'Creature — Rat',
          oracleText: RELENTLESS_RATS_TEXT,
        },
        'commander'
      )
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('defaults to singleton / four-of without oracle exception', () => {
    const bolt = { name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Deal 3 damage.' };
    expect(maxCopiesForEntry(bolt, 'commander')).toBe(1);
    expect(maxCopiesForEntry(bolt, 'modern')).toBe(4);
  });

  it('allows unlimited basic lands', () => {
    expect(
      maxCopiesForEntry(
        { name: 'Forest', typeLine: 'Basic Land — Forest' },
        'commander'
      )
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('validateDeck copy limits', () => {
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

  it('allows 7 Seven Dwarves in modern share mode', () => {
    const result = validateDeck(
      baseDeck({
        cards: {
          mainboard: [
            {
              scryfallId: 'sd',
              name: 'Seven Dwarves',
              quantity: 7,
              oracleText: SEVEN_DWARVES_TEXT,
            },
            ...Array.from({ length: 53 }, (_, i) => ({
              scryfallId: `f${i}`,
              name: `Filler ${i}`,
              quantity: 1,
            })),
          ],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'share'
    );
    expect(result.errors.some((e) => e.code === 'copy_limit')).toBe(false);
  });

  it('flags 8 Seven Dwarves', () => {
    const result = validateDeck(
      baseDeck({
        cards: {
          mainboard: [
            {
              scryfallId: 'sd',
              name: 'Seven Dwarves',
              quantity: 8,
              oracleText: SEVEN_DWARVES_TEXT,
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'draft'
    );
    expect(result.warnings.some((e) => e.code === 'copy_limit')).toBe(true);
  });

  it('allows multiple Seven Dwarves in commander (oracle overrides singleton)', () => {
    const result = validateDeck(
      baseDeck({
        format: 'commander',
        commanders: [{ scryfallId: 'cmd', name: 'Krenko, Mob Boss', quantity: 1, colorIdentity: ['R'] }],
        cards: {
          mainboard: [
            {
              scryfallId: 'sd',
              name: 'Seven Dwarves',
              quantity: 7,
              oracleText: SEVEN_DWARVES_TEXT,
              colorIdentity: ['R'],
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'draft'
    );
    expect(result.warnings.some((w) => w.code === 'copy_limit')).toBe(false);
  });

  it('still flags normal duplicates in commander', () => {
    const result = validateDeck(
      baseDeck({
        format: 'commander',
        commanders: [{ scryfallId: 'cmd', name: 'Krenko, Mob Boss', quantity: 1, colorIdentity: ['R'] }],
        cards: {
          mainboard: [
            {
              scryfallId: 'sr',
              name: 'Sol Ring',
              quantity: 2,
              oracleText: '{T}: Add {C}{C}.',
            },
          ],
          sideboard: [],
          maybeboard: [],
        },
      }),
      'draft'
    );
    expect(result.warnings.some((w) => w.code === 'copy_limit')).toBe(true);
  });
});
