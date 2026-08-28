import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/api";
import type { Account, Category, MonthlyReport, Session, Transaction, TransactionInput, TransactionPage } from "./types";

const SESSION_KEY = "myfinance.session";
let session: Session | null = null;
let refreshPromise: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | undefined;

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function setSessionExpiredHandler(handler: (() => void) | undefined) { onSessionExpired = handler; }
export function getSession() { return session; }
export async function loadStoredSession(): Promise<Session | null> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  if (!stored) return null;
  try { session = JSON.parse(stored) as Session; return session; } catch { await clearSession(); return null; }
}
export async function saveSession(value: Session) { session = value; await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value)); }
export async function clearSession() { session = null; await SecureStore.deleteItemAsync(SESSION_KEY); }

async function refresh(): Promise<boolean> {
  if (!session) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) })
      .then(async response => {
        if (!response.ok) return false;
        const tokens = await response.json() as Omit<Session, "user">;
        await saveSession({ ...session!, ...tokens });
        return true;
      }).catch(() => false).finally(() => { refreshPromise = null; });
  }
  const refreshed = await refreshPromise;
  if (!refreshed) { await clearSession(); onSessionExpired?.(); }
  return refreshed;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const headers = new Headers(init?.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers }); }
  catch { throw new ApiError(0, "No se pudo conectar con MyFinance. Verificá la red o que el servidor esté disponible."); }
  if (response.status === 401 && !retried && path !== "/auth/login" && path !== "/auth/refresh" && await refresh()) return request<T>(path, init, true);
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const detail = typeof (body as { detail?: unknown })?.detail === "string" ? (body as { detail: string }).detail : `No se pudo completar la solicitud (${response.status})`;
    throw new ApiError(response.status, detail, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (email: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request<{ id: number; email: string }>("/auth/me"),
  },
  dashboard: (month: string, currency: "UYU" | "USD" | "UI") => request<MonthlyReport>(`/reports/monthly?month=${month}&currency=${currency}`),
  accounts: () => request<Account[]>("/settings/accounts"),
  account: (id: number) => request<Account>(`/settings/accounts/${id}`),
  categories: (kind = "expense") => request<Category[]>(`/settings/categories?kind=${kind}`),
  transactions: (page = 1, accountId?: number) => request<TransactionPage>(`/transactions?page=${page}&page_size=50${accountId === undefined ? "" : `&account_id=${accountId}`}`),
  transaction: (id: number) => request<Transaction>(`/transactions/${id}`),
  createTransaction: (input: TransactionInput) => request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(input) }),
  updateTransaction: (id: number, input: Partial<TransactionInput>) => request<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  voidTransaction: (id: number) => request<Transaction>(`/transactions/${id}/void`, { method: "POST" }),
};
