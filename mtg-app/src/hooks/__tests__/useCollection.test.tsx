import { renderHook, waitFor, act } from '@testing-library/react';
import { useCollection } from '../useCollection';
import { AuthProvider } from '../../context/AuthContext';
import * as collectionService from '../../services/collectionService';
import * as importService from '../../services/importService';
import type { UserCard } from '../../types/card';

jest.mock('../../services/pocketbase', () => ({
  pb: {
    collection: jest.fn(),
    authStore: {
      isValid: true,
      model: { id: 'test-user-id', email: 'test@example.com', pseudonym: null },
      onChange: jest.fn(() => () => {}),
      clear: jest.fn(),
    },
  },
}));

jest.mock('../../services/collectionService');
jest.mock('../../services/importService', () => ({
  createImport: jest.fn().mockResolvedValue('import-id'),
  updateImportStatus: jest.fn().mockResolvedValue(undefined),
  updateImportProgress: jest.fn().mockResolvedValue(undefined),
  saveImportReport: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/csvParser', () => ({
  parseCSV: jest.fn((content: string) => {
    if (!content || content.trim() === '') return [];
    const lines = content.split('\n').filter(l => l.trim());
    return lines.map((line, idx) => {
      const parts = line.split(',');
      return {
        name: parts[0] || `Card ${idx}`,
        quantity: parseInt(parts[1]) || 1,
        setCode: parts[2] || undefined,
        collectorNumber: parts[3] || undefined,
      };
    });
  }),
}));

jest.mock('../../services/mtgApi', () => ({
  searchCardByName: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
  searchCardsByName: jest.fn().mockResolvedValue([{
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }]),
  searchCardByMultiverseId: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
  searchCardByNameAndNumber: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
}));

jest.mock('../../services/scryfallApi', () => ({
  searchCardByScryfallId: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
  searchCardBySetAndNumber: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
  searchCardByNameAndNumberScryfall: jest.fn().mockResolvedValue({
    name: 'Lightning Bolt',
    multiverseid: 123,
    imageUrl: 'http://example.com/image.jpg',
  }),
}));

const mockCreateImport = importService.createImport as jest.Mock;

const mockUseAuth = jest.fn();
jest.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetCollection = collectionService.getCollection as jest.Mock;
const mockGetAllCollections = collectionService.getAllCollections as jest.Mock;
const mockDeleteCard = collectionService.deleteCard as jest.Mock;
const mockDeleteCards = collectionService.deleteCards as jest.Mock;
const mockUpdateCardQuantity = collectionService.updateCardQuantity as jest.Mock;
const mockAddCard = collectionService.addCard as jest.Mock;
const mockFindCard = collectionService.findCard as jest.Mock;
const mockUpdateCard = collectionService.updateCard as jest.Mock;

