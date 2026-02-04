import {
  getWishlistItems,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
} from '../wishlistService';
import type { WishlistItem } from '../../types/card';

const mockGetFullList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../pocketbase', () => ({
  pb: {
    collection: () => ({
      getFullList: mockGetFullList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    }),
  },
}));

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
  });

  describe('getWishlistItems', () => {
    it('should fetch all wishlist items for a user', async () => {
      mockGetFullList.mockResolvedValue([
        {
          id: 'item-1',
          userId,
          name: 'Lightning Bolt',
          quantity: 1,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
        {
          id: 'item-2',
          userId,
          name: 'Counterspell',
          quantity: 2,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ]);

      const result = await getWishlistItems(userId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Lightning Bolt');
      expect(result[1].name).toBe('Counterspell');
      expect(mockGetFullList).toHaveBeenCalledWith(
        expect.objectContaining({ filter: `userId = "${userId}"` })
      );
    });

    it('should return empty array when no items', async () => {
      mockGetFullList.mockResolvedValue([]);

      const result = await getWishlistItems(userId);

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockGetFullList.mockRejectedValue(new Error('API error'));

      await expect(getWishlistItems(userId)).rejects.toThrow('API error');
    });
  });

  describe('addWishlistItem', () => {
    it('should add a new wishlist item', async () => {
      mockCreate.mockResolvedValue({ id: 'new-item-id' });

      const newItem = {
        name: 'Lightning Bolt',
        quantity: 1,
        setCode: 'M21',
        collectorNumber: '161',
      };

      const result = await addWishlistItem(userId, newItem);

      expect(result).toBe('new-item-id');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      await expect(
        addWishlistItem(userId, {
          name: 'Lightning Bolt',
          quantity: 1,
        })
      ).rejects.toThrow('API error');
    });
  });

  describe('updateWishlistItem', () => {
    it('should update an existing wishlist item', async () => {
      mockUpdate.mockResolvedValue(undefined);

      await updateWishlistItem(userId, 'item-1', {
        quantity: 3,
        notes: 'Updated notes',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ quantity: 3, notes: 'Updated notes' })
      );
    });

    it('should handle errors gracefully', async () => {
      mockUpdate.mockRejectedValue(new Error('API error'));

      await expect(
        updateWishlistItem(userId, 'item-1', { quantity: 3 })
      ).rejects.toThrow('API error');
    });
  });

  describe('deleteWishlistItem', () => {
    it('should delete a wishlist item', async () => {
      mockDelete.mockResolvedValue(undefined);

      await deleteWishlistItem(userId, 'item-1');

      expect(mockDelete).toHaveBeenCalledWith('item-1');
    });

    it('should handle errors gracefully', async () => {
      mockDelete.mockRejectedValue(new Error('API error'));

      await expect(deleteWishlistItem(userId, 'item-1')).rejects.toThrow('API error');
    });
  });
});
