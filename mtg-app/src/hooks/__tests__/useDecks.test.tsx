import { renderHook, waitFor } from '@testing-library/react';
import { useDecks } from '../useDecks';
import { AuthProvider } from '../../context/AuthContext';
import * as deckService from '../../services/deckService';
import type { Deck } from '../../types/deck';

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

jest.mock('../../services/deckService', () => ({
  getDecks: jest.fn(),
  createDeck: jest.fn(),
  updateDeck: jest.fn(),
  deleteDeck: jest.fn(),
}));

const mockGetDecks = deckService.getDecks as jest.Mock;
const mockCreateDeck = deckService.createDeck as jest.Mock;
const mockDeleteDeck = deckService.deleteDeck as jest.Mock;

describe('useDecks', () => {
  const mockDeck: Deck = {
    id: 'deck-1',
    name: 'Test Deck',
    cards: [],
    userId: 'test-user-id',
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load decks for authenticated user', async () => {
    mockGetDecks.mockResolvedValue([mockDeck]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useDecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDecks).toHaveBeenCalledWith('test-user-id');
    expect(result.current.decks).toEqual([mockDeck]);
  });

  it('should create a new deck', async () => {
    mockGetDecks.mockResolvedValue([]);
    mockCreateDeck.mockResolvedValue({ ...mockDeck, id: 'new-deck-id' });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useDecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.createDeck('New Deck');

    expect(mockCreateDeck).toHaveBeenCalledWith('test-user-id', 'New Deck');
  });

  it('should delete a deck', async () => {
    mockGetDecks.mockResolvedValue([mockDeck]);
    mockDeleteDeck.mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useDecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.deleteDeck('deck-1');

    expect(mockDeleteDeck).toHaveBeenCalledWith('deck-1');
  });
});
