/**
 * Sync Stay money and date rules, kept pure (no Convex imports) so they can be
 * unit-tested and shared by queries, mutations, the daily job and the app.
 *
 * Business dates are "YYYY-MM-DD" strings and periods are "YYYY-MM". All date
 * maths goes through UTC midnight so it never shifts with a timezone.
 * Amounts are rounded to cents at every step; currencies are never mixed.
 */

export type StayCurrency = "USD" | "ZiG";
export const STAY_CURRENCIES: StayCurrency[] = ["USD", "ZiG"];

export const DEFAULT_TIMEZONE = "Africa/Harare";
export const DEFAULT_INVOICE_LEAD_DAYS = 7;
export const DEFAULT_REMINDER_DAYS = [3, 7, 14];
export const DEFAULT_EXPIRY_ALERT_DAYS = [60, 30];
export const DEFAULT_RECEIPT_PREFIX = "RC-";

// ── Numbers ──────────────────────────────────────────────────────────

/** Round to cents, avoiding 0.1 + 0.2 drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Totals per currency, never converted. */
export type CurrencyTotals = Partial<Record<StayCurrency, number>>;

export function addTo(totals: CurrencyTotals, currency: StayCurrency, amount: number): void {
  totals[currency] = round2((totals[currency] ?? 0) + amount);
}

