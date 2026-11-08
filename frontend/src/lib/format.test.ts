import { describe, expect, it } from "vitest";
import type { Account } from "../api/types";
import { getDefaultAccount } from "./format";

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    name: "Cuenta",
    currency: "UYU",
    opening_balance: "0.00",
    current_balance: "0.00",
    is_active: true,
    is_default: false,
    ...overrides,
  };
}

describe("getDefaultAccount", () => {
  it("elige la cuenta marcada is_default sin importar su posición", () => {
    const accounts = [
      account({ id: 1, name: "Ahorro" }),
      account({ id: 2, name: "Cuenta principal", is_default: true }),
      account({ id: 3, name: "Zeta" }),
    ];
    expect(getDefaultAccount(accounts)?.id).toBe(2);
  });

  it("recurre a la primera cuenta si ninguna es default", () => {
    const accounts = [
      account({ id: 5, name: "Ahorro" }),
      account({ id: 6, name: "Cuenta principal" }),
    ];
    expect(getDefaultAccount(accounts)?.id).toBe(5);
  });

  it("devuelve undefined con una lista vacía", () => {
    expect(getDefaultAccount([])).toBeUndefined();
  });
});
