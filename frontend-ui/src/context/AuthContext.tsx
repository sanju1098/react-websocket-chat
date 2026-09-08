// Authentication state management: signup/login/logout, session persistence,
// and wiring the Socket.io connection to the current session token.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, login as loginRequest, signup as signupRequest } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../types';
import { AuthContext } from './auth-context';

const TOKEN_STORAGE_KEY = 'chat_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession(currentToken: string | null) {
      if (!currentToken) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await getMe(currentToken);
        if (!cancelled) {
          setUser(me);
          connectSocket(currentToken);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession(token);
    return () => {
      cancelled = true;
    };
    // Only run once on mount to restore an existing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistSession(newToken: string, newUser: User) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
    connectSocket(newToken);
  }

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await loginRequest(email, password);
      persistSession(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    }
  }, []);

  const signup = useCallback(
    async (username: string, email: string, password: string) => {
      setError(null);
      try {
        const res = await signupRequest(username, email, password);
        persistSession(res.token, res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Signup failed');
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, error, login, signup, logout }),
    [user, token, loading, error, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
