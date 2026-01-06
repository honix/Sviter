import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { User, ProvidersResponse } from '../services/auth-api';
import {
  initAuth,
  clearTokens,
  getAccessToken,
  getLoginUrl,
  refreshTokens,
  storeTokens,
} from '../services/auth-api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  providers: ProvidersResponse | null;
  // Actions
  logout: () => void;
  refresh: () => Promise<void>;
  loginWithProvider: (provider: string) => void;
  getAuthToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await initAuth();
      setUser(result.user);
      setProviders(result.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize auth');
      console.error('Auth initialization failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Auto-refresh tokens before expiry (every 50 minutes for 60-min tokens)
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(
      async () => {
        try {
          const tokens = await refreshTokens();
          storeTokens(tokens.access_token, tokens.refresh_token);
          setUser(tokens.user);
        } catch {
          // Token refresh failed, user needs to re-authenticate
          console.warn('Token refresh failed, logging out');
          setUser(null);
          clearTokens();
        }
      },
      50 * 60 * 1000
    ); // 50 minutes

    return () => clearInterval(refreshInterval);
  }, [user]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    // Reload to get new guest if enabled
    loadUser();
  }, [loadUser]);

  const refresh = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  const loginWithProvider = useCallback(
    (provider: string) => {
      // Pass current guest ID if user is a guest (for account linking)
      const guestId = user?.type === 'guest' ? user.id : undefined;
      window.location.href = getLoginUrl(provider, guestId);
    },
    [user]
  );

  const getAuthToken = useCallback(() => {
    return getAccessToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        userId: user?.id || null,
        isAuthenticated: !!user,
        providers,
        logout,
        refresh,
        loginWithProvider,
        getAuthToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
