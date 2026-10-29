/**
 * Sync Finance rules kept pure (no Convex imports) so they can be unit-tested
 * and shared by the server and the app. Money and date helpers come from
 * Sync Stay's ledger so both modules round and format the same way.
 */
import { addTo, isValidDate, round2, type CurrencyTotals, type StayCurrency } from "../stay/ledger";

export type FinCurrency = StayCurrency;
export type FinLedger = "landlord" | "deposit" | "sale" | "developer" | "agency" | "unallocated";
export type FinAccountType = "trust" | "business" | "cash";

/** Ledgers that hold client money. Their total is "money held in trust". */
export const CLIENT_LEDGERS: FinLedger[] = ["landlord", "deposit", "sale", "developer"];

export const LEDGER_LABELS: Record<FinLedger, string> = {
  landlord: "Landlord",
  deposit: "Tenant deposit",
  sale: "Sale deposit",
  developer: "Developer",
  agency: "Agency",
  unallocated: "Unallocated",
};

export const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  trust: "Trust",
  business: "Business",
  cash: "Cash",
};

// ── Categories ───────────────────────────────────────────────────────

/**
 * Categories every agency starts with. Those with a `key` are posted to by
 * the system (commission, fees) and cannot be switched off; the rest are
 * plain suggestions the agency can rename or hide.
 */
export const DEFAULT_CATEGORIES: Array<{ name: string; kind: "income" | "expense"; key?: string }> = [
  { name: "Management commission", kind: "income", key: "management_fee" },
  { name: "Lease admin fees", kind: "income", key: "lease_admin_fee" },
  { name: "Sales commission", kind: "income", key: "sales_commission" },
  { name: "Stand sales commission", kind: "income", key: "stand_commission" },
  { name: "Stand sales", kind: "income", key: "stand_sales" },
  { name: "Other income", kind: "income", key: "other_income" },
  { name: "Agent commission", kind: "expense", key: "agent_commission" },
  { name: "Salaries", kind: "expense" },
  { name: "Fuel", kind: "expense" },
  { name: "Advertising", kind: "expense" },
  { name: "Office rent and utilities", kind: "expense" },
  { name: "Bank charges", kind: "expense" },
  { name: "Other expenses", kind: "expense", key: "other_expense" },
];

// ── Postings ─────────────────────────────────────────────────────────

export type PostingLine = {
  currency: FinCurrency;
  amount: number;
  accountId?: string;
  ledger?: FinLedger;
};

/**
 * The one rule of the ledger: per currency, money moved in accounts equals
 * money assigned to owners. Returns an error message, or null when it holds.
 */
export function checkPosting(lines: PostingLine[]): string | null {
  if (!lines.length) return "Nothing to post";
  const accounts: CurrencyTotals = {};
  const ledgers: CurrencyTotals = {};
  for (const l of lines) {
    if (!Number.isFinite(l.amount)) return "Amount is not a number";
    if (!!l.accountId === !!l.ledger) return "Each line needs an account or a ledger, not both";
    addTo(l.accountId ? accounts : ledgers, l.currency, l.amount);
  }
  for (const c of ["USD", "ZiG"] as const) {
    if (round2(accounts[c] ?? 0) !== round2(ledgers[c] ?? 0)) return `Lines do not balance in ${c}`;
  }
  return null;
}

/** Sum line amounts per currency. */
export function totalsOf(lines: Array<{ currency: FinCurrency; amount: number }>): CurrencyTotals {
  const t: CurrencyTotals = {};
  for (const l of lines) addTo(t, l.currency, l.amount);
  return t;
}

/** Commission on a base amount at a percentage, to the cent. */
export function feeOn(base: number, pct: number): number {
  if (!(pct > 0) || !(base > 0)) return 0;
  return round2((base * pct) / 100);
}

// ── Period lock ──────────────────────────────────────────────────────

/** True when `date` falls in a closed month. */
export function isLocked(date: string, lockedThrough?: string | null): boolean {
  return !!lockedThrough && date.slice(0, 7) <= lockedThrough;
}

export function checkDate(date: string, today: string, lockedThrough?: string | null): string | null {
  if (!isValidDate(date)) return "Enter a valid date";
  if (date > today) return "The date cannot be in the future";
  if (isLocked(date, lockedThrough)) return `${date.slice(0, 7)} is closed. Use a date in an open month.`;
  return null;
}

// ── Invoices ─────────────────────────────────────────────────────────

export function invoiceTotals(
  lines: Array<{ quantity: number; unitPrice: number }>,
  vatRate: number
): { subtotal: number; vat: number; total: number } {
  const subtotal = round2(lines.reduce((s, l) => s + round2(l.quantity * l.unitPrice), 0));
  const vat = vatRate > 0 ? round2((subtotal * vatRate) / 100) : 0;
  return { subtotal, vat, total: round2(subtotal + vat) };
}

