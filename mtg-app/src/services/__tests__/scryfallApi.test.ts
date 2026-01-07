// @ts-nocheck
import {
  searchCardByScryfallId,
  searchCardBySetAndNumber,
  searchCardByNameAndNumberScryfall,
} from '../scryfallApi';

// Mock global fetch
global.fetch = jest.fn();

describe('scryfallApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  const mockScryfallCard = {
    id: 'test-scryfall-id',
    name: 'Lightning Bolt',
    mana_cost: '{R}',
    cmc: 1,
    colors: ['R'],
    type_line: 'Instant',
    rarity: 'Common',
    set: 'm21',
    set_name: 'Core Set 2021',
    collector_number: '161',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    artist: 'Christopher Rush',
    multiverse_ids: [123456],
    image_uris: {
      normal: 'https://example.com/lightning-bolt.jpg',
    },
  };

  describe('searchCardByScryfallId', () => {
    it('should fetch and convert a card by Scryfall ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockScryfallCard,
      });

      const result = await searchCardByScryfallId('test-scryfall-id');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
      expect(result?.manaCost).toBe('{R}');
      expect(result?.colors).toEqual(['R']);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return null for 404 error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await searchCardByScryfallId('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle rate limit errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      await expect(searchCardByScryfallId('test-id')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });
  });

  describe('searchCardBySetAndNumber', () => {
    it('should fetch card by set code and collector number', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockScryfallCard,
      });

      const result = await searchCardBySetAndNumber('m21', '161');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return null for invalid set/number', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await searchCardBySetAndNumber('invalid', '999');

      expect(result).toBeNull();
    });
  });

  describe('searchCardByNameAndNumberScryfall', () => {
    it('should search card by name, number and optional set', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [mockScryfallCard],
        }),
      });

      const result = await searchCardByNameAndNumberScryfall(
        'Lightning Bolt',
        '161',
        'm21'
      );

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
    });

    it('should handle empty search results', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
        }),
      });

      const result = await searchCardByNameAndNumberScryfall(
        'Non Existent Card',
        '1',
        'm21'
      );

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(searchCardByScryfallId('test-id')).rejects.toThrow(
        'Network error'
      );
    });
  });
});
