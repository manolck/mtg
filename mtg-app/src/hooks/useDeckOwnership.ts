import { useMemo } from 'react';
import type { Deck, DeckEntry } from '../types/deck';
import type { UserCard } from '../types/card';
import { allDeckEntries } from '../types/deck';

export interface OwnershipRow {
  entry: DeckEntry;
  neededQty: number;
  ownedQty: number;
  missingQty: number;
}

export interface DeckOwnershipStats {
  rows: OwnershipRow[];
  totalNeeded: number;
  totalOwned: number;
  totalMissing: number;
  completionPercent: number;
  missing: OwnershipRow[];
}

function ownershipKey(entry: {
  scryfallId?: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
}): string {
  if (entry.scryfallId && !entry.scryfallId.startsWith('legacy:')) {
    return `sf:${entry.scryfallId}`;
  }
  return `n:${entry.name.toLowerCase()}|${(entry.setCode || '').toLowerCase()}|${entry.collectorNumber || ''}`;
}

/**
 * Compare decklist needs against the user's collection cards.
 * Matches by scryfallId first, then name+set+collectorNumber.
 */
export function computeDeckOwnership(
  deck: Pick<Deck, 'cards' | 'commanders'>,
  collectionCards: UserCard[]
): DeckOwnershipStats {
  const ownedMap = new Map<string, number>();

  for (const card of collectionCards) {
    const sfId = card.mtgData?.id;
    const qty = card.quantity || 1;
    if (sfId) {
      const k = `sf:${sfId}`;
      ownedMap.set(k, (ownedMap.get(k) || 0) + qty);
    }
    const nk = `n:${card.name.toLowerCase()}|${(card.setCode || card.set || '').toLowerCase()}|${card.collectorNumber || ''}`;
    ownedMap.set(nk, (ownedMap.get(nk) || 0) + qty);
    // Also accumulate by name only for loose match fallback
    const nameOnly = `name:${card.name.toLowerCase()}`;
    ownedMap.set(nameOnly, (ownedMap.get(nameOnly) || 0) + qty);
  }

  // Aggregate deck needs by identity (main + side + commanders; exclude maybeboard for "must have")
  const needMap = new Map<string, DeckEntry>();
  const zones = [
    ...(deck.commanders || []),
    ...(deck.cards?.mainboard || []),
    ...(deck.cards?.sideboard || []),
  ];

  for (const entry of zones) {
    const key = ownershipKey(entry);
    const existing = needMap.get(key);
    if (existing) {
      needMap.set(key, { ...existing, quantity: existing.quantity + entry.quantity });
    } else {
      needMap.set(key, { ...entry });
    }
  }

  const rows: OwnershipRow[] = [];
  let totalNeeded = 0;
  let totalOwnedTowardDeck = 0;

  for (const [, entry] of needMap) {
    const key = ownershipKey(entry);
    let owned =
      ownedMap.get(key) ??
      ownedMap.get(`name:${entry.name.toLowerCase()}`) ??
      0;
    // Avoid double-counting name-only if scryfall key already used — use min with needed
    const ownedQty = Math.min(owned, entry.quantity);
    const missingQty = Math.max(0, entry.quantity - owned);
    rows.push({
      entry,
      neededQty: entry.quantity,
      ownedQty: owned,
      missingQty,
    });
    totalNeeded += entry.quantity;
    totalOwnedTowardDeck += ownedQty;
  }

  const missing = rows.filter((r) => r.missingQty > 0);
  const totalMissing = missing.reduce((s, r) => s + r.missingQty, 0);
  const completionPercent =
    totalNeeded === 0 ? 100 : Math.round((totalOwnedTowardDeck / totalNeeded) * 100);

  return {
    rows,
    totalNeeded,
    totalOwned: totalOwnedTowardDeck,
    totalMissing,
    completionPercent,
    missing,
  };
}

export function useDeckOwnership(
  deck: Pick<Deck, 'cards' | 'commanders'> | null | undefined,
  collectionCards: UserCard[]
): DeckOwnershipStats {
  return useMemo(() => {
    if (!deck) {
      return {
        rows: [],
        totalNeeded: 0,
        totalOwned: 0,
        totalMissing: 0,
        completionPercent: 100,
        missing: [],
      };
    }
    return computeDeckOwnership(deck, collectionCards);
  }, [deck, collectionCards]);
}

/** Flatten unique entries for price estimation */
export function deckEntriesForPricing(deck: Pick<Deck, 'cards' | 'commanders'>): DeckEntry[] {
  return allDeckEntries(deck);
}
