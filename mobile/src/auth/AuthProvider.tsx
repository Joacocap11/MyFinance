import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, clearSession, getSession, loadStoredSession, saveSession, setSessionExpiredHandler } from "../api/client";
import type { Session } from "../api/types";

type AuthValue = { session: Session | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setCurrentSession] = useState<Session | null>(getSession());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setSessionExpiredHandler(() => setCurrentSession(null));
    void loadStoredSession().then(async stored => {
      if (stored) {
        try { await api.auth.me(); setCurrentSession(stored); }
        catch { await clearSession(); }
      }
      setLoading(false);
    });
    return () => setSessionExpiredHandler(undefined);
  }, []);
  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    async login(email, password) { const next = await api.auth.login(email, password); await saveSession(next); setCurrentSession(next); },
    async logout() { await clearSession(); setCurrentSession(null); },
  }), [loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
