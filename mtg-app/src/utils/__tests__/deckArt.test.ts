import { pickDeckIconCard, toArtCropUrl, getDeckBackdropUrl } from '../deckArt';
import type { DeckEntry } from '../../types/deck';

const bolt: DeckEntry = {
  scryfallId: 'bolt',
  name: 'Lightning Bolt',
  quantity: 4,
  typeLine: 'Instant',
  cmc: 1,
  imageUrl: 'https://cards.scryfall.io/normal/front/a/b/bolt.jpg',
};

const atraxa: DeckEntry = {
  scryfallId: 'atraxa',
  name: 'Atraxa, Praetors\' Voice',
  quantity: 1,
  typeLine: 'Legendary Creature — Phyrexian Angel Horror',
  cmc: 4,
  imageUrl: 'https://cards.scryfall.io/normal/front/a/t/atraxa.jpg',
};

const forest: DeckEntry = {
  scryfallId: 'forest',
  name: 'Forest',
  quantity: 10,
  typeLine: 'Basic Land — Forest',
  cmc: 0,
  imageUrl: 'https://cards.scryfall.io/normal/front/f/o/forest.jpg',
};

describe('deckArt', () => {
  it('converts a Scryfall card image to art_crop', () => {
    expect(toArtCropUrl('https://cards.scryfall.io/normal/front/a/b/bolt.jpg')).toBe(
      'https://cards.scryfall.io/art_crop/front/a/b/bolt.jpg',
    );
  });

  it('uses the commander as the iconic card for commander decks', () => {
    const card = pickDeckIconCard({
      format: 'commander',
      commanders: [atraxa],
      cards: { mainboard: [bolt, forest], sideboard: [], maybeboard: [] },
    });
    expect(card?.name).toBe(atraxa.name);
    expect(getDeckBackdropUrl({
      format: 'commander',
      commanders: [atraxa],
      cards: { mainboard: [bolt, forest], sideboard: [], maybeboard: [] },
    })).toContain('/art_crop/');
  });

  it('picks a legendary over a bolt and skips basic lands in constructed', () => {
    const card = pickDeckIconCard({
      format: 'modern',
      commanders: [],
      cards: { mainboard: [forest, bolt, atraxa], sideboard: [], maybeboard: [] },
    });
    expect(card?.name).toBe(atraxa.name);
  });
});
