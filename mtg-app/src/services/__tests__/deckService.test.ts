import {
  createDeck,
  getDecks,
  addEntryToDeck,
  removeEntryFromDeck,
  forkDeck,
  normalizeDeckCardsPayload,
} from '../deckService';
import type { DeckEntry } from '../../types/deck';

const mockGetFullList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockGetOne = jest.fn();

jest.mock('../pocketbase', () => ({
  pb: {
    authStore: {
      isValid: true,
      model: { id: 'test-user-id' },
    },
    collection: () => ({
      getFullList: mockGetFullList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      getOne: mockGetOne,
    }),
  },
}));

const emptyCards = { mainboard: [], sideboard: [], maybeboard: [] };

describe('deckService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeDeckCardsPayload', () => {
    it('normalizes zoned payload', () => {
      const payload = normalizeDeckCardsPayload({
        mainboard: [{ scryfallId: 'a', name: 'Bolt', quantity: 4 }],
        sideboard: [],
        maybeboard: [],
      });
      expect(payload.mainboard).toHaveLength(1);
    });

    it('migrates legacy flat array to mainboard', () => {
      const payload = normalizeDeckCardsPayload([
        { cardId: 'item-1', quantity: 2 },
      ]);
      expect(payload.mainboard[0].scryfallId).toBe('legacy:item-1');
      expect(payload.mainboard[0].quantity).toBe(2);
    });
  });

  describe('createDeck', () => {
    it('creates with format and empty zoned cards', async () => {
      mockCreate.mockResolvedValue({
        id: 'deck-1',
        userId: 'test-user-id',
        name: 'Aggro',
        format: 'modern',
        visibility: 'private',
        cards: emptyCards,
        commanders: [],
        created: new Date().toISOString(),
      });

      const deck = await createDeck('test-user-id', { name: 'Aggro', format: 'modern' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          name: 'Aggro',
          format: 'modern',
          visibility: 'private',
          cards: emptyCards,
        })
      );
      expect(deck.cards.mainboard).toEqual([]);
      expect(deck.format).toBe('modern');
    });
  });

  describe('getDecks', () => {
    it('maps records to Deck', async () => {
      mockGetFullList.mockResolvedValue([
        {
          id: 'deck-1',
          userId: 'test-user-id',
          name: 'Burn',
          format: 'modern',
          visibility: 'private',
          cards: {
            mainboard: [{ scryfallId: 'card-1', name: 'Lightning Bolt', quantity: 4 }],
            sideboard: [],
            maybeboard: [],
          },
          commanders: [],
          created: new Date().toISOString(),
        },
      ]);

      const decks = await getDecks('test-user-id');
      expect(decks[0].cards.mainboard).toEqual([
        { scryfallId: 'card-1', name: 'Lightning Bolt', quantity: 4 },
      ]);
    });
  });

  describe('addEntryToDeck', () => {
    it('merges into mainboard', async () => {
      mockGetOne.mockResolvedValue({
        id: 'deck-1',
        userId: 'test-user-id',
        name: 'Burn',
        format: 'modern',
        visibility: 'private',
        cards: emptyCards,
        commanders: [],
        created: new Date().toISOString(),
      });
      const entry: DeckEntry = {
        scryfallId: 'card-1',
        name: 'Lightning Bolt',
        quantity: 1,
      };
      mockUpdate.mockResolvedValue({
        id: 'deck-1',
        userId: 'test-user-id',
        name: 'Burn',
        format: 'modern',
        visibility: 'private',
        cards: { mainboard: [entry], sideboard: [], maybeboard: [] },
        commanders: [],
        created: new Date().toISOString(),
      });

      const deck = await addEntryToDeck('deck-1', entry, 'mainboard');
      expect(mockUpdate).toHaveBeenCalledWith(
        'deck-1',
        expect.objectContaining({
          cards: { mainboard: [entry], sideboard: [], maybeboard: [] },
        })
      );
      expect(deck.cards.mainboard[0].name).toBe('Lightning Bolt');
    });
  });

  describe('removeEntryFromDeck', () => {
    it('removes from mainboard', async () => {
      mockGetOne.mockResolvedValue({
        id: 'deck-1',
        userId: 'test-user-id',
        name: 'Burn',
        format: 'modern',
        visibility: 'private',
        cards: {
          mainboard: [{ scryfallId: 'card-1', name: 'Lightning Bolt', quantity: 1 }],
          sideboard: [],
          maybeboard: [],
        },
        commanders: [],
        created: new Date().toISOString(),
      });
      mockUpdate.mockResolvedValue({
        id: 'deck-1',
        userId: 'test-user-id',
        name: 'Burn',
        format: 'modern',
        visibility: 'private',
        cards: emptyCards,
        commanders: [],
        created: new Date().toISOString(),
      });

      const deck = await removeEntryFromDeck('deck-1', 'card-1', 'mainboard');
      expect(deck.cards.mainboard).toEqual([]);
    });
  });

  describe('forkDeck', () => {
    it('creates a private copy with sourceDeckId', async () => {
      mockGetOne.mockResolvedValue({
        id: 'source-1',
        userId: 'other-user',
        name: 'Public Burn',
        format: 'modern',
        visibility: 'public',
        cards: {
          mainboard: [{ scryfallId: 'card-1', name: 'Lightning Bolt', quantity: 4 }],
          sideboard: [],
          maybeboard: [],
        },
        commanders: [],
        created: new Date().toISOString(),
      });
      mockCreate.mockResolvedValue({
        id: 'fork-1',
        userId: 'test-user-id',
        name: 'Public Burn (copie)',
        format: 'modern',
        visibility: 'private',
        cards: {
          mainboard: [{ scryfallId: 'card-1', name: 'Lightning Bolt', quantity: 4 }],
          sideboard: [],
          maybeboard: [],
        },
        commanders: [],
        sourceDeckId: 'source-1',
        created: new Date().toISOString(),
      });

      const fork = await forkDeck('source-1');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          visibility: 'private',
          sourceDeckId: 'source-1',
          name: 'Public Burn (copie)',
        })
      );
      expect(fork.sourceDeckId).toBe('source-1');
    });
  });
});
