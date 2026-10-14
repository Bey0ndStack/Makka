import { describe, expect, it } from "vitest";
import { parseReportFilters } from "./report.service";

describe("parseReportFilters", () => {
  it("accepts an inclusive Cairo calendar-date range and merchant filter", () => {
    const result = parseReportFilters({ from: "2026-10-01", to: "2026-10-31", merchantId: "merchant-id" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid dates and reversed date ranges", () => {
    expect(parseReportFilters({ from: "2026-02-30" }).success).toBe(false);
    expect(parseReportFilters({ from: "2026-10-31", to: "2026-10-01" }).success).toBe(false);
  });
});
