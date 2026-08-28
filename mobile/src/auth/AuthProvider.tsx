import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, clearSession, getSession, loadStoredSession, saveLastLoginEmail, saveSession, setSessionExpiredHandler } from "../api/client";
import type { Session } from "../api/types";

type AuthValue = { session: Session | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setCurrentSession] = useState<Session | null>(getSession());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void clearSession();
      queryClient.clear();
      setCurrentSession(null);
    });
    void loadStoredSession().then(async stored => {
      if (stored) {
        try { await api.auth.me(); setCurrentSession(stored); }
        catch { await clearSession(); }
      }
      setLoading(false);
    });
    return () => setSessionExpiredHandler(undefined);
  }, [queryClient]);
  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    async login(email, password) {
      queryClient.clear();
      const next = await api.auth.login(email, password);
      await saveSession(next);
      await saveLastLoginEmail(email);
      setCurrentSession(next);
    },
    async logout() {
      await clearSession();
      queryClient.clear();
      setCurrentSession(null);
    },
  }), [loading, queryClient, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
