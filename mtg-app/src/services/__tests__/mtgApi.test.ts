// @ts-nocheck
import {
  searchCardByName,
  searchCardsByName,
  searchCardByMultiverseId,
  searchCardByNameAndNumber,
} from '../mtgApi';

// Mock global fetch
global.fetch = jest.fn();

describe('mtgApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  const mockMTGCard = {
    id: 'test-id',
    name: 'Lightning Bolt',
    manaCost: '{R}',
    cmc: 1,
    colors: ['Red'],
    type: 'Instant',
    types: ['Instant'],
    rarity: 'Common',
    set: 'M21',
    setName: 'Core Set 2021',
    text: 'Lightning Bolt deals 3 damage to any target.',
    artist: 'Christopher Rush',
    number: '161',
    multiverseid: 123456,
    imageUrl: 'https://example.com/lightning-bolt.jpg',
  };

  describe('searchCardByName', () => {
    it('should fetch a card by name', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [mockMTGCard],
        }),
      });

      const result = await searchCardByName('Lightning Bolt');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return null if card not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [],
        }),
      });

      const result = await searchCardByName('Non Existent Card');

      expect(result).toBeNull();
    });

    it('should handle cards with double-face names', async () => {
      const doubleFaceCard = {
        ...mockMTGCard,
        name: 'Delver of Secrets // Insectile Aberration',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [doubleFaceCard],
        }),
      });

      const result = await searchCardByName(
        'Delver of Secrets // Insectile Aberration'
      );

      expect(result).not.toBeNull();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('searchCardsByName', () => {
    it('should fetch multiple cards by name', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [mockMTGCard],
        }),
      });

      const results = await searchCardsByName('Lightning Bolt');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('searchCardByMultiverseId', () => {
    it('should fetch a card by multiverse ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [mockMTGCard],
        }),
      });

      const result = await searchCardByMultiverseId(123456);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return null for invalid multiverse ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [],
        }),
      });

      const result = await searchCardByMultiverseId(999999);

      expect(result).toBeNull();
    });
  });

  describe('searchCardByNameAndNumber', () => {
    it('should search card by name and collector number', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [mockMTGCard],
        }),
      });

      const result = await searchCardByNameAndNumber('Lightning Bolt', '161');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Lightning Bolt');
    });

    it('should filter by set code when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cards: [mockMTGCard],
        }),
      });

      const result = await searchCardByNameAndNumber('Lightning Bolt', '161', 'M21');

      expect(result).not.toBeNull();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Use a different card name to avoid cache
      await expect(searchCardByName('Test Card For Error')).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Use a different card name to avoid cache
      await expect(searchCardByName('Test Card For API Error')).rejects.toThrow();
    });
  });
});
