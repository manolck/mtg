import { renderHook } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { AuthProvider } from '../../context/AuthContext';

const mockAuthWithPassword = jest.fn();
const mockClear = jest.fn();
const mockOnChange = jest.fn();

jest.mock('../../services/pocketbase', () => ({
  pb: {
    collection: () => ({
      authWithPassword: mockAuthWithPassword,
    }),
    authStore: {
      isValid: false,
      model: null,
      onChange: (cb: () => void) => {
        mockOnChange.mockImplementation(cb);
        return () => {};
      },
      clear: mockClear,
    },
  },
}));

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
    mockAuthWithPassword.mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.login('test@example.com', 'password123');

    expect(mockAuthWithPassword).toHaveBeenCalledWith(
      'test@example.com',
      'password123',
    );
  });

  it('should handle logout', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.logout();

    expect(mockClear).toHaveBeenCalled();
  });
});
