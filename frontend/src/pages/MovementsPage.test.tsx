import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MovementsPage } from "./MovementsPage";

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
const movement = {
  id: 99,
  date: "2026-01-02",
  kind: "expense",
  amount: "937.35",
  description: "Movimiento antiguo",
  notes: null,
  account_id: 1,
  destination_account_id: null,
  destination_amount: null,
  purpose: null,
  category_id: null,
  is_voided: false,
  created_at: "2026-01-02T12:00:00Z",
};
const account = {
  id: 1,
  name: "Cuenta UYU",
  currency: "UYU",
  opening_balance: "0.00",
  current_balance: "-937.35",
  is_active: true,
};
function stubMovementApi() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/transactions/99") && init?.method === "PATCH")
      return Promise.resolve(json(movement));
    if (url.endsWith("/transactions/99"))
      return Promise.resolve(json(movement));
    if (url.includes("/transactions?"))
      return Promise.resolve(
        json({ items: [], total: 0, page: 1, page_size: 20 }),
      );
    if (url.endsWith("/settings/accounts"))
      return Promise.resolve(json([account]));
    if (url.endsWith("/settings/categories"))
      return Promise.resolve(
        json([
          {
            id: 7,
            name: "Comida",
            kind: "expense",
            parent_id: null,
            is_active: true,
          },
        ]),
      );
    return Promise.reject(new Error(`URL inesperada: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderSelected() {
  render(
    <MemoryRouter initialEntries={["/movimientos?selected=99"]}>
      <MovementsPage />
    </MemoryRouter>,
  );
}
describe("MovementsPage", () => {
  it("permite cambiar categoría sin tocar un monto existente", async () => {
    const fetchMock = stubMovementApi();
    const user = userEvent.setup();
    renderSelected();
    await screen.findByRole("heading", { name: "Movimiento antiguo" });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText(/Monto · UYU/)).toHaveValue("937.35");
    await user.selectOptions(screen.getByLabelText("Categoría"), "7");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const patch = fetchMock.mock.calls.find(
      (call) => call[1]?.method === "PATCH",
    );
    expect(patch?.[1]?.body).toContain('"amount":"937.35"');
  });
  it("normaliza coma decimal al editar el monto", async () => {
    const fetchMock = stubMovementApi();
    const user = userEvent.setup();
    renderSelected();
    await screen.findByRole("heading", { name: "Movimiento antiguo" });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const amount = screen.getByLabelText(/Monto · UYU/);
    await user.clear(amount);
    await user.type(amount, "937,35");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const patch = fetchMock.mock.calls.find(
      (call) => call[1]?.method === "PATCH",
    );
    expect(patch?.[1]?.body).toContain('"amount":"937.35"');
  });
});
