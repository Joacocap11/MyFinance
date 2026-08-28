import { currentMonth, formatDate, formatMoney, formatMonth, localDateIso, normalizeDecimal, shiftMonth } from "./format";

test("formats supported currencies without changing the source string", () => {
  expect(formatMoney("1250.50", "UYU")).toContain("1.250,50");
  expect(formatMoney("12.34", "USD")).toContain("12,34");
  expect(formatMoney("3.00", "UI")).toContain("UI");
});

test("formats accounting dates as local calendar dates", () => {
  expect(formatDate("2026-08-28")).toBe("28/08/2026");
  expect(localDateIso(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");
});

test.each([
  ["1000", "1000"],
  ["1000.50", "1000.50"],
  ["1000,50", "1000.50"],
  [" 1 000,5 ", "1000.5"],
])("normalizes decimal input %s", (input, expected) => {
  expect(normalizeDecimal(input)).toBe(expected);
});

test("rejects malformed or over-precise decimal input", () => {
  expect(normalizeDecimal("937,35")).toBe("937.35");
  expect(normalizeDecimal("10.999")).toBe("");
  expect(normalizeDecimal("abc")).toBe("");
});
test("navigates and formats historical months", () => {
  expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(formatMonth("2026-08")).toBe("Agosto de 2026");
  expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
});
