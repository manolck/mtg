import {
  getWishlistItems,
  getWishlistItem,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
} from '../wishlistService';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import type { WishlistItem } from '../../types/card';

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date() })),
  },
}));

const mockGetDocs = getDocs as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockAddDoc = addDoc as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockCollection = collection as jest.Mock;
const mockDoc = doc as jest.Mock;
const mockQuery = query as jest.Mock;
const mockOrderBy = orderBy as jest.Mock;

describe('wishlistService', () => {
  const userId = 'test-user-id';
  const mockWishlistItem: WishlistItem = {
    id: 'item-1',
    name: 'Lightning Bolt',
    quantity: 1,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    setCode: 'M21',
    collectorNumber: '161',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({});
    mockDoc.mockReturnValue({});
    mockQuery.mockReturnValue({});
    mockOrderBy.mockReturnValue({});
  });

  describe('getWishlistItems', () => {
    it('should fetch all wishlist items for a user', async () => {
      const mockSnapshot = {
        docs: [
          {
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
          {
            id: 'item-2',
            data: () => ({
              name: 'Counterspell',
              quantity: 2,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
        ],
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await getWishlistItems(userId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[1].name).toBe('Counterspell');
      expect(mockGetDocs).toHaveBeenCalled();
    });

    it('should return empty array when no items', async () => {
      const mockSnapshot = {
        docs: [],
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await getWishlistItems(userId);

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));

      await expect(getWishlistItems(userId)).rejects.toThrow('Firestore error');
    });
  });

  describe('getWishlistItem', () => {
    it('should fetch a specific wishlist item', async () => {
      const mockDocSnap = {
        exists: () => true,
        id: 'item-1',
        data: () => ({
          name: 'Lightning Bolt',
          quantity: 1,
          userId,
          createdAt: { toDate: () => new Date() },
          updatedAt: { toDate: () => new Date() },
        }),
      };

      mockGetDoc.mockResolvedValue(mockDocSnap);

      const result = await getWishlistItem(userId, 'item-1');

      expect(result).toBeTruthy();
      expect(result?.name).toBe('Lightning Bolt');
      expect(mockGetDoc).toHaveBeenCalled();
    });

    it('should return null when item does not exist', async () => {
      const mockDocSnap = {
        exists: () => false,
      };

      mockGetDoc.mockResolvedValue(mockDocSnap);

      const result = await getWishlistItem(userId, 'non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockGetDoc.mockRejectedValue(new Error('Firestore error'));

      await expect(getWishlistItem(userId, 'item-1')).rejects.toThrow('Firestore error');
    });
  });

  describe('addWishlistItem', () => {
    it('should add a new wishlist item', async () => {
      mockAddDoc.mockResolvedValue({ id: 'new-item-id' });

      const newItem = {
        name: 'Lightning Bolt',
        quantity: 1,
        setCode: 'M21',
        collectorNumber: '161',
      };

      const result = await addWishlistItem(userId, newItem);

      expect(result).toBe('new-item-id');
      expect(mockAddDoc).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockAddDoc.mockRejectedValue(new Error('Firestore error'));

      await expect(
        addWishlistItem(userId, {
          name: 'Lightning Bolt',
          quantity: 1,
        })
      ).rejects.toThrow('Firestore error');
    });
  });

  describe('updateWishlistItem', () => {
    it('should update an existing wishlist item', async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateWishlistItem(userId, 'item-1', {
        quantity: 3,
        notes: 'Updated notes',
      });

      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockUpdateDoc.mockRejectedValue(new Error('Firestore error'));

      await expect(
        updateWishlistItem(userId, 'item-1', { quantity: 3 })
      ).rejects.toThrow('Firestore error');
    });
  });

  describe('deleteWishlistItem', () => {
    it('should delete a wishlist item', async () => {
      mockDeleteDoc.mockResolvedValue(undefined);

      await deleteWishlistItem(userId, 'item-1');

      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockDeleteDoc.mockRejectedValue(new Error('Firestore error'));

      await expect(deleteWishlistItem(userId, 'item-1')).rejects.toThrow('Firestore error');
    });
  });
});

