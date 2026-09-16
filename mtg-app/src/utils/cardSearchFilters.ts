import { normalizeSearchQueryToEnglish } from '../services/searchQueryNormalizer';

export const CARD_SEARCH_COLORS = ['W', 'U', 'B', 'R', 'G', 'Colorless'] as const;

export const CARD_SEARCH_RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;

export const CARD_SEARCH_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Planeswalker',
  'Battle',
  'Legendary',
  'Kindred',
] as const;

export const CARD_SEARCH_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
  { code: 'it', label: 'IT' },
  { code: 'pt', label: 'PT' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' },
  { code: 'zhs', label: 'ZHS' },
];

export const CARD_SEARCH_CREATURE_TYPES = [
  'Advisor',
  'Angel',
  'Assassin',
  'Barbarian',
  'Basilisk',
  'Bat',
  'Bear',
  'Beast',
  'Bird',
  'Cat',
  'Centaur',
  'Cleric',
  'Construct',
  'Demon',
  'Devil',
  'Dinosaur',
  'Dog',
  'Dragon',
  'Drake',
  'Druid',
  'Dwarf',
  'Eldrazi',
  'Elemental',
  'Elephant',
  'Elf',
  'Faerie',
  'Giant',
  'Goblin',
  'Golem',
  'Horror',
  'Human',
  'Hydra',
  'Illusion',
  'Insect',
  'Knight',
  'Merfolk',
  'Minotaur',
  'Monk',
  'Ninja',
  'Ogre',
  'Orc',
  'Phyrexian',
  'Pirate',
  'Plant',
  'Praetor',
  'Rogue',
  'Samurai',
  'Shaman',
  'Shapeshifter',
  'Snake',
  'Soldier',
  'Sphinx',
  'Spirit',
  'Treefolk',
  'Troll',
  'Vampire',
  'Wall',
  'Warlock',
  'Warrior',
  'Wizard',
  'Wolf',
  'Wurm',
  'Zombie',
] as const;

export interface CardSearchFilters {
  colors: string[];
  exclusiveColors: boolean;
  rarity: string | null;
  type: string | null;
  creatureType: string | null;
  language: string | null;
  set: string | null;
}

export const EMPTY_CARD_SEARCH_FILTERS: CardSearchFilters = {
  colors: [],
  exclusiveColors: false,
  rarity: null,
  type: null,
  creatureType: null,
  language: null,
  set: null,
};

export function hasActiveCardSearchFilters(filters: CardSearchFilters): boolean {
  return (
    filters.colors.length > 0 ||
    Boolean(filters.rarity) ||
    Boolean(filters.type) ||
    Boolean(filters.creatureType) ||
    Boolean(filters.language) ||
    Boolean(filters.set)
  );
}

function colorLetter(color: string): string {
  if (color.toUpperCase() === 'COLORLESS' || color.toUpperCase() === 'C') return 'c';
  return color[0].toLowerCase();
}

/**
 * Clauses Scryfall correspondant aux filtres de la collection
 * (couleurs en OU, mode exclusif = exactement ces couleurs).
 */
export function buildScryfallFilterClauses(filters?: Partial<CardSearchFilters> | null): string {
  if (!filters) return '';
  const parts: string[] = [];

  const colors = (filters.colors || []).map((c) => c.toUpperCase());
  if (colors.length > 0) {
    const letters = colors.map(colorLetter);
    if (filters.exclusiveColors) {
      const identity = [...new Set(letters)].sort().join('');
      parts.push(`c=${identity}`);
    } else {
      const orColors = letters.map((letter) => `c:${letter}`);
      parts.push(orColors.length === 1 ? orColors[0] : `(${orColors.join(' OR ')})`);
    }
  }

  if (filters.rarity) {
    parts.push(`r:${filters.rarity}`);
  }
  if (filters.type) {
    parts.push(`t:${filters.type.toLowerCase()}`);
  }
  if (filters.creatureType) {
    parts.push(`t:${filters.creatureType.toLowerCase()}`);
  }
  if (filters.language) {
    parts.push(`lang:${filters.language.toLowerCase()}`);
  }
  if (filters.set) {
    parts.push(`e:${filters.set.toLowerCase()}`);
  }

  return parts.join(' ');
}

