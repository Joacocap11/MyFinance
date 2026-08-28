import * as SecureStore from "expo-secure-store";
import { api, saveSession } from "./client";
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
