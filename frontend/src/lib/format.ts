import type {
  Account,
  Category,
  Currency,
  Movement,
  MovementKind,
} from "../api/types";

const moneyFormatters: Record<Currency, Intl.NumberFormat> = {
  UYU: new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }),
  UI: new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

export function formatMoney(
  value: string | null | undefined,
  currency: Currency,
): string {
  if (value === null || value === undefined) return "No disponible";
  return moneyFormatters[currency].format(Number(value));
}

export function signedMoney(
  movement: Movement,
  account: Account | undefined,
): string {
  const currency = account?.currency ?? "UYU";
  const prefix =
    movement.kind === "expense" ? "−" : movement.kind === "income" ? "+" : "↔ ";
  return `${prefix}${formatMoney(movement.amount, currency)}`;
}

export function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const label = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return today().slice(0, 7);
}

export const kindLabels: Record<MovementKind, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export function categoryPath(
  category: Category,
  categories: Category[],
): string {
  const names = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parent_id;
  while (parentId !== null) {
    const parent = categories.find((item) => item.id === parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);

    names.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return names.join(" › ");
}

export function sortCategories(categories: Category[]): Category[] {
  const collator = new Intl.Collator("es", { sensitivity: "base" });
  const children = new Map<number | null, Category[]>();
  categories.forEach((category) => {
    const group = children.get(category.parent_id) ?? [];
    group.push(category);
    children.set(category.parent_id, group);
  });
  const result: Category[] = [];
  const visit = (parentId: number | null) => {
    for (const category of (children.get(parentId) ?? []).sort((a, b) =>
      collator.compare(a.name, b.name),
    )) {
      result.push(category);
      visit(category.id);
    }
  };
  visit(null);
  return result;
}
