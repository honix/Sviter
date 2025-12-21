import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../services/auth-api';
import { initAuth, clearGuestId, getStoredGuestId } from '../services/auth-api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  userId: string | null;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedUser = await initAuth();
      setUser(loadedUser);
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

  const logout = useCallback(() => {
    clearGuestId();
    setUser(null);
    // Reload to get new guest
    loadUser();
  }, [loadUser]);

  const refresh = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        userId: user?.id || getStoredGuestId(),
        logout,
        refresh,
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
