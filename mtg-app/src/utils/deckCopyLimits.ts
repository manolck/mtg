import type { DeckEntry, DeckFormat } from '../types/deck';

/**
 * English number words used in Oracle deckbuilding lines
 * ("A deck can have up to seven cards named…").
 */
const ORACLE_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
]);

/** Unlimited copies (any number of cards named …). */
const ANY_NUMBER_RE =
  /\b(?:a|your)\s+deck\s+can\s+have\s+any\s+number\s+of\s+cards?\s+named\b/i;

/** Capped exception (up to seven / nine / 7 …). */
const UP_TO_RE =
  /\b(?:a|your)\s+deck\s+can\s+have\s+up\s+to\s+([a-z0-9-]+)\s+cards?\s+named\b/i;

function parseOracleNumber(token: string): number | null {
  const raw = token.trim().toLowerCase();
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return ORACLE_NUMBER_WORDS[raw] ?? null;
}

/**
 * Reads deck-construction exceptions from English Oracle text.
 * Returns:
 * - Infinity → "any number of cards named …"
 * - N → "up to N cards named …"
 * - null → no exception found
 */
export function parseCopyLimitFromOracleText(oracleText?: string | null): number | null {
  if (!oracleText?.trim()) return null;
  const text = oracleText.replace(/\s+/g, ' ');

  if (ANY_NUMBER_RE.test(text)) {
    return Number.POSITIVE_INFINITY;
  }

  const capped = text.match(UP_TO_RE);
  if (capped?.[1]) {
    return parseOracleNumber(capped[1]);
  }

  return null;
}

export function isBasicLandEntry(entry: Pick<DeckEntry, 'name' | 'typeLine'>): boolean {
  const name = entry.name.trim().toLowerCase();
  if (BASIC_LAND_NAMES.has(name)) return true;
  const type = (entry.typeLine || '').toLowerCase();
  return type.includes('basic') && type.includes('land');
}

/**
 * Max legal copies for a card in the given format.
 * Priority: basic land → Oracle deckbuilding line → format default (1 Commander / 4 else).
 */
export function maxCopiesForEntry(
  entry: Pick<DeckEntry, 'name' | 'typeLine' | 'oracleText'>,
  format: DeckFormat
): number {
  if (isBasicLandEntry(entry)) {
    return Number.POSITIVE_INFINITY;
  }

  const fromOracle = parseCopyLimitFromOracleText(entry.oracleText);
  if (fromOracle != null && fromOracle > 0) {
    return fromOracle;
  }

  return format === 'commander' ? 1 : 4;
}

export function formatCopyLimitLabel(limit: number): string {
  if (!Number.isFinite(limit)) return 'un nombre illimité';
  return `Maximum ${limit}`;
}