export function invoiceStatus(total: number, paid: number): "unpaid" | "part_paid" | "paid" {
  if (paid <= 0) return "unpaid";
  return round2(paid) >= round2(total) ? "paid" : "part_paid";
}

// ── Stand payment plans ──────────────────────────────────────────────

export type PlanRow = { dueDate: string; amount: number; label: string; kind?: "plan" | "interest" };

export type PlanState = {
  paidToDate: number;
  balance: number;
  overdue: number;
  nextDueDate?: string;
  nextDueAmount?: number;
  rows: Array<PlanRow & { paid: number; status: "paid" | "part_paid" | "due" | "overdue" }>;
};

/**
 * Allocate everything paid to the plan, oldest instalment first (FN-91), and
 * work out what is overdue on `today` and what falls due next.
 */
export function planState(schedule: PlanRow[], paid: number, today: string): PlanState {
  let left = round2(paid);
  let overdue = 0;
  let nextDueDate: string | undefined;
  let nextDueAmount: number | undefined;
  const rows = [...schedule]
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .map((r) => {
      const take = round2(Math.max(0, Math.min(left, r.amount)));
      left = round2(left - take);
      const open = round2(r.amount - take);
      let status: "paid" | "part_paid" | "due" | "overdue" = open <= 0 ? "paid" : take > 0 ? "part_paid" : "due";
      if (open > 0 && r.dueDate < today) {
        status = "overdue";
        overdue = round2(overdue + open);
      } else if (open > 0 && !nextDueDate) {
        nextDueDate = r.dueDate;
        nextDueAmount = open;
      }
      return { ...r, paid: take, status };
    });
  const paidToDate = round2(paid);
  // Owed is the whole plan, interest rows included, less what was paid.
  const due = round2(schedule.reduce((s, r) => s + r.amount, 0));
  return { paidToDate, balance: round2(Math.max(0, due - paidToDate)), overdue, nextDueDate, nextDueAmount, rows };
}

/**
 * An even payment plan: a deposit, then `count` monthly instalments of the
 * balance from `firstDue`, the last one absorbing rounding.
 */
export function buildPlan(price: number, deposit: number, depositDue: string, count: number, firstDue: string): PlanRow[] {
  const rows: PlanRow[] = [];
  if (deposit > 0) rows.push({ dueDate: depositDue, amount: round2(deposit), label: "Deposit" });
  const rest = round2(price - deposit);
  const n = Math.max(0, Math.floor(count));
  if (rest > 0 && n > 0) {
    const each = round2(Math.floor((rest / n) * 100) / 100);
    const [y, m, d] = firstDue.split("-").map(Number);
    for (let i = 0; i < n; i++) {
      const dt = new Date(Date.UTC(y, m - 1 + i, 1));
      const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      dt.setUTCDate(Math.min(d, last));
      const amount = i === n - 1 ? round2(rest - each * (n - 1)) : each;
      rows.push({ dueDate: dt.toISOString().slice(0, 10), amount, label: `Instalment ${i + 1}` });
    }
  } else if (rest > 0) {
    rows.push({ dueDate: firstDue, amount: rest, label: "Balance" });
  }
  return rows;
}

/** Reminder keys due today for a plan (FN-95): before the due date and once overdue. */
export function standRemindersDue(
  rows: PlanState["rows"],
  today: string,
  daysBefore: number,
  sent: string[]
): Array<{ key: string; kind: "before" | "overdue"; row: PlanState["rows"][number] }> {
  const out: Array<{ key: string; kind: "before" | "overdue"; row: PlanState["rows"][number] }> = [];
  const t = Date.parse(`${today}T00:00:00Z`);
  for (const r of rows) {
    if (r.status === "paid") continue;
    const days = Math.round((Date.parse(`${r.dueDate}T00:00:00Z`) - t) / 86_400_000);
    if (days >= 0 && days <= daysBefore) {
      const key = `before:${r.dueDate}`;
      if (!sent.includes(key)) out.push({ key, kind: "before", row: r });
    } else if (days < 0) {
      const key = `overdue:${r.dueDate}`;
      if (!sent.includes(key)) out.push({ key, kind: "overdue", row: r });
    }
  }
  return out;
}

/** Simple interest for one month on an overdue amount. */
export function monthlyInterest(overdue: number, pctPerMonth: number | undefined): number {
  if (!pctPerMonth || pctPerMonth <= 0 || overdue <= 0) return 0;
  return round2((overdue * pctPerMonth) / 100);
}

export { round2, isValidDate };
