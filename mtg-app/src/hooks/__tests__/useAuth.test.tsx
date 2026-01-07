import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { AuthProvider } from '../../context/AuthContext';
import { auth } from '../../services/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

jest.mock('../../services/firebase');
jest.mock('firebase/auth');

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should provide auth context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.login).toBeDefined();
    expect(result.current.logout).toBeDefined();
  });

  it('should handle login', async () => {
    const mockSignIn = signInWithEmailAndPassword as jest.Mock;
    mockSignIn.mockResolvedValue({} as any);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.login('test@example.com', 'password123');

    expect(mockSignIn).toHaveBeenCalledWith(
      auth,
      'test@example.com',
      'password123',
    );
  });

  it('should handle logout', async () => {
    const mockSignOut = signOut as jest.Mock;
    mockSignOut.mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.logout();

    expect(mockSignOut).toHaveBeenCalledWith(auth);
  });
});

