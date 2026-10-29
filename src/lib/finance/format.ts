/**
 * Display helpers for Sync Finance screens. Plain language only: "money
 * in", "money out" and "balance", never debits and credits (BRD §4).
 */
export {
  money,
  todayLocal,
  thisMonth,
  dateLabel,
  periodLabel,
  periodRange,
  addDays,
  addMonths,
  formatTotals,
  parseAmount,
  methodLabel,
  METHOD_OPTIONS,
  datePrefix,
  fileSafe,
  type StayCurrency as FinCurrency,
  type CurrencyTotals,
} from "../stay/format";
export { ACCOUNT_TYPE_LABELS, LEDGER_LABELS } from "../../../convex/finance/lib";

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "ZiG", label: "ZiG" },
] as const;

export const TX_KIND_LABELS: Record<string, string> = {
  receipt: "Money in",
  payment: "Money out",
  transfer: "Transfer",
  opening: "Opening balance",
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  prepared: "Awaiting approval",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  due: "Due",
  overdue: "Overdue",
};

/** Signed amount as "+USD 100" / "-USD 100" for money in and out lists. */
export function signed(amount: number, currency: string): string {
  const abs = Math.abs(amount).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : amount > 0 ? "+" : ""}${currency} ${abs}`;
}