export function formatAmount(amount: number, currency: StayCurrency): string {
  const r = round2(amount);
  const formatted = r.toLocaleString("en-GB", {
    // Cents show as two digits ("937.50"); whole amounts show none.
    minimumFractionDigits: Number.isInteger(r) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

/** "USD 12,400 · ZiG 3,000", or "USD 0" when empty. */
export function formatTotals(totals: CurrencyTotals, emptyCurrency: StayCurrency = "USD"): string {
  const parts = STAY_CURRENCIES.filter((c) => totals[c] !== undefined && totals[c] !== 0).map(
    (c) => formatAmount(totals[c]!, c)
  );
  return parts.length ? parts.join(" · ") : formatAmount(0, emptyCurrency);
}

// ── Dates ────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidPeriod(s: string): boolean {
  if (!PERIOD_RE.test(s)) return false;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12;
}

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in an IANA timezone, as "YYYY-MM-DD". */
export function todayIn(timezone: string = DEFAULT_TIMEZONE, now: number = Date.now()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
  } catch {
    return fromUtc(now);
  }
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(period: string, n: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** First and last day of a "YYYY-MM" period. */
export function periodRange(period: string): { from: string; to: string } {
  const from = `${period}-01`;
  const to = addDays(`${addMonths(period, 1)}-01`, -1);
  return { from, to };
}

/** The day rent falls due in a period. Due days are 1 to 28, so always valid. */
export function dueDateFor(period: string, dueDay: number): string {
  return `${period}-${String(Math.min(Math.max(1, Math.floor(dueDay)), 28)).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Oct 2026" */
export function periodLabel(period: string, long = false): string {
  const m = Number(period.slice(5, 7)) - 1;
  return `${(long ? MONTHS_LONG : MONTHS)[m]} ${period.slice(0, 4)}`;
}

/** "28 Oct 2026" */
export function dateLabel(date: string | undefined | null): string {
  if (!date || !isValidDate(date)) return date ?? "";
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ── Rent schedule ────────────────────────────────────────────────────

export type LeaseTerms = {
  startDate: string;
  endDate: string;
  rentAmount: number;
  dueDay: number;
  moveOutDate?: string;
  rentIncrease?: { effectiveDate: string; newRent: number; appliedAt?: number };
};

/** Rent payable for a charge due on `dueDate`, honouring a planned increase. */
export function rentForDueDate(lease: LeaseTerms, dueDate: string): number {
  const inc = lease.rentIncrease;
  if (inc && !inc.appliedAt && inc.effectiveDate <= dueDate) return inc.newRent;
  return lease.rentAmount;
}

/**
 * Rent charges the daily job should hold for a lease on `today`: the current
 * and next period whose due date falls within the lease and is no more than
 * `leadDays` away. Earlier months are never back-filled, and neither is rent
 * that fell due before the lease was entered (`enteredOn`): the first month
 * is charged from the lease form, and an imported lease brings what is owed
 * as an opening balance. The caller skips periods that already have a
 * charge, so running this twice is harmless.
 */
export function rentChargesDue(
  lease: LeaseTerms,
  today: string,
  leadDays: number,
  enteredOn?: string
): Array<{ period: string; dueDate: string; amount: number }> {
  const lastDay = lease.moveOutDate && lease.moveOutDate < lease.endDate ? lease.moveOutDate : lease.endDate;
  const out: Array<{ period: string; dueDate: string; amount: number }> = [];
  for (const period of [periodOf(today), addMonths(periodOf(today), 1)]) {
    const dueDate = dueDateFor(period, lease.dueDay);
    if (dueDate < lease.startDate || dueDate > lastDay) continue;
    if (enteredOn && dueDate < enteredOn) continue;
    if (daysBetween(today, dueDate) > leadDays) continue;
    out.push({ period, dueDate, amount: rentForDueDate(lease, dueDate) });
  }
  return out;
}

// ── Allocation ───────────────────────────────────────────────────────

export type OpenCharge = {
  id: string;
  dueDate: string;
  createdAt: number;
  amount: number;
  amountPaid: number;
};

export function outstanding(c: { amount: number; amountPaid: number }): number {
  return Math.max(0, round2(c.amount - c.amountPaid));
}

export function chargeStatus(c: {
  amount: number;
  amountPaid: number;
}): "unpaid" | "part_paid" | "paid" {
  if (c.amountPaid <= 0) return "unpaid";
  if (round2(c.amountPaid) >= round2(c.amount)) return "paid";
  return "part_paid";
}

/**
 * Allocate `amount` to the oldest unpaid charges first (by due date, then
 * creation). Whatever is left over becomes credit on the lease.
 */
export function allocateOldestFirst<T extends OpenCharge>(
  charges: T[],
  amount: number
): { allocations: Array<{ chargeId: T["id"]; amount: number }>; credit: number } {
  let left = round2(amount);
  const allocations: Array<{ chargeId: T["id"]; amount: number }> = [];
  const open = charges
    .filter((c) => outstanding(c) > 0)
    .sort((a, b) => (a.dueDate === b.dueDate ? a.createdAt - b.createdAt : a.dueDate < b.dueDate ? -1 : 1));
  for (const c of open) {
    if (left <= 0) break;
    const take = round2(Math.min(left, outstanding(c)));
    allocations.push({ chargeId: c.id, amount: take });
    left = round2(left - take);
  }
  return { allocations, credit: Math.max(0, left) };
}

/**
 * Reversing a payment takes back the credit it created. If some of that
 * credit was already used on later charges, the shortfall is unwound from
 * those charges, newest first. Returns how much to take from each.
 */
export function unwindCredit<T extends { id: string; dueDate: string; createdAt: number; creditApplied: number }>(
  creditBalance: number,
  creditToRemove: number,
  creditPaidCharges: T[]
): { newCreditBalance: number; unwind: Array<{ chargeId: T["id"]; amount: number }> } {
  const remaining = round2(creditBalance - creditToRemove);
  if (remaining >= 0) return { newCreditBalance: remaining, unwind: [] };
  let short = round2(-remaining);
  const unwind: Array<{ chargeId: T["id"]; amount: number }> = [];
  const newestFirst = [...creditPaidCharges]
    .filter((c) => c.creditApplied > 0)
    .sort((a, b) => (a.dueDate === b.dueDate ? b.createdAt - a.createdAt : a.dueDate < b.dueDate ? 1 : -1));
  for (const c of newestFirst) {
    if (short <= 0) break;
    const take = round2(Math.min(short, c.creditApplied));
    unwind.push({ chargeId: c.id, amount: take });
    short = round2(short - take);
  }
  return { newCreditBalance: 0, unwind };
}

// ── Arrears ──────────────────────────────────────────────────────────

export type AgeBucket = "0_30" | "31_60" | "61_90" | "90_plus";
export const AGE_BUCKETS: AgeBucket[] = ["0_30", "31_60", "61_90", "90_plus"];
export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  "0_30": "0 to 30 days",
  "31_60": "31 to 60 days",
  "61_90": "61 to 90 days",
  "90_plus": "Over 90 days",
};

export function ageBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 30) return "0_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}

/** A charge is in arrears once its due date has arrived and it is not settled. */
export function isOverdue(c: { dueDate: string; amount: number; amountPaid: number; status: string }, today: string): boolean {
  return c.status !== "cancelled" && c.dueDate <= today && outstanding(c) > 0;
}

/**
 * Which reminder to send for an overdue charge: the largest interval reached
 * that has not gone out yet. Intervals skipped while the job was down are
 * marked sent too, so a tenant never gets three emails in one morning.
 */
export function reminderToSend(
  daysOverdue: number,
  reminderDays: number[],
  alreadySent: number[] = []
): { send: number | null; markSent: number[] } {
  const reached = reminderDays.filter((d) => d <= daysOverdue && !alreadySent.includes(d));
  if (!reached.length) return { send: null, markSent: [] };
  return { send: Math.max(...reached), markSent: reached };
}

/** Expiry alert to raise for a lease ending in `daysLeft` days (same rule as reminders). */
export function expiryAlertToSend(
  daysLeft: number,
  alertDays: number[],
  alreadySent: number[] = []
): { send: number | null; markSent: number[] } {
  if (daysLeft < 0) return { send: null, markSent: [] };
  const reached = alertDays.filter((d) => daysLeft <= d && !alreadySent.includes(d));
  if (!reached.length) return { send: null, markSent: [] };
  return { send: Math.min(...reached), markSent: reached };
}

// ── Statements ───────────────────────────────────────────────────────

export type StatementCharge = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  createdAt: number;
};
export type StatementPayment = {
  id: string;
  date: string;
  receiptNumber: string;
  amount: number;
  method: string;
  createdAt: number;
  reversedOn?: string;
  reverseReason?: string;
};
export type StatementDepositApplied = { date: string; amount: number; at: number };

export type StatementLine = {
  date: string;
  kind: "charge" | "payment" | "reversal" | "deposit_applied";
  description: string;
  refId: string;
  debit: number;
  credit: number;
  balance: number;
};

/**
 * Running statement for one lease (or a renewal chain): charges are debits,
 * payments and applied deposit are credits, a reversal re-debits on its date.
 * Cancelled charges are left out. The closing balance equals outstanding
 * charges less lease credit.
 */
export function buildStatement(
  charges: StatementCharge[],
  payments: StatementPayment[],
  depositApplied: StatementDepositApplied[] = []
): { lines: StatementLine[]; balance: number } {
  type Row = Omit<StatementLine, "balance"> & { order: number };
  const rows: Row[] = [];
  for (const c of charges) {
    if (c.status === "cancelled") continue;
    rows.push({ date: c.date, kind: "charge", description: c.description, refId: c.id, debit: c.amount, credit: 0, order: c.createdAt });
  }
  for (const p of payments) {
    rows.push({
      date: p.date,
      kind: "payment",
      description: `Payment, receipt ${p.receiptNumber}`,
      refId: p.id,
      debit: 0,
      credit: p.amount,
      order: p.createdAt,
    });
    if (p.reversedOn) {
      rows.push({
        date: p.reversedOn,
        kind: "reversal",
        description: `Reversal of receipt ${p.receiptNumber}${p.reverseReason ? `: ${p.reverseReason}` : ""}`,
        refId: p.id,
        debit: p.amount,
        credit: 0,
        order: p.createdAt + 1,
      });
    }
  }
  for (const d of depositApplied) {
    rows.push({ date: d.date, kind: "deposit_applied", description: "Deposit applied", refId: "", debit: 0, credit: d.amount, order: d.at });
  }
  // Charges before payments on the same day, so a same-day payment reads as settling it.
  const kindRank = { charge: 0, deposit_applied: 1, payment: 1, reversal: 2 } as const;
  rows.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : kindRank[a.kind] !== kindRank[b.kind] ? kindRank[a.kind] - kindRank[b.kind] : a.order - b.order
  );
  let balance = 0;
  const lines = rows.map((r) => {
    balance = round2(balance + r.debit - r.credit);
    return { date: r.date, kind: r.kind, description: r.description, refId: r.refId, debit: r.debit, credit: r.credit, balance };
  });
  return { lines, balance };
}

// ── Landlord statement (no Sync Finance) ─────────────────────────────

export type LandlordCollection = {
  stayPropertyId: string;
  currency: StayCurrency;
  amount: number;
};
export type LandlordExpense = { stayPropertyId: string; currency: StayCurrency; amount: number };

export type LandlordTotals = {
  currency: StayCurrency;
  collected: number;
  depositApplied: number;
  fee: number;
  expenses: number;
  net: number;
};

/**
 * Rent collected, less the management fee (a percentage of rent collected,
 * set per property), less expenses recharged to the landlord. Applied
 * deposit passes to the landlord without a fee. One result per currency.
 */
export function landlordTotals(
  collections: LandlordCollection[],
  depositApplied: LandlordCollection[],
  expenses: LandlordExpense[],
  feePctByProperty: Record<string, number>
): LandlordTotals[] {
  const by = new Map<StayCurrency, LandlordTotals>();
  const get = (c: StayCurrency) => {
    let t = by.get(c);
    if (!t) {
      t = { currency: c, collected: 0, depositApplied: 0, fee: 0, expenses: 0, net: 0 };
      by.set(c, t);
    }
    return t;
  };
  for (const col of collections) {
    const t = get(col.currency);
    t.collected = round2(t.collected + col.amount);
    t.fee = round2(t.fee + (col.amount * (feePctByProperty[col.stayPropertyId] ?? 0)) / 100);
  }
  for (const d of depositApplied) {
    const t = get(d.currency);
    t.depositApplied = round2(t.depositApplied + d.amount);
  }
  for (const e of expenses) {
    const t = get(e.currency);
    t.expenses = round2(t.expenses + e.amount);
  }
  for (const t of by.values()) t.net = round2(t.collected + t.depositApplied - t.fee - t.expenses);
  return STAY_CURRENCIES.filter((c) => by.has(c)).map((c) => by.get(c)!);
}

// ── Receipts ─────────────────────────────────────────────────────────

export function formatReceiptNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/** Default room checklist for a new unit (inspections, BRD ST-71). */
export function defaultRooms(bedrooms?: number): string[] {
  const beds = Math.max(1, Math.min(bedrooms ?? 1, 8));
  return [
    "Lounge",
    "Kitchen",
    ...Array.from({ length: beds }, (_, i) => `Bedroom ${i + 1}`),
    "Bathroom",
    "Exterior",
  ];
}
