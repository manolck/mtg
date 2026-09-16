import type { DeckEntry } from '../types/deck';
import type { MTGCard, UserCard } from '../types/card';

export function mtgCardToDeckEntry(card: MTGCard, quantity: number = 1): DeckEntry {
  if (!card.id) {
    throw new Error(`Carte sans scryfallId : ${card.name}`);
  }
  return {
    scryfallId: card.id,
    name: card.name,
    setCode: card.set,
    collectorNumber: card.number,
    quantity,
    cmc: card.cmc,
    typeLine: card.type,
    manaCost: card.manaCost,
    rarity: card.rarity,
    colors: card.colors,
    colorIdentity: card.colorIdentity || card.colors,
    imageUrl: card.imageUrl,
    legalities: card.legalities,
  };
}

export function userCardToDeckEntry(card: UserCard, quantity: number = 1): DeckEntry {
  const scryfallId = card.mtgData?.id || card.id;
  return {
    scryfallId,
    name: card.name,
    setCode: card.setCode || card.set || card.mtgData?.set,
    collectorNumber: card.collectorNumber || card.mtgData?.number,
    quantity,
    cmc: card.mtgData?.cmc,
    typeLine: card.mtgData?.type,
    manaCost: card.mtgData?.manaCost,
    rarity: card.rarity || card.mtgData?.rarity,
    colors: card.mtgData?.colors,
    colorIdentity: card.mtgData?.colorIdentity || card.mtgData?.colors,
    imageUrl: card.mtgData?.imageUrl,
    legalities: card.mtgData?.legalities,
  };
}
