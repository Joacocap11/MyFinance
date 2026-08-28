import * as SecureStore from "expo-secure-store";
import { api, loadStoredSession, saveSession } from "./client";
import type { Session } from "./types";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const session: Session = { access_token: "old-access", refresh_token: "refresh", token_type: "bearer", expires_in: 1800, user: { id: 1, email: "user@example.com" } };

test("refreshes once and retries a protected request", async () => {
  await saveSession(session);
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("/transactions?page=1&page_size=50")) {
      if (fetchMock.mock.calls.filter(call => String(call[0]).endsWith("/transactions?page=1&page_size=50")).length === 1)
        return Promise.resolve(new Response("{}", { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 1800 }), { status: 200 }));
  });
  await expect(api.transactions()).resolves.toMatchObject({ total: 0 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock.mockRestore();
});
test("SecureStore contiene únicamente la sesión y no credenciales", async () => {
  await saveSession(session);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("myfinance.session", JSON.stringify(session));
  expect(JSON.stringify(session)).not.toContain("password");
  expect(JSON.stringify(session)).not.toContain("password_hash");
});
test("restaura la sesión desde SecureStore", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(session));
  await expect(loadStoredSession()).resolves.toEqual(session);
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith("myfinance.session");
});

test("refresca /auth/me cuando el access token expiró", async () => {
  await saveSession(session);
  const fetchMock = jest.spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "bearer",
      expires_in: 1800,
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, email: "user@example.com" }), { status: 200 }));

  await expect(api.auth.me()).resolves.toEqual({ id: 1, email: "user@example.com" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
  fetchMock.mockRestore();
});
test("envía el cambio de contraseña sin persistir credenciales", async () => {
  await saveSession(session);
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "ok" }), { status: 200 }));
  await expect(api.auth.changePassword("current-password", "new-password-long")).resolves.toEqual({ detail: "ok" });
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/auth/change-password"), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ current_password: "current-password", new_password: "new-password-long" }),
  }));
  expect(JSON.stringify((SecureStore.setItemAsync as jest.Mock).mock.calls)).not.toContain("current-password");
  fetchMock.mockRestore();
});

test("expone un error claro cuando la API no responde", async () => {
  await saveSession(session);
  const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
  await expect(api.accounts()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("No se pudo conectar") });
  fetchMock.mockRestore();
});


test("sends transfer fields to the existing transactions endpoint", async () => {
  await saveSession(session);
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 4 }), { status: 201 }));
  await api.createTransaction({
    date: "2026-08-20", kind: "transfer", amount: "1000.00", description: "Ahorro",
    account_id: 1, destination_account_id: 2, destination_amount: "24.50", purpose: "savings", category_id: null,
  });
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/transactions"), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-20", kind: "transfer", amount: "1000.00", description: "Ahorro",
      account_id: 1, destination_account_id: 2, destination_amount: "24.50", purpose: "savings", category_id: null,
    }),
    headers: expect.any(Headers),
  }));
  fetchMock.mockRestore();
});
