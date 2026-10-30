/**
 * SyncWorth valuation calculators (VW-42). Pure functions: the valuer sees
 * the workings, then chooses whether to use the result as a value.
 */

export type ComparableInput = {
  /** Sale price or market value, in the job's currency. */
  price?: number;
  landSizeM2?: number;
  buildingSizeM2?: number;
  /** Net adjustment, e.g. -10 for 10% down. */
  adjustmentPct: number;
};

export type ComparisonResult = {
  /** Adjusted rate per m² for each comparable that has a price and size. */
  rates: Array<{ index: number; rateM2: number; adjustedRateM2: number }>;
  averageRateM2: number;
  medianRateM2: number;
  value: number;
};

/**
 * Comparison method: each comparable's price per m² (building or land area),
 * adjusted by the valuer's %, averaged, then applied to the subject's area.
 * Comparables without a price or size are skipped. Null when none qualify
 * or the subject area is not positive.
 */
export function comparisonValue(
  comps: ComparableInput[],
  subjectAreaM2: number,
  basis: "building" | "land" = "building"
): ComparisonResult | null {
  if (!(subjectAreaM2 > 0)) return null;
  const rates: ComparisonResult["rates"] = [];
  comps.forEach((c, index) => {
    const size = basis === "land" ? c.landSizeM2 : c.buildingSizeM2;
    if (!c.price || c.price <= 0 || !size || size <= 0) return;
    const rateM2 = c.price / size;
    rates.push({ index, rateM2, adjustedRateM2: rateM2 * (1 + c.adjustmentPct / 100) });
  });
  if (rates.length === 0) return null;
  const adjusted = rates.map((r) => r.adjustedRateM2);
  const averageRateM2 = adjusted.reduce((a, b) => a + b, 0) / adjusted.length;
  return {
    rates,
    averageRateM2,
    medianRateM2: median(adjusted),
    value: averageRateM2 * subjectAreaM2,
  };
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Income method: net annual rent capitalised at the chosen yield.
 * Net rent = monthly rent × 12 less annual outgoings. Null when the yield
 * is not positive or the net rent is not positive.
 */
export function incomeValue(
  monthlyRent: number,
  annualOutgoings: number,
  yieldPct: number
): { netAnnualRent: number; value: number } | null {
  const netAnnualRent = monthlyRent * 12 - annualOutgoings;
  if (!(yieldPct > 0) || !(netAnnualRent > 0)) return null;
  return { netAnnualRent, value: netAnnualRent / (yieldPct / 100) };
}

/**
 * Cost method: land value plus building replacement cost (area × rate per
 * m² for each building), less depreciation on the buildings, plus external
 * works (walls, paving, pool) at depreciated cost too.
 */
export function costValue(input: {
  landValue: number;
  buildings: Array<{ areaM2: number; rateM2: number }>;
  depreciationPct: number;
  externalWorks: number;
}): { replacementCost: number; depreciation: number; value: number } {
  const pct = Math.min(Math.max(input.depreciationPct, 0), 100);
  const replacementCost =
    input.buildings.reduce((s, b) => s + Math.max(b.areaM2, 0) * Math.max(b.rateM2, 0), 0) +
    Math.max(input.externalWorks, 0);
  const depreciation = replacementCost * (pct / 100);
  return {
    replacementCost,
    depreciation,
    value: Math.max(input.landValue, 0) + replacementCost - depreciation,
  };
}

/** Round a value to the nearest `step` (valuers usually report round figures). */
export function roundTo(value: number, step = 1000): number {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}
