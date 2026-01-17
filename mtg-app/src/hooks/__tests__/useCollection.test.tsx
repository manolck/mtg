import { renderHook, waitFor, act } from '@testing-library/react';
import { useCollection } from '../useCollection';
import { AuthProvider } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { 
  collection, 
  getDocs, 
  collectionGroup, 
  query, 
  limit, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  writeBatch, 
  getDoc 
} from 'firebase/firestore';
import type { UserCard } from '../../types/card';

// Mock Firebase
jest.mock('../../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
  },
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback({
      uid: 'test-user-id',
      email: 'test@example.com',
    });
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  collectionGroup: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(),
  getDoc: jest.fn(),
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

const mockUseImports = {
  createImport: jest.fn().mockResolvedValue('import-id'),
  updateImportStatus: jest.fn().mockResolvedValue(undefined),
  updateImportProgress: jest.fn().mockResolvedValue(undefined),
  saveImportReport: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../useImports', () => ({
  useImports: () => mockUseImports,
}));

const mockUseAuth = jest.fn();
jest.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetDocs = getDocs as jest.Mock;
const mockCollection = collection as jest.Mock;
const mockCollectionGroup = collectionGroup as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const mockAddDoc = addDoc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockWriteBatch = writeBatch as jest.Mock;

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

  const createMockSnapshot = (cards: any[] = []) => ({
    size: cards.length,
    forEach: jest.fn((callback) => {
      cards.forEach(card => callback(card));
    }),
    docs: cards.map(card => ({
      id: card.id || 'card-1',
      data: () => card.data ? card.data() : card,
      ref: {
        parent: {
          parent: {
            id: card.userId || 'test-user-id',
          },
        },
      },
    })),
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>
      <div>{children}</div>
    </AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({});
    mockCollectionGroup.mockReturnValue({});
    mockUseAuth.mockReturnValue({ currentUser: mockUser });
    mockGetDocs.mockResolvedValue(createMockSnapshot());
    mockDeleteDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockAddDoc.mockResolvedValue({ id: 'new-card-id' });
    mockGetDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });
    
    const mockBatch = {
      delete: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);
  });

  describe('Loading Collection', () => {
    it('should load collection for authenticated user', async () => {
      const mockSnapshot = createMockSnapshot([{
        id: 'card-1',
        data: () => ({
          name: 'Lightning Bolt',
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }]);

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(mockGetDocs).toHaveBeenCalled();
      expect(mockCollection).toHaveBeenCalled();
    });

    it('should load all collections when userId is "all"', async () => {
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection('all'), { wrapper });

      await waitFor(() => {
        expect(mockCollectionGroup).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should return empty collection when user is not authenticated', () => {
      mockUseAuth.mockReturnValueOnce({ currentUser: null });
      
      const { result } = renderHook(() => useCollection(), { wrapper });

      expect(result.current.cards).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle loading error gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Delete Card', () => {
    it('should delete a card successfully', async () => {
      const mockSnapshot = createMockSnapshot([{
        id: 'card-1',
        data: () => ({
          name: 'Lightning Bolt',
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }]);

      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockDeleteDoc.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteCard('card-1');
      });

      expect(mockDeleteDoc).toHaveBeenCalled();
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
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockDeleteDoc.mockRejectedValue(new Error('Delete failed'));

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
      const mockSnapshot = createMockSnapshot([
        { id: 'card-1', data: () => ({ name: 'Card 1', quantity: 1, userId: 'test-user-id', createdAt: { toDate: () => new Date() } }) },
        { id: 'card-2', data: () => ({ name: 'Card 2', quantity: 1, userId: 'test-user-id', createdAt: { toDate: () => new Date() } }) },
      ]);

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteAllCards();
      });

      expect(mockWriteBatch).toHaveBeenCalled();
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
      const mockSnapshot = createMockSnapshot([{
        id: 'card-1',
        data: () => ({
          name: 'Lightning Bolt',
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }]);

      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockUpdateDoc.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCardQuantity('card-1', 3);
      });

      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it('should throw error for invalid quantity', async () => {
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

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
      const mockSnapshot = createMockSnapshot([{
        id: 'card-1',
        data: () => ({
          name: 'Lightning Bolt',
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }]);

      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockUpdateDoc.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCard('card-1', { quantity: 2, condition: 'NM' });
      });

      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  describe('Import CSV', () => {
    it('should import CSV successfully', async () => {
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockUseImports.createImport.mockResolvedValue('import-id-123');

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const csvContent = 'Lightning Bolt,1,M21,161\nCounterspell,2,STX,51';

      await act(async () => {
        await result.current.importCSV(csvContent);
      });

      expect(mockUseImports.createImport).toHaveBeenCalled();
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
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockUseImports.createImport.mockResolvedValue('import-id-123');

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
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

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
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

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
        data: () => ({
          name: `Card ${i}`,
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }));

      const mockSnapshot = createMockSnapshot(manyCards);
      mockGetDocs.mockResolvedValue(mockSnapshot);

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
        data: () => ({
          name: `Card ${i}`,
          quantity: 1,
          userId: 'test-user-id',
          createdAt: { toDate: () => new Date() },
        }),
      }));

      const mockSnapshot = createMockSnapshot(fewCards);
      mockGetDocs.mockResolvedValue(mockSnapshot);

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
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(true);
    });

    it('should return false when viewing other user collection', async () => {
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection('other-user-id'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(false);
    });

    it('should return false when viewing all collections', async () => {
      const mockSnapshot = createMockSnapshot();
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const { result } = renderHook(() => useCollection('all'), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.canModify).toBe(false);
    });
  });
});

