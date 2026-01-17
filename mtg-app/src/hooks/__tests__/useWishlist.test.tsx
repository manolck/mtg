import { renderHook, waitFor, act } from '@testing-library/react';
import { useWishlist } from '../useWishlist';
import {
  getWishlistItems,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  deleteAllWishlistItems,
  isCardInWishlist,
} from '../../services/wishlistService';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { WishlistItem } from '../../types/card';

// Mock Firebase
jest.mock('../../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn((auth, callback) => {
      callback(null);
      return jest.fn();
    }),
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
}));

jest.mock('../../services/wishlistService', () => ({
  getWishlistItems: jest.fn(),
  addWishlistItem: jest.fn(),
  updateWishlistItem: jest.fn(),
  deleteWishlistItem: jest.fn(),
  deleteAllWishlistItems: jest.fn(),
  isCardInWishlist: jest.fn(),
  createWishlistItemFromCard: jest.fn(),
}));

const mockGetWishlistItems = getWishlistItems as jest.Mock;
const mockAddWishlistItem = addWishlistItem as jest.Mock;
const mockUpdateWishlistItem = updateWishlistItem as jest.Mock;
const mockDeleteWishlistItem = deleteWishlistItem as jest.Mock;
const mockDeleteAllWishlistItems = deleteAllWishlistItems as jest.Mock;
const mockIsCardInWishlist = isCardInWishlist as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;
const mockCollection = collection as jest.Mock;
const mockQuery = query as jest.Mock;
const mockOrderBy = orderBy as jest.Mock;

describe('useWishlist', () => {
  const userId = 'test-user-id';
  const mockWishlistItem: WishlistItem = {
    id: 'item-1',
    name: 'Lightning Bolt',
    quantity: 1,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({});
    mockQuery.mockReturnValue({});
    mockOrderBy.mockReturnValue({});
    
    // Mock onSnapshot to return an unsubscribe function
    mockOnSnapshot.mockReturnValue(() => {});
  });

  describe('Loading Wishlist', () => {
    it('should load wishlist items for a user', async () => {
      mockGetWishlistItems.mockResolvedValue([mockWishlistItem]);
      // Mock onSnapshot to call the success callback immediately
      mockOnSnapshot.mockImplementation((query, onNext, onError) => {
        onNext({
          docs: [{
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          }],
        });
        return () => {}; // Return unsubscribe function
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(mockGetWishlistItems).toHaveBeenCalledWith(userId);
    });

    it('should return empty array when userId is undefined', () => {
      const { result } = renderHook(() => useWishlist(undefined));

      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle loading errors', async () => {
      mockGetWishlistItems.mockRejectedValue(new Error('Load error'));

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Add Item', () => {
    it('should add an item to wishlist', async () => {
      mockGetWishlistItems.mockResolvedValue([]);
      mockAddWishlistItem.mockResolvedValue('new-item-id');
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({ docs: [] });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addItem('Lightning Bolt', 1);
      });

      expect(mockAddWishlistItem).toHaveBeenCalled();
    });

    it('should handle add error', async () => {
      mockGetWishlistItems.mockResolvedValue([]);
      mockAddWishlistItem.mockRejectedValue(new Error('Add error'));
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({ docs: [] });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.addItem('Lightning Bolt', 1);
        });
      }).rejects.toThrow();
    });
  });

  describe('Remove Item', () => {
    it('should remove an item from wishlist', async () => {
      mockGetWishlistItems.mockResolvedValue([mockWishlistItem]);
      mockDeleteWishlistItem.mockResolvedValue(undefined);
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({
          docs: [{
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          }],
        });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.removeItem('item-1');
      });

      expect(mockDeleteWishlistItem).toHaveBeenCalledWith(userId, 'item-1');
    });
  });

  describe('Update Item', () => {
    it('should update an item in wishlist', async () => {
      mockGetWishlistItems.mockResolvedValue([mockWishlistItem]);
      mockUpdateWishlistItem.mockResolvedValue(undefined);
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({
          docs: [{
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          }],
        });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateItem('item-1', { quantity: 3 });
      });

      expect(mockUpdateWishlistItem).toHaveBeenCalledWith(userId, 'item-1', { quantity: 3 });
    });
  });

  describe('Check If In Wishlist', () => {
    it('should check if a card is in wishlist', async () => {
      mockGetWishlistItems.mockResolvedValue([mockWishlistItem]);
      mockIsCardInWishlist.mockReturnValue(true);
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({
          docs: [{
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          }],
        });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const isInWishlist = result.current.checkIfInWishlist('Lightning Bolt', 'M21', '161');

      expect(isInWishlist).toBe(true);
    });
  });

  describe('Clear Wishlist', () => {
    it('should clear all items from wishlist', async () => {
      mockGetWishlistItems.mockResolvedValue([mockWishlistItem]);
      mockDeleteAllWishlistItems.mockResolvedValue(undefined);
      mockOnSnapshot.mockImplementation((query, onNext) => {
        onNext({
          docs: [{
            id: 'item-1',
            data: () => ({
              name: 'Lightning Bolt',
              quantity: 1,
              userId,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          }],
        });
        return () => {};
      });

      const { result } = renderHook(() => useWishlist(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.clearWishlist();
      });

      expect(mockDeleteAllWishlistItems).toHaveBeenCalledWith(userId);
    });
  });
});

