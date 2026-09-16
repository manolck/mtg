import {
  buildScryfallFilterClauses,
  deckEntryMatchesSearch,
  EMPTY_CARD_SEARCH_FILTERS,
  hasActiveCardSearchFilters,
  isRawScryfallQuery,
  userCardMatchesSearch,
} from '../cardSearchFilters';

describe('cardSearchFilters', () => {
  it('builds OR color clauses like the collection filter', () => {
    expect(
      buildScryfallFilterClauses({
        ...EMPTY_CARD_SEARCH_FILTERS,
        colors: ['W', 'U'],
      })
    ).toBe('(c:w OR c:u)');
  });

  it('builds exclusive colors and rarity/type/set', () => {
    expect(
      buildScryfallFilterClauses({
        colors: ['R', 'G'],
        exclusiveColors: true,
        rarity: 'rare',
        type: 'Creature',
        creatureType: 'Elf',
        language: 'fr',
        set: 'mh3',
      })
    ).toBe('c=gr r:rare t:creature t:elf lang:fr e:mh3');
  });

  it('treats colorless as c:c', () => {
    expect(
      buildScryfallFilterClauses({
        ...EMPTY_CARD_SEARCH_FILTERS,
        colors: ['Colorless'],
      })
    ).toBe('c:c');
  });

  it('detects raw Scryfall queries used by deck import', () => {
    expect(isRawScryfallQuery('!"Lightning Bolt" set:m10 cn:146')).toBe(true);
    expect(isRawScryfallQuery('bolt')).toBe(false);
  });

  it('reports whether any filter is active', () => {
    expect(hasActiveCardSearchFilters(EMPTY_CARD_SEARCH_FILTERS)).toBe(false);
    expect(hasActiveCardSearchFilters({ ...EMPTY_CARD_SEARCH_FILTERS, rarity: 'mythic' })).toBe(
      true
    );
  });

  it('filters a deck entry by name, type and colors', () => {
    const kaalia = {
      name: 'Kaalia of the Vast',
      typeLine: 'Legendary Creature — Human Cleric',
      colors: ['R', 'W', 'B'],
      rarity: 'mythic',
      setCode: 'cma',
    };
    expect(deckEntryMatchesSearch(kaalia, 'kaalia', EMPTY_CARD_SEARCH_FILTERS)).toBe(true);
    expect(deckEntryMatchesSearch(kaalia, 'dragon', EMPTY_CARD_SEARCH_FILTERS)).toBe(false);
    expect(
      deckEntryMatchesSearch(kaalia, '', { ...EMPTY_CARD_SEARCH_FILTERS, type: 'Creature' })
    ).toBe(true);
    expect(
      deckEntryMatchesSearch(kaalia, '', { ...EMPTY_CARD_SEARCH_FILTERS, creatureType: 'Dragon' })
    ).toBe(false);
    expect(
      deckEntryMatchesSearch(kaalia, '', { ...EMPTY_CARD_SEARCH_FILTERS, colors: ['W'] })
    ).toBe(true);
  });

  it('matches collection cards on oracle text, language and set', () => {
    const bolt = {
      name: 'Lightning Bolt',
      language: 'en',
      setCode: 'lea',
      mtgData: {
        name: 'Lightning Bolt',
        type: 'Instant',
        text: 'Lightning Bolt deals 3 damage to any target.',
        colors: ['R'],
        rarity: 'common',
        set: 'lea',
      },
    };
    expect(userCardMatchesSearch(bolt, 'damage', EMPTY_CARD_SEARCH_FILTERS)).toBe(true);
    expect(
      userCardMatchesSearch(bolt, '', { ...EMPTY_CARD_SEARCH_FILTERS, language: 'fr' })
    ).toBe(false);
    expect(
      userCardMatchesSearch(bolt, '', { ...EMPTY_CARD_SEARCH_FILTERS, colors: ['R'] })
    ).toBe(true);
  });
});
