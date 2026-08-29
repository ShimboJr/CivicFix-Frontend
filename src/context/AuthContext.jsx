import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'civicfix_token';

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true); // true until rehydration settles

  // ── Rehydrate session on mount ─────────────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      setLoading(false);
      return;
    }

    // Verify the token is still valid by fetching the current user
    api.get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => {
        // Token is expired or invalid — clear everything so the user gets
        // redirected to login rather than being stuck in a broken state
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Persist token helper ───────────────────────────────────────────────────
  const persistToken = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persistToken(data.token);
    setUser({ _id: data._id, name: data.name, email: data.email, role: data.role });
    return data; // return so the page component can redirect based on role
  }, [persistToken]);

  // ── register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    persistToken(data.token);
    setUser({ _id: data._id, name: data.name, email: data.email, role: data.role });
    return data;
  }, [persistToken]);

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      // Best-effort server-side notice (stateless — no real effect yet)
      await api.post('/auth/logout');
    } catch {
      // Ignore — client-side cleanup is what matters
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = { user, token, login, register, logout, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── useAuth hook ───────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}

export default AuthContext;
