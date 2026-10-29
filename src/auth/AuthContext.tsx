import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import type { LoginPayload, RegisterPayload, TokenResponse, User } from '../api/types';

const TOKEN_KEY = 'xam.token';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  notice: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: (reason?: string) => void;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    localStorage.getItem(TOKEN_KEY) ? 'loading' : 'guest',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const userRef = useRef<User | null>(null);

  userRef.current = user;

  useEffect(() => {
    if (!token) {
      setUser(null);
      setStatus('guest');
      return;
    }

    if (userRef.current) {
      setStatus('authenticated');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    api
      .getMe(token)
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setUser(profile);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setStatus('guest');
        if (error instanceof ApiError && error.status === 401) {
          setNotice('Сессия истекла. Войдите снова.');
        } else {
          setNotice(
            error instanceof Error
              ? error.message
              : 'Не удалось подключиться к серверу. Проверьте, запущен ли бэкенд.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const applySession = useCallback((response: TokenResponse) => {
    localStorage.setItem(TOKEN_KEY, response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    setStatus('authenticated');
    setNotice(null);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const response = await api.login(payload);
      applySession(response);
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const response = await api.register(payload);
      applySession(response);
    },
    [applySession],
  );

  const logout = useCallback((reason?: string) => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus('guest');
    setNotice(reason ?? null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, token, user, notice, login, register, logout, clearNotice }),
    [status, token, user, notice, login, register, logout, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
