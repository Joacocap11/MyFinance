/* eslint-disable react-refresh/only-export-components -- context and hook are one auth module. */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  clearStoredSession,
  loadStoredSession,
  persistSession,
  setSession,
  updateStoredSession,
} from "./api/client";
type User = { id: number; email: string; is_admin: boolean };
type Session = {
  access_token: string;
  refresh_token: string;
  user: User;
};

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setStoredSession] = useState<Session | null>(() => loadStoredSession());
  const [ready, setReady] = useState(() => loadStoredSession() === null);
  const validatedToken = useRef<string | null>(null);

  useEffect(() => {
    const expire = () => {
      clearStoredSession();
      setSession(null);
      setStoredSession(null);
      setReady(true);
    };
    window.addEventListener("myfinance-auth-expired", expire);
    return () => window.removeEventListener("myfinance-auth-expired", expire);
  }, []);

  useEffect(() => {
    if (!session) {
      validatedToken.current = null;
      setSession(null);
      return;
    }
    if (validatedToken.current === session.access_token) return;
    validatedToken.current = session.access_token;
    setSession(session);
    let active = true;
    void api.auth.me()
      .then((user) => {
        const next = { ...session, user };
        updateStoredSession(next);
        setSession(next);
        setStoredSession(next);
      })
      .catch(() => {
        if (active) {
          clearStoredSession();
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
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    async login(email, password, remember) {
      const next = await api.auth.login(email.trim(), password);
      persistSession(next, remember);
      setSession(next);
      setStoredSession(next);
      setReady(true);
    },
    async register(email, password) {
      const next = await api.auth.register(email.trim(), password);
      persistSession(next, false);
      setSession(next);
      setStoredSession(next);
      setReady(true);
    },
    logout() {
      clearStoredSession();
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
