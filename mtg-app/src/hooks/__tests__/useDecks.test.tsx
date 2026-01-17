import { renderHook, waitFor } from '@testing-library/react';
import { useDecks } from '../useDecks';
import { AuthProvider } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import type { Deck } from '../../types/deck';

// Mock Firebase
jest.mock('../../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
  },
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth, callback) => {
    // Appeler immédiatement le callback avec un utilisateur mocké
    callback({
      uid: 'test-user-id',
      email: 'test@example.com',
    });
    return jest.fn(); // Retourner une fonction unsubscribe
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  updateDoc: jest.fn(),
}));

const mockGetDocs = getDocs as jest.Mock;
const mockAddDoc = addDoc as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockCollection = collection as jest.Mock;

describe('useDecks', () => {
  const mockUser = {
    uid: 'test-user-id',
    email: 'test@example.com',
  };

  const mockDeck: Deck = {
    id: 'deck-1',
    name: 'Test Deck',
    cards: [],
    userId: 'test-user-id',
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({});
  });

  it('should load decks for authenticated user', async () => {
    const mockSnapshot = {
      forEach: jest.fn((callback) => {
        callback({
          id: 'deck-1',
          data: () => ({
            name: 'Test Deck',
            cards: [],
            userId: 'test-user-id',
            createdAt: { toDate: () => new Date() },
          }),
        });
      }),
    };

    mockGetDocs.mockResolvedValue(mockSnapshot);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    // Mock currentUser dans AuthProvider
    const { result } = renderHook(() => useDecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDocs).toHaveBeenCalled();
  });

  it('should create a new deck', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-deck-id' });
    mockGetDocs.mockResolvedValue({
      forEach: jest.fn(),
    });

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

    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('should delete a deck', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue({
      forEach: jest.fn(),
    });

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

    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('should return empty decks when user is not authenticated', async () => {
    // Mock onAuthStateChanged pour retourner null (utilisateur non authentifié)
    const { onAuthStateChanged } = require('firebase/auth');
    onAuthStateChanged.mockImplementationOnce((auth, callback) => {
      callback(null);
      return jest.fn();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useDecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.decks).toEqual([]);
  });
});

