import type { DeckEntry } from '../types/deck';
import type { UserCard } from '../types/card';
import { userCardToDeckEntry } from './deckEntry';

export interface PrintAlternative {
  card: UserCard;
  entry: DeckEntry;
  /** Same scryfall printing as the deck entry */
  isCurrentPrint: boolean;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Find owned printings of the same card name that can replace a deck entry.
 * Prefers matching English oracle name; falls back to set+cn identity.
 */
export function findOwnedPrintAlternatives(
  deckEntry: DeckEntry,
  collectionCards: UserCard[]
): PrintAlternative[] {
  const targetName = normalizeName(deckEntry.name);
  if (!targetName) return [];

  const byScryfall = new Map<string, UserCard>();

  for (const card of collectionCards) {
    const cardName = normalizeName(card.name);
    const englishFromMtg = card.mtgData?.name ? normalizeName(card.mtgData.name) : '';
    const match =
      cardName === targetName ||
      englishFromMtg === targetName ||
      // Double-faced: match front face name
      cardName.split(' // ')[0] === targetName.split(' // ')[0];

    if (!match) continue;

    const sfId = card.mtgData?.id || '';
    const key = sfId || `${card.setCode || ''}|${card.collectorNumber || ''}|${card.id}`;
    const existing = byScryfall.get(key);
    if (!existing || (card.quantity || 0) > (existing.quantity || 0)) {
      byScryfall.set(key, card);
    }
  }

  const alts: PrintAlternative[] = [];
  for (const card of byScryfall.values()) {
    try {
      const entry = userCardToDeckEntry(card, deckEntry.quantity);
      // Preserve legality/cmc from deck entry if collection mtgData is thin
      if (!entry.legalities && deckEntry.legalities) entry.legalities = deckEntry.legalities;
      if (entry.cmc == null && deckEntry.cmc != null) entry.cmc = deckEntry.cmc;
      if (!entry.typeLine && deckEntry.typeLine) entry.typeLine = deckEntry.typeLine;

      alts.push({
        card,
        entry,
        isCurrentPrint: Boolean(
          deckEntry.scryfallId &&
            entry.scryfallId &&
            deckEntry.scryfallId === entry.scryfallId
        ),
      });
    } catch {
      /* skip cards without usable id */
    }
  }

  return alts.sort((a, b) => {
    if (a.isCurrentPrint !== b.isCurrentPrint) return a.isCurrentPrint ? -1 : 1;
    return a.entry.name.localeCompare(b.entry.name);
  });
}

/**
 * Cards in the deck that have at least one other owned printing.
 */
export function findSwappableEntries(
  entries: DeckEntry[],
  collectionCards: UserCard[]
): DeckEntry[] {
  return entries.filter((e) => {
    const alts = findOwnedPrintAlternatives(e, collectionCards);
    return alts.some((a) => !a.isCurrentPrint);
  });
}
