import { describe, expect, it } from "vitest";
import { calendarDayOffset, market, startOfDayInTimeZone, startOfMonthInTimeZone, startOfNextMonthInTimeZone } from "./market";

describe("Egyptian market configuration", () => {
  it("uses Egyptian currency, locales, and Cairo time", () => {
    expect(market).toEqual({
      currency: "EGP",
      timeZone: "Africa/Cairo",
      arabicLocale: "ar-EG",
      englishLocale: "en-EG"
    });
  });

  it("calculates day and month boundaries in Cairo time", () => {
    expect(startOfDayInTimeZone(new Date("2026-01-15T20:00:00Z")).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(startOfMonthInTimeZone(new Date("2026-01-15T20:00:00Z")).toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(startOfNextMonthInTimeZone(new Date("2026-01-15T20:00:00Z")).toISOString()).toBe("2026-01-31T22:00:00.000Z");
  });

  it("moves to the next Cairo calendar day across a UTC date boundary", () => {
    expect(calendarDayOffset(new Date("2026-01-15T21:59:59Z"), 1).toISOString()).toBe("2026-01-15T22:00:00.000Z");
  });
});
