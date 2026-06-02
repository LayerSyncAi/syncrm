import { describe, it, expect } from "vitest";
import { getPeriodRange, shiftPeriod } from "../lib/reporting-periods";
import {
  estimateLeadValue,
  weightedForecastValue,
  conversionRate,
  inWindow,
  daysOnMarket,
  addToCurrencyMap,
} from "../../convex/reportingLib";

describe("getPeriodRange", () => {
  it("computes a Monday-start week containing the reference date", () => {
    // 2026-03-18 is a Wednesday.
    const { start, end, label } = getPeriodRange("week", new Date(2026, 2, 18, 12));
    const s = new Date(start);
    const e = new Date(end);
    expect(s.getDay()).toBe(1); // Monday
    expect(s.getDate()).toBe(16);
    expect(e.getDate()).toBe(22); // Sunday
    expect(start).toBeLessThan(end);
    expect(label).toContain("2026");
  });

  it("computes month boundaries", () => {
    const { start, end, label } = getPeriodRange("month", new Date(2026, 1, 10)); // Feb
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(start).getMonth()).toBe(1);
    expect(new Date(end).getDate()).toBe(28); // 2026 is not a leap year
    expect(label).toBe("February 2026");
  });

  it("computes quarter boundaries and label", () => {
    const { start, end, label } = getPeriodRange("quarter", new Date(2026, 4, 5)); // May → Q2
    expect(new Date(start).getMonth()).toBe(3); // April
    expect(new Date(end).getMonth()).toBe(5); // June
    expect(label).toBe("Q2 2026");
  });

  it("computes year boundaries", () => {
    const { start, end, label } = getPeriodRange("year", new Date(2026, 6, 1));
    expect(new Date(start).getMonth()).toBe(0);
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(end).getMonth()).toBe(11);
    expect(new Date(end).getDate()).toBe(31);
    expect(label).toBe("2026");
  });
});

describe("shiftPeriod", () => {
  it("moves to the previous month", () => {
    const prev = shiftPeriod("month", new Date(2026, 0, 15), -1);
    expect(prev.getMonth()).toBe(11);
    expect(prev.getFullYear()).toBe(2025);
  });
  it("moves to the next quarter", () => {
    const next = shiftPeriod("quarter", new Date(2026, 0, 15), 1);
    expect(next.getMonth()).toBe(3);
  });
});

describe("estimateLeadValue", () => {
  it("prefers a positive dealValue", () => {
    expect(estimateLeadValue({ dealValue: 500, budgetMin: 100, budgetMax: 200 })).toBe(500);
  });
  it("falls back to budget midpoint", () => {
    expect(estimateLeadValue({ budgetMin: 100, budgetMax: 300 })).toBe(200);
  });
  it("uses a single available budget bound", () => {
    expect(estimateLeadValue({ budgetMax: 300 })).toBe(300);
    expect(estimateLeadValue({ budgetMin: 150 })).toBe(150);
  });
  it("returns 0 when nothing is known", () => {
    expect(estimateLeadValue({})).toBe(0);
    expect(estimateLeadValue({ dealValue: 0 })).toBe(0);
  });
});

describe("weightedForecastValue", () => {
  it("weights by probability percentage", () => {
    expect(weightedForecastValue(1000, 40)).toBe(400);
  });
  it("treats missing probability as 0", () => {
    expect(weightedForecastValue(1000, undefined)).toBe(0);
  });
  it("clamps out-of-range probabilities", () => {
    expect(weightedForecastValue(1000, 150)).toBe(1000);
    expect(weightedForecastValue(1000, -10)).toBe(0);
  });
});

describe("conversionRate", () => {
  it("returns a one-decimal percentage", () => {
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(3, 4)).toBe(75);
  });
  it("returns 0 with no closed deals", () => {
    expect(conversionRate(0, 0)).toBe(0);
  });
});

describe("inWindow", () => {
  it("is inclusive of both bounds", () => {
    expect(inWindow(10, 10, 20)).toBe(true);
    expect(inWindow(20, 10, 20)).toBe(true);
    expect(inWindow(9, 10, 20)).toBe(false);
    expect(inWindow(undefined, 10, 20)).toBe(false);
  });
});

describe("daysOnMarket", () => {
  it("counts whole days and never goes negative", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(daysOnMarket(0, 10 * day)).toBe(10);
    expect(daysOnMarket(10 * day, 0)).toBe(0);
  });
});

describe("addToCurrencyMap", () => {
  it("accumulates per currency and defaults blank to USD", () => {
    const m: Record<string, number> = {};
    addToCurrencyMap(m, "USD", 100);
    addToCurrencyMap(m, "USD", 50);
    addToCurrencyMap(m, "", 25);
    addToCurrencyMap(m, "ZWL", 10);
    expect(m).toEqual({ USD: 175, ZWL: 10 });
  });
});
