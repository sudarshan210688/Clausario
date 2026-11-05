import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, UNAUTHORIZED_EVENT } from '../services/api';
import type { ConfigResponse, MeResponse, MenuKey } from '../types/api';

// Session state: the current user, their menus (from /api/auth/me) and the UI config (/api/config).

interface AuthState {
  me: MeResponse | null;
  config: ConfigResponse | null;
  loading: boolean;
  has: (key: MenuKey) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [nextMe, nextConfig] = await Promise.all([api.me(), api.config()]);
      setMe(nextMe);
      setConfig(nextConfig);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => setMe(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      config,
      loading,
      has: (key) => me?.menus.some((m) => m.key === key) ?? false,
      login: async (username, password) => {
        await api.login(username, password);
        await refresh();
      },
      logout: async () => {
        await api.logout().catch(() => undefined);
        setMe(null);
      },
      refresh,
    }),
    [me, config, loading, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
