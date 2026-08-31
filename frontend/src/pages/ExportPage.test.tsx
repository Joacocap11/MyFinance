import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

vi.mock("../auth", () => ({ useAuth: () => ({ ready: true, session: null, logout: vi.fn() }) }));

const account = {
  id: 1, name: "Cuenta principal", currency: "UYU", opening_balance: "0.00",
  current_balance: "0.00", is_active: true,
};

describe("account CSV export", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      if (url.endsWith("/settings/accounts")) return Promise.resolve(new Response(JSON.stringify([account])));
      if (url.endsWith("/settings/accounts/1/export.csv"))
        return Promise.resolve(new Response("date,description\n", {
          headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="myfinance-cuenta-uyu.csv"' },
        }));
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    }));
  });

  it("muestra el botón y descarga el blob desde el endpoint de la cuenta", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Exportar CSV" }));
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.some(([input]) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      return url.endsWith("/settings/accounts/1/export.csv");
    })).toBe(true);
  });
});
