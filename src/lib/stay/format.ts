/**
 * Display helpers for SyncStay screens. Money always shows its currency and
 * is never converted; the arithmetic rules live in convex/stay/ledger.ts.
 */
import {
  AGE_BUCKET_LABELS,
  dateLabel,
  formatAmount,
  formatTotals,
  periodLabel,
  periodRange,
  addDays,
  addMonths,
  todayIn,
  type CurrencyTotals,
  type StayCurrency,
} from "../../../convex/stay/ledger";

export { AGE_BUCKET_LABELS, addDays, addMonths, dateLabel, formatTotals, periodLabel, periodRange, todayIn };
export type { CurrencyTotals, StayCurrency };

/** "USD 1,250.50" */
export function money(amount: number | null | undefined, currency: StayCurrency | string | null | undefined): string {
  if (amount === null || amount === undefined || !currency) return "-";
  return formatAmount(amount, currency as StayCurrency);
}

/** Today in the user's browser zone; Stay dates are plain "YYYY-MM-DD". */
export function todayLocal(): string {
  try {
    return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return todayIn();
  }
}

export function thisMonth(): string {
  return todayLocal().slice(0, 7);
}

export const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "other", label: "Other" },
] as const;

export function methodLabel(m: string): string {
  return METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m;
}

export const HELD_IN_OPTIONS = [
  { value: "trust", label: "Trust account" },
  { value: "business", label: "Business account" },
  { value: "landlord", label: "Paid to landlord" },
] as const;

export function heldInLabel(h: string): string {
  return HELD_IN_OPTIONS.find((o) => o.value === h)?.label ?? h;
}

export const CHARGE_KIND_OPTIONS = [
  { value: "admin_fee", label: "Lease admin fee" },
  { value: "damage", label: "Damage" },
  { value: "late_fee", label: "Late fee" },
  { value: "utilities", label: "Utilities recovery" },
  { value: "other", label: "Other" },
  { value: "rent", label: "Rent" },
] as const;

export function chargeKindLabel(k: string): string {
  return CHARGE_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;
}

export const UNIT_STATUS_LABELS: Record<string, string> = {
  vacant: "Vacant",
  occupied: "Occupied",
  notice: "Notice given",
};

export const LEASE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  ended: "Ended",
  renewed: "Renewed",
};

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

/** Parse a typed amount like "1,250.50"; NaN when not a number. */
export function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Safe file name part, e.g. for "Receipt RC-00012 Moyo.pdf". */
export function fileSafe(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/** YYMMDD_ prefix for exported files. */
export function datePrefix(): string {
  return todayLocal().replace(/-/g, "").slice(2) + "_";
}
