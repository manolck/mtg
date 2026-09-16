/** Formats supportés (v1) */
export type DeckFormat =
  | 'commander'
  | 'standard'
  | 'pioneer'
  | 'modern'
  | 'historic'
  | 'pauper';

export type DeckVisibility = 'private' | 'unlisted' | 'public';

export type DeckZone = 'mainboard' | 'sideboard' | 'maybeboard' | 'commanders';

/** Entrée catalogue dans une decklist (pas un collection_item) */
export interface DeckEntry {
  scryfallId: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  quantity: number;
  /** CMC / type optionnels pour stats UI sans refetch */
  cmc?: number;
  typeLine?: string;
  manaCost?: string;
  rarity?: string;
  colors?: string[];
  colorIdentity?: string[];
  imageUrl?: string;
  /** Légalités Scryfall dénormalisées au moment de l'ajout */
  legalities?: Partial<Record<DeckFormat | string, string>>;
}

export interface DeckCardsPayload {
  mainboard: DeckEntry[];
  sideboard: DeckEntry[];
  maybeboard: DeckEntry[];
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  format: DeckFormat;
  visibility: DeckVisibility;
  /** Contenu des zones (main / side / maybe) */
  cards: DeckCardsPayload;
  commanders: DeckEntry[];
  userId: string;
  sourceDeckId?: string;
  isValidForFormat?: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt?: Date;
}

/** @deprecated Legacy flat list — kept for migration helpers */
export interface DeckCard {
  cardId: string;
  quantity: number;
}

export const DECK_FORMATS: DeckFormat[] = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'historic',
  'pauper',
];

export const DECK_FORMAT_LABELS: Record<DeckFormat, string> = {
  commander: 'Commander',
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  historic: 'Historic',
  pauper: 'Pauper',
};

export function emptyDeckCards(): DeckCardsPayload {
  return { mainboard: [], sideboard: [], maybeboard: [] };
}

export function countEntries(entries: DeckEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.quantity || 0), 0);
}

export function allDeckEntries(deck: Pick<Deck, 'cards' | 'commanders'>): DeckEntry[] {
  return [
    ...(deck.commanders || []),
    ...(deck.cards?.mainboard || []),
    ...(deck.cards?.sideboard || []),
    ...(deck.cards?.maybeboard || []),
  ];
}
