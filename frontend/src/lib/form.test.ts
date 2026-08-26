import { describe, expect, it } from "vitest";
import { parseMoney } from "./form";

describe("parseMoney", () => {
  it.each([
    ["937", "937.00"],
    ["937,35", "937.35"],
    ["937.35", "937.35"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
  ])("normaliza %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["abc", "1,,25", "1..25", "$UYU 20", "NaN", "Infinity"])(
    "rechaza %s",
    (input) => expect(() => parseMoney(input)).toThrow(),
  );
});
