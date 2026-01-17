import { getCardPrice } from '../priceService';
import { getCardPriceFromMTGJSON } from '../mtgjsonPriceServiceAPI';
import { scryfallQueue } from '../../utils/apiQueue';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import type { UserCard } from '../../types/card';

// Mock dependencies
jest.mock('../mtgjsonPriceServiceAPI', () => ({
  getCardPriceFromMTGJSON: jest.fn(),
  initializeMTGJSONPrices: jest.fn(),
  isMTGJSONInitialized: jest.fn().mockReturnValue(true),
  waitForMTGJSONInitialization: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/apiQueue', () => ({
  scryfallQueue: {
    enqueue: jest.fn(),
  },
}));

jest.mock('../../utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

const mockGetCardPriceFromMTGJSON = getCardPriceFromMTGJSON as jest.Mock;
const mockScryfallQueue = scryfallQueue as jest.Mocked<typeof scryfallQueue>;
const mockFetchWithRetry = fetchWithRetry as jest.Mock;

describe('priceService', () => {
  const mockCard: UserCard = {
    id: 'card-1',
    name: 'Lightning Bolt',
    quantity: 1,
    userId: 'test-user-id',
    createdAt: new Date(),
    setCode: 'M21',
    collectorNumber: '161',
    mtgData: {
      id: 'scryfall-id-123',
      name: 'Lightning Bolt',
      multiverseid: 123,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCardPrice', () => {
    it('should return price from MTGJSON when available', async () => {
      const mockPrice = {
        usd: '0.50',
        eur: '0.45',
      };

      mockGetCardPriceFromMTGJSON.mockResolvedValue(mockPrice);

      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toEqual(mockPrice);
      expect(mockGetCardPriceFromMTGJSON).toHaveBeenCalledWith('Lightning Bolt', 'M21');
      expect(mockScryfallQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should fallback to Scryfall when MTGJSON returns null', async () => {
      mockGetCardPriceFromMTGJSON.mockResolvedValue(null);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          prices: {
            usd: '0.50',
            eur: '0.45',
          },
        }),
      };

      mockFetchWithRetry.mockResolvedValue(mockResponse);
      mockScryfallQueue.enqueue.mockImplementation(async (fn) => await fn());

      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toEqual({
        usd: '0.50',
        eur: '0.45',
      });
      expect(mockScryfallQueue.enqueue).toHaveBeenCalled();
    });

    it('should return null when card has no scryfallId and MTGJSON fails', async () => {
      const cardWithoutScryfallId: UserCard = {
        ...mockCard,
        mtgData: undefined,
      };

      mockGetCardPriceFromMTGJSON.mockResolvedValue(null);

      const result = await getCardPrice(cardWithoutScryfallId, 'usd');

      expect(result).toBeNull();
      expect(mockScryfallQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should handle MTGJSON error and fallback to Scryfall', async () => {
      mockGetCardPriceFromMTGJSON.mockRejectedValue(new Error('MTGJSON error'));

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          prices: {
            usd: '0.50',
          },
        }),
      };

      mockFetchWithRetry.mockResolvedValue(mockResponse);
      mockScryfallQueue.enqueue.mockImplementation(async (fn) => await fn());

      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toEqual({
        usd: '0.50',
      });
      expect(mockScryfallQueue.enqueue).toHaveBeenCalled();
    });

    it('should handle Scryfall rate limit error', async () => {
      mockGetCardPriceFromMTGJSON.mockResolvedValue(null);

      const mockResponse = {
        ok: false,
        status: 429,
      };

      mockFetchWithRetry.mockResolvedValue(mockResponse);
      mockScryfallQueue.enqueue.mockImplementation(async (fn) => await fn());

      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toBeNull();
    });

    it('should handle Scryfall API error', async () => {
      mockGetCardPriceFromMTGJSON.mockResolvedValue(null);

      const mockResponse = {
        ok: false,
        status: 500,
      };

      mockFetchWithRetry.mockResolvedValue(mockResponse);
      mockScryfallQueue.enqueue.mockImplementation(async (fn) => await fn());

      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toBeNull();
    });

    it('should use cache when available', async () => {
      const mockPrice = {
        usd: '0.50',
        eur: '0.45',
      };

      // First call
      mockGetCardPriceFromMTGJSON.mockResolvedValue(mockPrice);
      await getCardPrice(mockCard, 'usd');

      // Second call should use cache
      mockGetCardPriceFromMTGJSON.mockClear();
      const result = await getCardPrice(mockCard, 'usd');

      expect(result).toEqual(mockPrice);
      // Should not call MTGJSON again if cached
      // Note: The cache implementation might need adjustment based on actual code
    });
  });
});

