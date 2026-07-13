/**
 * Commission calculation helpers.
 *
 * Business rule: the gross commission earned on a closed deal is a fixed
 * percentage of the sale value (the "commission rate"). The split percentages
 * configured per scenario (property agent / lead agent / company) describe how
 * that commission pool is divided — they sum to 100% of the COMMISSION, not of
 * the sale value.
 *
 *   commissionAmount  = dealValue * COMMISSION_RATE      // e.g. 5% of the sale
 *   <party>Amount     = commissionAmount * <party>Percent / 100
 */

const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * Resolve the gross commission rate. Defaults to 5% and can be overridden per
 * deployment via the NEXT_PUBLIC_COMMISSION_RATE environment variable (a decimal
 * fraction between 0 and 1, e.g. "0.05" for 5%). Kept env-driven so the rate is
 * white-label configuration rather than a hardcoded literal. Reads
 * NEXT_PUBLIC_* so the same value is available in both the Convex runtime and
 * the browser bundle that renders the commissions UI.
 */
function resolveCommissionRate(): number {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_COMMISSION_RATE
      : undefined;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) {
      return parsed;
    }
  }
  return DEFAULT_COMMISSION_RATE;
}

/** Gross commission rate applied to the sale value (default 5%). */
export const COMMISSION_RATE = resolveCommissionRate();

/** The commission rate expressed as a whole-number percentage (e.g. 5). */
export const COMMISSION_RATE_PERCENT = COMMISSION_RATE * 100;

/** Gross commission pool earned on a deal of the given sale value. */
export function commissionPool(dealValue: number): number {
  return dealValue * COMMISSION_RATE;
}

export interface CommissionSplitPercents {
  propertyAgentPercent: number;
  leadAgentPercent: number;
  companyPercent: number;
}

export interface CommissionSplit {
  /** Gross commission pool (sale value * COMMISSION_RATE). */
  commissionAmount: number;
  propertyAgentAmount: number;
  leadAgentAmount: number;
  companyAmount: number;
}

/**
 * Split the gross commission pool among the three parties. The percentages are
 * shares of the commission pool and are expected to sum to 100.
 */
export function computeCommissionSplit(
  dealValue: number,
  { propertyAgentPercent, leadAgentPercent, companyPercent }: CommissionSplitPercents
): CommissionSplit {
  const commissionAmount = commissionPool(dealValue);
  return {
    commissionAmount,
    propertyAgentAmount: (commissionAmount * propertyAgentPercent) / 100,
    leadAgentAmount: (commissionAmount * leadAgentPercent) / 100,
    companyAmount: (commissionAmount * companyPercent) / 100,
  };
}
