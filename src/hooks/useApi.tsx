import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Api } from '@jellyfin/sdk';
import { createJellyfinApi } from '../lib/jellyfin/api';
import { authenticate } from '../lib/jellyfin/auth';
import { clearSession, loadSession, saveSession, type Session } from '../lib/jellyfin/session';

const SERVER_URL = '/jf';

type AuthCtx = {
  session: Session | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
};
const AuthContext = createContext<AuthCtx | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const login = useCallback(async (u: string, p: string) => {
    const s = await authenticate(SERVER_URL, u, p);
    saveSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within ApiProvider');
  return ctx;
}

export function useApi(): { api: Api; session: Session } {
  const { session } = useAuth();
  if (!session) throw new Error('useApi requires an authenticated session');
  const api = useMemo(
    () => createJellyfinApi(session.serverUrl, session.accessToken),
    [session.serverUrl, session.accessToken],
  );
  return { api, session };
}
