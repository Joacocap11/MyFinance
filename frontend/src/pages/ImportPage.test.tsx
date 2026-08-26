import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage";

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

const uploaded = {
  id: "17",
  filename: "estado.csv",
  state: "uploaded",
  headers: ["Fecha", "Concepto", "Monto"],
  sample_rows: [{ Fecha: "25/08/2026", Concepto: "Café", Monto: "-220,00" }],
};
const previewed = {
  ...uploaded,
  state: "previewed",
  rows: [
    {
      id: 51,
      row_number: 2,
      date: "2026-08-25",
      description: "Café",
      amount: "220.00",
      kind: "expense",
      category_id: null,
      disposition: "possible_duplicate",
      possible_duplicate: true,
      error: null,
    },
  ],
};

describe("ImportPage", () => {
  it("mantiene visible un posible duplicado y exige una decisión explícita antes de confirmar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes("/settings/accounts"))
        return Promise.resolve(
          json([
            {
              id: 1,
              name: "Cuenta UYU",
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
              id: 3,
              name: "Comidas",
              kind: "expense",
              parent_id: null,
              is_active: true,
            },
          ]),
        );
      if (url.endsWith("/imports") && init?.method === "POST")
        return Promise.resolve(json(uploaded));
      if (url.endsWith("/imports/17/preview"))
        return Promise.resolve(json(previewed));
      if (url.endsWith("/imports/17/rows/51"))
        return Promise.resolve(
          json({ ...previewed.rows[0], disposition: "import" }),
        );
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );

    const fileInput = await screen.findByLabelText(/Seleccionar CSV/);
    await user.upload(
      fileInput,
      new File(
        ['Fecha,Concepto,Monto\n25/08/2026,Café,"-220,00"'],
        "estado.csv",
        { type: "text/csv" },
      ),
    );
    expect(
      await screen.findByText("Indicá qué significa cada columna"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Generar vista previa" }),
    );

    expect(await screen.findByText("Posible duplicado")).toBeInTheDocument();
    expect(
      screen.getByText(/compra repetida legítimamente se puede incluir/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar importación" }),
    ).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText("Decisión de fila 2"),
      "import",
    );
    expect(
      screen.getByRole("button", { name: "Confirmar importación" }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/imports/17/rows/51"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("rechaza archivos mayores a 2 MiB sin enviarlos al servidor", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/settings/accounts"))
        return Promise.resolve(
          json([
            {
              id: 1,
              name: "Cuenta",
              currency: "UYU",
              opening_balance: "0.00",
              current_balance: "0.00",
              is_active: true,
            },
          ]),
        );
      if (url.includes("/settings/categories"))
        return Promise.resolve(json([]));
      return Promise.reject(new Error("No debería subir el archivo"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );
    const largeFile = new File(
      [new Uint8Array(2 * 1024 * 1024 + 1)],
      "grande.csv",
      { type: "text/csv" },
    );
    await user.upload(
      await screen.findByLabelText(/Seleccionar CSV/),
      largeFile,
    );

    expect(
      await screen.findByText("El archivo supera el máximo de 2 MiB."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
