import type { Currency } from "../api/types";

export function formatMoney(value: string, currency: Currency): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: currency === "UI" ? "UYU" : currency, minimumFractionDigits: 2 }).format(amount) + (currency === "UI" ? " UI" : "");
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Returns the device's calendar date, without UTC conversion. */
export function localDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDecimal(value: string): string {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return "";
  return normalized;
}

export function currentMonth(): string { return localDateIso().slice(0, 7); }
