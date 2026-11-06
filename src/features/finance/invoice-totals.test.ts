import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "./invoice-totals";

describe("calculateInvoiceTotals", () => {
  it("matches the reference invoice: 93,900.00 sales + 14% VAT = 107,046.00", () => {
    const result = calculateInvoiceTotals([
      { description: "سير مفتوح عرض 80 سم 4 تيله", quantity: "65", unitPrice: "1440", unit: "MTR" },
      { description: "ذنبة تخريم", quantity: "1", unitPrice: "140" },
      { description: "مفتاح", quantity: "1", unitPrice: "160" }
    ], "14");
    expect(result?.subtotal.toFixed(2)).toBe("93900.00");
    expect(result?.taxAmount.toFixed(2)).toBe("13146.00");
    expect(result?.total.toFixed(2)).toBe("107046.00");
    expect(result?.normalized[0].unit).toBe("MTR");
    expect(result?.normalized[1].unit).toBeNull();
  });

  it("supports invoices without VAT", () => {
    const result = calculateInvoiceTotals([{ description: "بند", quantity: "2", unitPrice: "10.005" }], "0");
    expect(result?.subtotal.toFixed(2)).toBe("20.01");
    expect(result?.taxAmount.toFixed(2)).toBe("0.00");
    expect(result?.total.toFixed(2)).toBe("20.01");
  });

  it("rounds VAT half-up to the piaster", () => {
    const result = calculateInvoiceTotals([{ description: "بند", quantity: "1", unitPrice: "0.25" }], "14");
    expect(result?.taxAmount.toFixed(2)).toBe("0.04");
  });

  it("rejects zero totals, negative prices and invalid rates", () => {
    expect(calculateInvoiceTotals([{ description: "بند", quantity: "1", unitPrice: "0" }], "14")).toBeNull();
    expect(calculateInvoiceTotals([{ description: "بند", quantity: "1", unitPrice: "-1" }], "14")).toBeNull();
    expect(calculateInvoiceTotals([{ description: "بند", quantity: "1", unitPrice: "10" }], "120")).toBeNull();
  });
});
