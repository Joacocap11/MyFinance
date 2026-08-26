import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NewMovementPage } from "./NewMovementPage";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("NewMovementPage", () => {
  it("preserva el borrador completo cuando el servidor rechaza el alta", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes("/settings/accounts"))
        return Promise.resolve(
          json([
            {
              id: 1,
              name: "Billetera",
              currency: "UYU",
              opening_balance: "0.00",
              current_balance: "0.00",
              is_active: true,
            },
          ]),
        );
      if (url.includes("/settings/categories"))
        return Promise.resolve(
          json([
            {
              id: 8,
              name: "Comida",
              kind: "expense",
              parent_id: null,
              is_active: true,
            },
          ]),
        );
      if (url.endsWith("/transactions") && init?.method === "POST")
        return Promise.resolve(
          json({ detail: "No se pudo registrar ahora" }, 503),
        );
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/movimientos/nuevo"]}>
        <Routes>
          <Route path="/movimientos/nuevo" element={<NewMovementPage />} />
          <Route path="*" element={<div>Anterior</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const amount = await screen.findByLabelText(/Monto · UYU/);
    await user.type(amount, "875,40");
    await user.type(screen.getByLabelText("Descripción"), "Compra semanal");
    await user.selectOptions(screen.getByLabelText("Categoría"), "8");
    await user.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(
      await screen.findByText("No se pudo registrar ahora"),
    ).toBeInTheDocument();
    expect(amount).toHaveValue("875,40");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Compra semanal");
    expect(screen.getByLabelText("Categoría")).toHaveValue("8");
  });

  it("permite transferir entre monedas con monto recibido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.includes("/settings/accounts"))
          return Promise.resolve(
            json([
              {
                id: 1,
                name: "Pesos",
                currency: "UYU",
                opening_balance: "0.00",
                current_balance: "0.00",
                is_active: true,
              },
              {
                id: 2,
                name: "Dólares",
                currency: "USD",
                opening_balance: "0.00",
                current_balance: "0.00",
                is_active: true,
              },
            ]),
          );
        return Promise.resolve(json([]));
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/movimientos/nuevo"]}>
        <Routes>
          <Route path="/movimientos/nuevo" element={<NewMovementPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Nuevo movimiento");
    await user.click(screen.getByRole("button", { name: "Transferencia" }));

    expect(screen.getByLabelText(/^Cuenta de destino/)).not.toBeDisabled();
    expect(screen.getByLabelText(/^Monto recibido/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar transferencia" }),
    ).not.toBeDisabled();
  });
});
