import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api, clearSession, loadStoredSession, saveLastLoginEmail, saveSession, setSessionExpiredHandler } from "../api/client";
import type { Session } from "../api/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
type AuthValue = { session: Session | null; status: AuthStatus; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setCurrentSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let mounted = true;
    const expire = async () => {
      await clearSession();
      queryClient.clear();
      if (mounted) { setCurrentSession(null); setStatus("unauthenticated"); router.replace("/login"); }
    };
    setSessionExpiredHandler(expire);
    void (async () => {
      const stored = await loadStoredSession();
      if (!stored) { if (mounted) setStatus("unauthenticated"); return; }
      try {
        const user = await api.auth.me();
        const restored = { ...stored, user };
        await saveSession(restored);
        if (mounted) { setCurrentSession(restored); setStatus("authenticated"); }
      } catch { await expire(); }
    })();
    return () => { mounted = false; setSessionExpiredHandler(undefined); };
  }, [queryClient]);

  const value = useMemo<AuthValue>(() => ({
    session,
    status,
    loading: status === "loading",
    async login(email, password) {
      queryClient.clear();
      const tokens = await api.auth.login(email, password);
      // api.auth.login updates the synchronous client session before returning.
      const user = await api.auth.me();
      const next = { ...tokens, user };
      await saveSession(next);
      await saveLastLoginEmail(email);
      setCurrentSession(next);
      setStatus("authenticated");
    },
    async logout() {
      setCurrentSession(null);
      setStatus("unauthenticated");
      queryClient.clear();
      await clearSession();
      router.replace("/login");
    },
  }), [queryClient, session, status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}