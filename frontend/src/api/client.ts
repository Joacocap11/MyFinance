import type {
  Account,
  ApiErrorBody,
  BalanceAdjustment,
  Category,
  CategoryRule,
  Currency,
  HistoryReport,
  ImportBatch,
  ImportConfirmation,
  ImportDisposition,
  ImportMapping,
  ImportRow,
  MonthlyBudget,
  MonthlyReport,
  Movement,
  MovementFilters,
  MovementInput,
  Page,
  RecurringExpense,
} from "./types";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "/api/v1";

type Primitive = string | number | boolean | null | undefined;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(
  body: ApiErrorBody | undefined,
  fallback: string,
): string {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail))
    return body.detail.map((item) => item.msg).join(". ");
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new ApiError(
      response.status,
      errorMessage(
        body,
        `No se pudo completar la solicitud (${response.status})`,
      ),
      body,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function query(params: object): string {
  const search = new URLSearchParams();
  const entries = Object.entries(params) as Array<[string, Primitive]>;
  entries.forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      search.set(key, String(value));
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const api = {
  reports: {
    monthly: (month: string, currency: Currency, signal?: AbortSignal) =>
      request<MonthlyReport>(`/reports/monthly${query({ month, currency })}`, {
        signal,
      }),
    history: (months: number, currency: Currency, signal?: AbortSignal) =>
      request<HistoryReport>(`/reports/history${query({ months, currency })}`, {
        signal,
      }),
  },
  movements: {
    list: (filters: MovementFilters, signal?: AbortSignal) =>
      request<Page<Movement>>(`/transactions${query(filters)}`, { signal }),
    get: (id: number, signal?: AbortSignal) =>
      request<Movement>(`/transactions/${id}`, { signal }),
    create: (input: MovementInput) =>
      request<Movement>("/transactions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: number, input: Partial<MovementInput>) =>
      request<Movement>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    void: (id: number) =>
      request<Movement>(`/transactions/${id}/void`, { method: "POST" }),
  },
  settings: {
    accounts: () => request<Account[]>("/settings/accounts"),
    createAccount: (input: Omit<Account, "id" | "current_balance">) =>
      request<Account>("/settings/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateAccount: (
      id: number,
      input: Partial<Pick<Account, "name" | "is_active" | "current_balance">>,
    ) =>
      request<Account>(`/settings/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    deleteAccount: (id: number) =>
      request<void>(`/settings/accounts/${id}`, { method: "DELETE" }),
    reconcileAccount: (
      id: number,
      input: { actual_balance: string; date: string; note: string },
    ) =>
      request<{
        account: Account;
        calculated_balance: string;
        actual_balance: string;
        adjustment: BalanceAdjustment | null;
        already_reconciled: boolean;
      }>(`/settings/accounts/${id}/reconcile`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    categories: () => request<Category[]>("/settings/categories"),
    createCategory: (input: Omit<Category, "id">) =>
      request<Category>("/settings/categories", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateCategory: (
      id: number,
      input: Partial<Omit<Category, "id" | "kind">>,
    ) =>
      request<Category>(`/settings/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    recurring: () =>
      request<RecurringExpense[]>("/settings/recurring-expenses"),
    createRecurring: (input: Omit<RecurringExpense, "id">) =>
      request<RecurringExpense>("/settings/recurring-expenses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateRecurring: (
      id: number,
      input: Partial<Omit<RecurringExpense, "id">>,
    ) =>
      request<RecurringExpense>(`/settings/recurring-expenses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    rules: () => request<CategoryRule[]>("/settings/rules"),
    createRule: (input: Omit<CategoryRule, "id">) =>
      request<CategoryRule>("/settings/rules", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateRule: (id: number, input: Partial<Omit<CategoryRule, "id">>) =>
      request<CategoryRule>(`/settings/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    budget: (currency: Currency) =>
      request<MonthlyBudget>(`/settings/monthly-budget${query({ currency })}`),
    updateBudget: (currency: Currency, amount: string | null) =>
      request<MonthlyBudget>(`/settings/monthly-budget${query({ currency })}`, {
        method: "PUT",
        body: JSON.stringify({ amount }),
      }),
  },
  imports: {
    upload: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return request<ImportBatch>("/imports", { method: "POST", body });
    },
    get: (id: string) => request<ImportBatch>(`/imports/${id}`),
    preview: (id: string, accountId: number, mapping: ImportMapping) =>
      request<ImportBatch>(`/imports/${id}/preview`, {
        method: "POST",
        body: JSON.stringify({ account_id: accountId, mapping }),
      }),
    updateRow: (
      batchId: string,
      rowId: number,
      input: { category_id?: number | null; disposition?: ImportDisposition },
    ) =>
      request<ImportRow>(`/imports/${batchId}/rows/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    confirm: (id: string) =>
      request<ImportConfirmation>(`/imports/${id}/confirm`, { method: "POST" }),
  },
};