describe('useCollection', () => {
  const mockUser = {
    uid: 'test-user-id',
    email: 'test@example.com',
  };

  const mockCard: UserCard = {
    id: 'card-1',
    name: 'Lightning Bolt',
    quantity: 1,
    userId: 'test-user-id',
    createdAt: new Date(),
    setCode: 'M21',
    collectorNumber: '161',
  };

  const createMockCards = (cards: Partial<UserCard>[] = []): UserCard[] =>
    cards.map((c, i) => ({
      id: c.id || `card-${i + 1}`,
      name: c.name || 'Lightning Bolt',
      quantity: c.quantity ?? 1,
      userId: c.userId || 'test-user-id',
      createdAt: c.createdAt || new Date(),
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      ...c,
    }));

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>
      <div>{children}</div>
    </AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ currentUser: mockUser });
    mockGetCollection.mockResolvedValue([]);
    mockGetAllCollections.mockResolvedValue({ items: [], totalCount: 0, owners: [] });
    mockDeleteCard.mockResolvedValue(undefined);
    mockDeleteCards.mockResolvedValue(undefined);
    mockUpdateCardQuantity.mockResolvedValue(undefined);
    mockAddCard.mockResolvedValue({ id: 'new-card-id' });
    mockFindCard.mockResolvedValue(null);
    mockUpdateCard.mockResolvedValue(undefined);
  });

  describe('Loading Collection', () => {
    it('should load collection for authenticated user', async () => {
      const mockCards = createMockCards([{ id: 'card-1', name: 'Lightning Bolt', quantity: 1 }]);
      mockGetCollection.mockResolvedValue(mockCards);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(mockGetCollection).toHaveBeenCalledWith('test-user-id', undefined);
    });

    it('should load all collections when userId is "all"', async () => {
      mockGetAllCollections.mockResolvedValue({ items: [], totalCount: 0, owners: [] });

      const { result } = renderHook(() => useCollection('all'), { wrapper });

      await waitFor(() => {
        expect(mockGetAllCollections).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should return empty collection when user is not authenticated', () => {
      mockUseAuth.mockReturnValueOnce({ currentUser: null });
      
      const { result } = renderHook(() => useCollection(), { wrapper });

      expect(result.current.cards).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle loading error gracefully', async () => {
      mockGetCollection.mockRejectedValue(new Error('Firestore error'));

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Delete Card', () => {
    it('should delete a card successfully', async () => {
      const mockCards = createMockCards([{ id: 'card-1', name: 'Lightning Bolt', quantity: 1 }]);
      mockGetCollection.mockResolvedValue(mockCards);
      mockDeleteCard.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteCard('card-1');
      });

      expect(mockDeleteCard).toHaveBeenCalled();
    });

    it('should throw error when trying to delete without permission', async () => {
      mockUseAuth.mockReturnValueOnce({ currentUser: null });
      
      const { result } = renderHook(() => useCollection('other-user-id'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.deleteCard('card-1');
        });
      }).rejects.toThrow();
    });

    it('should handle delete error', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);
      mockDeleteCard.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.deleteCard('card-1');
        });
      }).rejects.toThrow();
    });
  });

  describe('Delete All Cards', () => {
    it('should delete all cards successfully', async () => {
      const mockCards = createMockCards([
        { id: 'card-1', name: 'Card 1', quantity: 1 },
        { id: 'card-2', name: 'Card 2', quantity: 1 },
      ]);
      mockGetCollection.mockResolvedValue(mockCards);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteAllCards();
      });

      expect(mockDeleteCards).toHaveBeenCalled();
    });

    it('should throw error when trying to delete all without permission', async () => {
      mockUseAuth.mockReturnValueOnce({ currentUser: null });
      
      const { result } = renderHook(() => useCollection('other-user-id'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.deleteAllCards();
        });
      }).rejects.toThrow();
    });
  });

  describe('Update Card Quantity', () => {
    it('should update card quantity successfully', async () => {
      const mockCards = createMockCards([{ id: 'card-1', name: 'Lightning Bolt', quantity: 1 }]);
      mockGetCollection.mockResolvedValue(mockCards);
      mockUpdateCardQuantity.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCardQuantity('card-1', 3);
      });

      expect(mockUpdateCardQuantity).toHaveBeenCalled();
    });

    it('should throw error for invalid quantity', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.updateCardQuantity('card-1', 0);
        });
      }).rejects.toThrow();
    });
  });

  describe('Update Card', () => {
    it('should update card successfully', async () => {
      const mockCards = createMockCards([{ id: 'card-1', name: 'Lightning Bolt', quantity: 1 }]);
      mockGetCollection.mockResolvedValue(mockCards);
      mockUpdateCard.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCard('card-1', { quantity: 2, condition: 'NM' });
      });

      expect(mockUpdateCard).toHaveBeenCalled();
    });
  });

  describe('Import CSV', () => {
    it('should import CSV successfully', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);
      mockCreateImport.mockResolvedValue('import-id-123');

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const csvContent = 'Lightning Bolt,1,M21,161\nCounterspell,2,STX,51';

      await act(async () => {
        await result.current.importCSV(csvContent);
      });

      expect(mockCreateImport).toHaveBeenCalled();
    });

    it('should throw error when importing without authentication', async () => {
      mockUseAuth.mockReturnValueOnce({ currentUser: null });
      
      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.importCSV('Lightning Bolt,1');
        });
      }).rejects.toThrow('User not authenticated');
    });

    it('should handle pause import', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);
      mockCreateImport.mockResolvedValue('import-id-123');

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.pauseImport();
      });

      expect(result.current.isImportPaused).toBe(true);
    });

    it('should handle resume import', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.pauseImport();
        result.current.resumeImport();
      });

      expect(result.current.isImportPaused).toBe(false);
    });

    it('should handle cancel import', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.cancelImport();
      });

      expect(result.current.isImportPaused).toBe(false);
    });
  });

  describe('Load More Cards', () => {
    it('should load more cards when available', async () => {
      const manyCards = Array.from({ length: 100 }, (_, i) => ({
        id: `card-${i}`,
        name: `Card ${i}`,
        quantity: 1,
        userId: 'test-user-id',
      }));
      const mockCards = createMockCards(manyCards);
      mockGetCollection.mockResolvedValue(mockCards);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.loadMoreCards();
      });

      expect(result.current.cards.length).toBeGreaterThan(50);
    });

    it('should not load more if all cards are displayed', async () => {
      const fewCards = Array.from({ length: 10 }, (_, i) => ({
        id: `card-${i}`,
        name: `Card ${i}`,
        quantity: 1,
        userId: 'test-user-id',
      }));
      const mockCards = createMockCards(fewCards);
      mockGetCollection.mockResolvedValue(mockCards);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCount = result.current.cards.length;

      await act(async () => {
        await result.current.loadMoreCards();
      });

      // Should not load more if already all displayed
      expect(result.current.cards.length).toBe(initialCount);
    });
  });

  describe('Can Modify', () => {
    it('should return true when viewing own collection', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(true);
    });

    it('should return false when viewing other user collection', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection('other-user-id'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(false);
    });

    it('should return false when viewing all collections', async () => {
      const mockSnapshot = createMockCards();
      mockGetCollection.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection('all'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(false);
    });
  });
});

