import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const report = {
  month: "2026-08",
  currency: "UYU",
  income: "3500.00",
  expenses: "1234.50",
  net: "2265.50",
  spent_percentage: "61.725",
  budget: "2000.00",
  comparison: {
    previous_month: "2026-07",
    previous_expenses: "1000.00",
    change_percentage: "23.45",
  },
  categories: [
    {
      category_id: 4,
      name: "Alimentación",
      amount: "900.00",
      percentage: "72.90",
    },
  ],
  top_expenses: [],
  recent_transactions: [],
  insights: [
    {
      type: "category_change",
      title: "Subió Alimentación",
      detail: "Explica la mayor parte del cambio.",
      category_id: 4,
      transaction_ids: [],
    },
  ],
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("DashboardPage", () => {
  it("mantiene el esqueleto hasta recibir totales del servidor y muestra el alcance de moneda", async () => {
    let resolveReport: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/reports/monthly"))
        return new Promise<Response>((resolve) => {
          resolveReport = resolve;
        });
      if (url.includes("/settings/accounts")) return Promise.resolve(json([]));
      if (url.includes("/settings/categories"))
        return Promise.resolve(json([]));
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter initialEntries={["/?month=2026-08&currency=UYU"]}>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByLabelText("Cargando").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
    resolveReport?.(json(report));

    expect((await screen.findAllByText(/1\.234,50/)).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/23,5% más que el período comparable/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UYU" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("vuelve a pedir el reporte al cambiar de moneda sin mezclar resultados", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/reports/monthly")) {
        const currency = url.includes("currency=USD") ? "USD" : "UYU";
        return Promise.resolve(
          json({
            ...report,
            currency,
            expenses: currency === "USD" ? "40.00" : "1234.50",
          }),
        );
      }
      return Promise.resolve(json([]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/?month=2026-08&currency=UYU"]}>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect((await screen.findAllByText(/1\.234,50/)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "USD" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("currency=USD"),
        expect.anything(),
      ),
    );
    expect((await screen.findAllByText(/US\$\s*40,00/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryAllByText(/1\.234,50/)).toHaveLength(0);
  });
});
