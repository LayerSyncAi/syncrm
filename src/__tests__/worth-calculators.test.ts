import { describe, it, expect } from "vitest";
import { comparisonValue, costValue, incomeValue, median, roundTo } from "../lib/worth/calculators";

describe("comparison method", () => {
  it("averages adjusted rates per m² and applies them to the subject", () => {
    const r = comparisonValue(
      [
        { price: 200_000, buildingSizeM2: 200, adjustmentPct: 0 }, // 1000/m²
        { price: 300_000, buildingSizeM2: 250, adjustmentPct: -10 }, // 1200 → 1080
        { price: 100_000, adjustmentPct: 0 }, // no size: skipped
      ],
      220
    )!;
    expect(r.rates).toHaveLength(2);
    expect(r.averageRateM2).toBeCloseTo(1040);
    expect(r.value).toBeCloseTo(228_800);
    expect(r.medianRateM2).toBeCloseTo(1040);
  });

  it("can use land area", () => {
    const r = comparisonValue([{ price: 50_000, landSizeM2: 1000, adjustmentPct: 20 }], 2000, "land")!;
    expect(r.value).toBeCloseTo(120_000);
  });

  it("returns null without usable evidence or subject area", () => {
    expect(comparisonValue([{ price: 1, adjustmentPct: 0 }], 100)).toBe(null);
    expect(comparisonValue([{ price: 100, buildingSizeM2: 1, adjustmentPct: 0 }], 0)).toBe(null);
  });
});

describe("income method", () => {
  it("capitalises net annual rent at the yield", () => {
    expect(incomeValue(2_000, 4_000, 10)).toEqual({ netAnnualRent: 20_000, value: 200_000 });
  });
  it("rejects a zero yield or negative net rent", () => {
    expect(incomeValue(1_000, 0, 0)).toBe(null);
    expect(incomeValue(100, 5_000, 8)).toBe(null);
  });
});

describe("cost method", () => {
  it("adds land to depreciated replacement cost", () => {
    const r = costValue({
      landValue: 40_000,
      buildings: [
        { areaM2: 200, rateM2: 500 },
        { areaM2: 40, rateM2: 250 },
      ],
      depreciationPct: 20,
      externalWorks: 10_000,
    });
    expect(r.replacementCost).toBe(120_000);
    expect(r.depreciation).toBe(24_000);
    expect(r.value).toBe(136_000);
  });
  it("clamps depreciation to 0..100%", () => {
    expect(costValue({ landValue: 0, buildings: [{ areaM2: 10, rateM2: 10 }], depreciationPct: 150, externalWorks: 0 }).value).toBe(0);
  });
});

describe("helpers", () => {
  it("rounds and finds medians", () => {
    expect(roundTo(228_800)).toBe(229_000);
    expect(roundTo(228_800, 5_000)).toBe(230_000);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
