import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { SettingsPage } from "./SettingsPage";

const login = vi.fn();
const register = vi.fn();
vi.mock("../auth", () => ({
  useAuth: () => ({ login, register, ready: true, session: null }),
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

describe("RegisterPage", () => {
  beforeEach(() => {
    register.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json({
      enabled: true,
      current_users: 1,
      max_users: 5,
      remaining_slots: 4,
    }))));
  });

  it("muestra el enlace de registro desde login y permite crear una cuenta", async () => {
    register.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const loginView = render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/register");
    loginView.unmount();
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secret");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "secret");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(register).toHaveBeenCalledWith("new@example.com", "secret");
  });

  it("valida confirmación y deshabilita el formulario cuando no quedan cupos", async () => {
    const user = userEvent.setup();
    const pageView = render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await user.type(screen.getByLabelText("Email"), "mismatch@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "secret");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "different");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");

    pageView.unmount();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json({
      enabled: false, current_users: 5, max_users: 5, remaining_slots: 0,
    }))));
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeDisabled());
    expect(screen.getByRole("link", { name: /Ya tengo cuenta/ })).toHaveAttribute("href", "/login");
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
