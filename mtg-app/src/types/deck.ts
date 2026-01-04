export interface DeckCard {
  cardId: string;
  quantity: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: DeckCard[];
  userId: string;
  createdAt: Date;
}

