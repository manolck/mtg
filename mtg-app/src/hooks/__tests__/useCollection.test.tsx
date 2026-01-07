import { renderHook, waitFor } from '@testing-library/react';
import { useCollection } from '../useCollection';
import { AuthProvider } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { collection, getDocs, collectionGroup, query, limit } from 'firebase/firestore';
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

jest.mock('../useImports', () => ({
  useImports: () => ({
    createImport: jest.fn().mockResolvedValue('import-id'),
    updateImportStatus: jest.fn(),
    updateImportProgress: jest.fn(),
    saveImportReport: jest.fn(),
  }),
}));

const mockUseAuth = jest.fn();
jest.mock('../useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetDocs = getDocs as jest.Mock;
const mockCollection = collection as jest.Mock;
const mockCollectionGroup = collectionGroup as jest.Mock;

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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({});
    mockCollectionGroup.mockReturnValue({});
    mockUseAuth.mockReturnValue({ currentUser: mockUser });
  });

  it('should load collection for authenticated user', async () => {
    const mockSnapshot = {
      forEach: jest.fn((callback) => {
        callback({
          id: 'card-1',
          data: () => ({
            name: 'Lightning Bolt',
            quantity: 1,
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

    const { result } = renderHook(() => useCollection(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(mockGetDocs).toHaveBeenCalled();
  });

  it('should load all collections when userId is "all"', async () => {
    const mockSnapshot = {
      forEach: jest.fn(),
    };

    mockGetDocs.mockResolvedValue(mockSnapshot);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useCollection('all'), { wrapper });

    await waitFor(() => {
      expect(mockCollectionGroup).toHaveBeenCalled();
    });
  });

  it('should return empty collection when user is not authenticated', () => {
    mockUseAuth.mockReturnValueOnce({ currentUser: null });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useCollection(), { wrapper });

    expect(result.current.cards).toEqual([]);
  });

  it('should handle delete card', async () => {
    const mockSnapshot = {
      forEach: jest.fn(),
    };

    mockGetDocs.mockResolvedValue(mockSnapshot);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <div>{children}</div>
      </AuthProvider>
    );

    const { result } = renderHook(() => useCollection(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Mock deleteDoc
    const { deleteDoc: mockDeleteDoc } = require('firebase/firestore');
    mockDeleteDoc.mockResolvedValue(undefined);

    await result.current.deleteCard('card-1');

    expect(mockDeleteDoc).toHaveBeenCalled();
  });
});

