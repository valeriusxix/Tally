import { describe, expect, it } from "vitest";

import { formatMoney, isIsoCurrency, minorDigits, parseMajorToMinor } from "./money";
import { addDays, localDateKey, localRangeToUtc } from "./time";

describe("money", () => {
  it("uses ISO minor units", () => {
    expect(minorDigits("NGN")).toBe(2);
    expect(minorDigits("JPY")).toBe(0);
    expect(parseMajorToMinor("1,500", "NGN")).toBe(150000);
    expect(parseMajorToMinor("12.50", "USD")).toBe(1250);
    expect(parseMajorToMinor("abc", "USD")).toBeNull();
  });
  it("formats with a narrow symbol", () => {
    expect(formatMoney(150000, "NGN", "en-US")).toBe("₦1,500");
  });
  it("validates currency codes", () => {
    expect(isIsoCurrency("NGN")).toBe(true);
    expect(isIsoCurrency("ngn")).toBe(false);
  });
});

describe("time", () => {
  it("maps a Lagos day to UTC (UTC+1)", () => {
    expect(localRangeToUtc("2026-11-08", "2026-11-08", "Africa/Lagos")).toEqual({
      fromUtc: "2026-11-07T23:00:00.000Z",
      toUtc: "2026-11-08T23:00:00.000Z",
    });
  });
  it("reads the local date of an instant", () => {
    expect(localDateKey("2026-11-07T23:30:00Z", "Africa/Lagos")).toBe("2026-11-08");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
