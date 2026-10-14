import { describe, expect, it } from "vitest";
import { calculateOutstanding } from "./balance";

describe("calculateOutstanding", () => {
  it("subtracts payment allocations exactly for decimal currency amounts", () => {
    const balance = calculateOutstanding("4500.00", ["1000.00", "1000.00"]);
    expect(balance.toFixed(2)).toBe("2500.00");
  });

  it("does not introduce floating point rounding errors", () => {
    const balance = calculateOutstanding("0.30", ["0.10", "0.20"]);
    expect(balance.toFixed(2)).toBe("0.00");
  });

  it("preserves negative balances so invalid over-allocation cannot be hidden", () => {
    const balance = calculateOutstanding("10.00", ["10.01"]);
    expect(balance.toFixed(2)).toBe("-0.01");
  });
});
