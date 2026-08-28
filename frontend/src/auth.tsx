import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, setSession } from "./api/client";

type User = { id: number; email: string };
export type Session = {
  access_token: string;
  refresh_token: string;
  user: User;
};

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const STORAGE_KEY = "myfinance.session";
const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): Session | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as Session) : null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setStoredSession] = useState<Session | null>(loadSession);
  const [ready, setReady] = useState(() => !loadSession());

  useEffect(() => {
    const expire = () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setStoredSession(null);
      setReady(true);
    };
    window.addEventListener("myfinance-auth-expired", expire);
    return () => window.removeEventListener("myfinance-auth-expired", expire);
  }, []);

  useEffect(() => {
    if (!session) {
      setSession(null);
      return;
    }
    setSession(session);
    let active = true;
    void api.auth.me()
      .then((user) => {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        const current = stored ? (JSON.parse(stored) as Session) : session;
        const next = { ...current, user };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSession(next);
        setStoredSession(next);
      })
      .catch(() => {
        if (active) {
          sessionStorage.removeItem(STORAGE_KEY);
          setSession(null);
          setStoredSession(null);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    async login(email, password) {
      const next = await api.auth.login(email.trim(), password);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
      setStoredSession(next);
      setReady(true);
    },
    logout() {
      sessionStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setStoredSession(null);
      window.dispatchEvent(new Event("myfinance-logout"));
    },
  }), [ready, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
