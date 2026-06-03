import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../config/api';

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'drm_auth_token';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) return stored;
    localStorage.removeItem(TOKEN_KEY);
    return null;
  });

  useEffect(() => {
    if (token && isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await axios.post<{ token: string }>(`${API_BASE}/auth/login`, { username, password });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setToken(res.data.token);
    navigate('/', { replace: true });
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}
