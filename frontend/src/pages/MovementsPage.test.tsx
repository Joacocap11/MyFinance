import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MovementsPage } from "./MovementsPage";

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

const movement = {
  id: 99,
  date: "2026-01-02",
  kind: "expense",
  amount: "42.00",
  description: "Movimiento antiguo",
  notes: null,
  account_id: 1,
  destination_account_id: null,
  category_id: null,
  is_voided: false,
  created_at: "2026-01-02T12:00:00Z",
};

const account = {
  id: 1,
  name: "Cuenta UYU",
  currency: "UYU",
  opening_balance: "0.00",
  current_balance: "-42.00",
  is_active: true,
};

describe("MovementsPage", () => {
  it("mantiene la moneda del reporte y busca el movimiento seleccionado fuera de la página", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/transactions/99"))
        return Promise.resolve(json(movement));
      if (url.includes("/transactions?"))
        return Promise.resolve(
          json({ items: [], total: 0, page: 1, page_size: 20 }),
        );
      if (url.endsWith("/settings/accounts"))
        return Promise.resolve(json([account]));
      if (url.endsWith("/settings/categories"))
        return Promise.resolve(json([]));
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter
        initialEntries={["/movimientos?month=2026-08&currency=UYU&selected=99"]}
      >
        <MovementsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Movimiento antiguo" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/transactions\?.*currency=UYU/),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/transactions/99"),
      expect.anything(),
    );
  });
});
