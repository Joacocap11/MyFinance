import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { SettingsPage } from "./SettingsPage";

const login = vi.fn();
vi.mock("../auth", () => ({
  useAuth: () => ({ login, ready: true, session: null }),
}));

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const account = {
  id: 1,
  name: "Cuenta principal",
  currency: "UYU",
  opening_balance: "0.00",
  current_balance: "0.00",
  is_active: true,
};

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
  });

  it("envía credenciales y permite mostrar la contraseña", async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secret");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(login).toHaveBeenCalledWith("user@example.com", "secret");
  });

  it("muestra el error de credenciales y bloquea el submit mientras espera", async () => {
    login.mockRejectedValue(new Error("Credenciales inválidas"));
    const user = userEvent.setup();
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "wrong");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar sesión");
  });
});

describe("AccountsSettings", () => {
  it("lista cuentas y crea una cuenta con saldo inicial", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/settings/accounts") && init?.method === "POST")
        return Promise.resolve(json({ ...account, id: 2, name: "Ahorro USD", currency: "USD", opening_balance: "25.50", current_balance: "25.50" }, 201));
      if (url.endsWith("/settings/accounts")) return Promise.resolve(json([account]));
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(await screen.findByText("Cuenta principal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nueva cuenta" }));
    await user.type(screen.getByLabelText("Nombre"), "Ahorro USD");
    await user.selectOptions(screen.getByLabelText("Moneda"), "USD");
    const openingBalance = screen.getByRole("textbox", { name: /Saldo inicial/ });
    await user.clear(openingBalance);
    await user.type(openingBalance, "25.50");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    const body = postCall?.[1]?.body;
    expect(body).toEqual(expect.any(String));
    expect(JSON.parse(body as string)).toMatchObject({
      name: "Ahorro USD",
      currency: "USD",
      opening_balance: "25.50",
    });
  });
});
