import type { DeckEntry } from '../types/deck';
import { countEntries } from '../types/deck';

export type DeckTypeGroupId =
  | 'commander'
  | 'creature'
  | 'planeswalker'
  | 'instant'
  | 'sorcery'
  | 'artifact'
  | 'enchantment'
  | 'battle'
  | 'land'
  | 'other';

export const DECK_TYPE_GROUP_ORDER: DeckTypeGroupId[] = [
  'commander',
  'creature',
  'planeswalker',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'battle',
  'land',
  'other',
];

export const DECK_TYPE_GROUP_LABELS: Record<DeckTypeGroupId, string> = {
  commander: 'Commanders',
  creature: 'Creatures',
  planeswalker: 'Planeswalkers',
  instant: 'Instants',
  sorcery: 'Sorceries',
  artifact: 'Artifacts',
  enchantment: 'Enchantments',
  battle: 'Battles',
  land: 'Lands',
  other: 'Other',
};

export interface DeckTypeGroup {
  id: DeckTypeGroupId;
  label: string;
  entries: DeckEntry[];
  count: number;
}

/** Classify a card from its type line (Scryfall-style). */
export function getDeckEntryTypeGroup(
  entry: DeckEntry,
  options?: { isCommanderZone?: boolean }
): DeckTypeGroupId {
  if (options?.isCommanderZone) return 'commander';

  const type = (entry.typeLine || '').toLowerCase();
  if (!type) return 'other';

  // Land before creature (e.g. creature land still often grouped as land in builders
  // when primary is Land — prefer Land if "land" appears as a type)
  if (/\bland\b/.test(type)) return 'land';
  if (/\bcreature\b/.test(type)) return 'creature';
  if (/\bplaneswalker\b/.test(type)) return 'planeswalker';
  if (/\bbattle\b/.test(type)) return 'battle';
  if (/\binstant\b/.test(type)) return 'instant';
  if (/\bsorcery\b/.test(type)) return 'sorcery';
  if (/\benchantment\b/.test(type)) return 'enchantment';
  if (/\bartifact\b/.test(type)) return 'artifact';
  return 'other';
}

function sortEntries(a: DeckEntry, b: DeckEntry): number {
  const cmcA = a.cmc ?? 999;
  const cmcB = b.cmc ?? 999;
  if (cmcA !== cmcB) return cmcA - cmcB;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

/**
 * Group deck entries by card type for builder display.
 * Pass isCommanderZone when rendering the commanders tab.
 */
export function groupDeckEntries(
  entries: DeckEntry[],
  options?: { isCommanderZone?: boolean }
): DeckTypeGroup[] {
  const buckets = new Map<DeckTypeGroupId, DeckEntry[]>();

  for (const entry of entries) {
    const id = getDeckEntryTypeGroup(entry, options);
    const list = buckets.get(id) || [];
    list.push(entry);
    buckets.set(id, list);
  }

  const groups: DeckTypeGroup[] = [];
  for (const id of DECK_TYPE_GROUP_ORDER) {
    const list = buckets.get(id);
    if (!list?.length) continue;
    const sorted = [...list].sort(sortEntries);
    groups.push({
      id,
      label: DECK_TYPE_GROUP_LABELS[id],
      entries: sorted,
      count: countEntries(sorted),
    });
  }
  return groups;
}
