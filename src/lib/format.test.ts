import { describe, expect, it } from "vitest";
import { formatAmount, formatCurrency } from "./format";

describe("formatCurrency", () => {
  it.each([
    ["ar", "ar-EG"],
    ["en", "en-EG"]
  ] as const)("formats Egyptian pounds for %s", (locale, localeName) => {
    const expected = new Intl.NumberFormat(localeName, {
      style: "currency",
      currency: "EGP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(1234.56);

    expect(formatCurrency("1234.56", locale)).toBe(expected);
  });

  it("preserves exact integer and fractional digits beyond JavaScript's safe integer range", () => {
    expect(formatCurrency("9007199254740993123.45", "en")).toContain("9,007,199,254,740,993,123");
    expect(formatCurrency("9007199254740993123.45", "en")).toContain(".45");
  });

  it("rejects non-finite currency amounts", () => {
    expect(() => formatCurrency("NaN", "en")).toThrow(TypeError);
    expect(() => formatCurrency("Infinity", "ar")).toThrow(TypeError);
  });
});

describe("formatAmount", () => {
  it("formats exact amounts without a currency symbol", () => {
    expect(formatAmount("93900", "en")).toBe("93,900.00");
    expect(formatAmount("13146.5", "en")).toBe("13,146.50");
    expect(formatAmount("107046", "ar")).toBe(new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2 }).format(107046));
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatAmount("NaN", "ar")).toThrow(TypeError);
  });
});
