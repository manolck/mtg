import type { MTGCard } from '../types/card';

/** Build a minimal MTGCard from a deck entry for wishlist enrichment. */
export function deckEntryAsMtgCard(entry: {
  scryfallId: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  imageUrl?: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  colors?: string[];
}): MTGCard {
  return {
    id: entry.scryfallId.startsWith('legacy:') ? undefined : entry.scryfallId,
    name: entry.name,
    set: entry.setCode,
    number: entry.collectorNumber,
    rarity: entry.rarity,
    imageUrl: entry.imageUrl,
    manaCost: entry.manaCost,
    cmc: entry.cmc,
    type: entry.typeLine,
    colors: entry.colors,
  };
}