export function isRawScryfallQuery(query: string): boolean {
  const q = query.trim();
  return q.startsWith('!"') || /(?:^|\s)[a-z][a-z0-9_-]*:/i.test(q);
}

export function deckEntryMatchesSearch(
  entry: {
    name: string;
    typeLine?: string;
    colors?: string[];
    colorIdentity?: string[];
    rarity?: string;
    setCode?: string;
  },
  query: string,
  filters: CardSearchFilters
): boolean {
  const q = query.trim().toLowerCase();
  if (q) {
    const normalized = normalizeSearchQueryToEnglish(query).toLowerCase();
    const blob = `${entry.name} ${entry.typeLine || ''}`.toLowerCase();
    if (!blob.includes(q) && (normalized === q || !blob.includes(normalized))) {
      return false;
    }
  }

  if (filters.colors.length > 0) {
    const cardColors = (entry.colors || entry.colorIdentity || []).map((c) => c.toUpperCase());
    const selected = filters.colors.map((c) => c.toUpperCase());
    const wantsColorless = selected.includes('COLORLESS') || selected.includes('C');
    const colorLetters = selected.filter((c) => c !== 'COLORLESS' && c !== 'C');

    if (filters.exclusiveColors) {
      if (wantsColorless && colorLetters.length === 0) {
        if (cardColors.length !== 0) return false;
      } else if (
        cardColors.length !== colorLetters.length ||
        !colorLetters.every((c) => cardColors.includes(c))
      ) {
        return false;
      }
    } else {
      const matchesColor = colorLetters.some((c) => cardColors.includes(c));
      const matchesColorless = wantsColorless && cardColors.length === 0;
      if (colorLetters.length > 0 && wantsColorless) {
        if (!matchesColor && !matchesColorless) return false;
      } else if (colorLetters.length > 0) {
        if (!matchesColor) return false;
      } else if (wantsColorless && !matchesColorless) {
        return false;
      }
    }
  }

  if (filters.rarity && (entry.rarity || '').toLowerCase() !== filters.rarity.toLowerCase()) {
    return false;
  }
  if (filters.type && !(entry.typeLine || '').toLowerCase().includes(filters.type.toLowerCase())) {
    return false;
  }
  if (
    filters.creatureType &&
    !(entry.typeLine || '').toLowerCase().includes(filters.creatureType.toLowerCase())
  ) {
    return false;
  }
  if (filters.set && (entry.setCode || '').toLowerCase() !== filters.set.toLowerCase()) {
    return false;
  }

  return true;
}

export function userCardMatchesSearch(
  card: {
    name: string;
    language?: string;
    rarity?: string;
    set?: string;
    setCode?: string;
    mtgData?: {
      name?: string;
      type?: string;
      types?: string[];
      subtypes?: string[];
      text?: string;
      colors?: string[];
      colorIdentity?: string[];
      rarity?: string;
      set?: string;
      foreignNames?: Array<{ name?: string; text?: string; type?: string }>;
    };
  },
  query: string,
  filters: CardSearchFilters
): boolean {
  if (filters.language) {
    const lang = (card.language || 'en').toLowerCase();
    if (lang !== filters.language.toLowerCase()) return false;
  }

  const q = query.trim().toLowerCase();
  if (q) {
    const normalized = normalizeSearchQueryToEnglish(query).toLowerCase();
    const french = (card.mtgData?.foreignNames || [])
      .map((fn) => `${fn.name || ''} ${fn.text || ''} ${fn.type || ''}`)
      .join(' ');
    const blob = [
      card.name,
      card.mtgData?.name,
      card.mtgData?.type,
      (card.mtgData?.subtypes || []).join(' '),
      card.mtgData?.text,
      french,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!blob.includes(q) && (normalized === q || !blob.includes(normalized))) {
      return false;
    }
  }

  return deckEntryMatchesSearch(
    {
      name: card.name,
      typeLine: card.mtgData?.type,
      colors: card.mtgData?.colors,
      colorIdentity: card.mtgData?.colorIdentity,
      rarity: card.rarity || card.mtgData?.rarity,
      setCode: card.setCode || card.set || card.mtgData?.set,
    },
    '',
    { ...filters, language: null }
  );
}
