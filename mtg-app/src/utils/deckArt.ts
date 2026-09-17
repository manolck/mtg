import type { Deck, DeckEntry } from '../types/deck';

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

export function toArtCropUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;
  return imageUrl
    .replace('/small/', '/art_crop/')
    .replace('/normal/', '/art_crop/')
    .replace('/large/', '/art_crop/')
    .replace('/png/', '/art_crop/')
    .replace('/border_crop/', '/art_crop/');
}

function typeLineOf(entry: DeckEntry): string {
  return (entry.typeLine || '').toLowerCase();
}

function isBasicLand(entry: DeckEntry): boolean {
  const type = typeLineOf(entry);
  if (type.includes('basic land')) return true;
  return BASIC_LAND_NAMES.has(entry.name.trim().toLowerCase());
}

function iconicScore(entry: DeckEntry): number {
  const type = typeLineOf(entry);
  if (isBasicLand(entry)) return -1000;
  let score = (entry.cmc || 0) * 3;
  if (type.includes('legendary')) score += 80;
  if (type.includes('planeswalker')) score += 55;
  if (type.includes('creature')) score += 18;
  if (type.includes('battle')) score += 12;
  if (type.includes('land') && !type.includes('creature')) score -= 25;
  if ((entry.quantity || 1) === 1 && (entry.cmc || 0) >= 4) score += 10;
  if (entry.imageUrl) score += 5;
  return score;
}

export function pickDeckIconCard(
  deck: Pick<Deck, 'format' | 'commanders' | 'cards'>,
): DeckEntry | undefined {
  const commanders = deck.commanders || [];
  if (deck.format === 'commander' || commanders.length > 0) {
    const withArt = commanders.find((entry) => entry.imageUrl) || commanders[0];
    if (withArt) return withArt;
  }

  const pool = [...(deck.cards?.mainboard || [])];
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => {
    const diff = iconicScore(b) - iconicScore(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  })[0];
}

export function getDeckBackdropUrl(deck: Pick<Deck, 'format' | 'commanders' | 'cards'>): string | undefined {
  const card = pickDeckIconCard(deck);
  return toArtCropUrl(card?.imageUrl) || card?.imageUrl;
}
