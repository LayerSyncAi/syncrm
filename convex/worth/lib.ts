/**
 * Dependency-free SyncWorth rules: job references, the status workflow,
 * due-date flags and turnaround. Shared by the Convex functions and the app,
 * and unit-tested without the Convex runtime.
 */

export type WorthStatus =
  | "new"
  | "assigned"
  | "inspected"
  | "draft"
  | "in_review"
  | "issued"
  | "on_hold"
  | "cancelled";

export type WorthCurrency = "USD" | "ZiG";
export type WorthPurpose = "bank_lending" | "sale_purchase" | "insurance" | "rental" | "estate" | "other";
export type WorthPartyType = "bank" | "owner" | "buyer" | "lawyer" | "other";
export type WorthPropertyClass = "residential" | "commercial" | "vacant_land";
export type WorthMethod = "comparison" | "income" | "cost";
export type WorthValueKey = "market" | "forcedSale" | "insurance" | "rental";
export type Money = { amount: number; currency: WorthCurrency };
export type WorthValues = Partial<Record<WorthValueKey, Money>>;

export const STATUS_LABELS: Record<WorthStatus, string> = {
  new: "New",
  assigned: "Assigned",
  inspected: "Inspected",
  draft: "Draft",
  in_review: "In review",
  issued: "Issued",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

/** The main path, in order (BRD §4). On hold and cancelled sit outside it. */
export const STATUS_FLOW: WorthStatus[] = ["new", "assigned", "inspected", "draft", "in_review", "issued"];

export const OPEN_STATUSES: WorthStatus[] = ["new", "assigned", "inspected", "draft", "in_review", "on_hold"];

export function isOpenStatus(s: WorthStatus): boolean {
  return OPEN_STATUSES.includes(s);
}

/** Inspection, values and narrative can change only while the job is being worked. */
export function isEditableStatus(s: WorthStatus): boolean {
  return s === "new" || s === "assigned" || s === "inspected" || s === "draft";
}

export const PURPOSE_LABELS: Record<WorthPurpose, string> = {
  bank_lending: "Bank lending",
  sale_purchase: "Sale or purchase",
  insurance: "Insurance",
  rental: "Rental assessment",
  estate: "Estate",
  other: "Other",
};

export const PARTY_LABELS: Record<WorthPartyType, string> = {
  bank: "Bank",
  owner: "Owner",
  buyer: "Buyer",
  lawyer: "Lawyer",
  other: "Other",
};

export const CLASS_LABELS: Record<WorthPropertyClass, string> = {
  residential: "Residential",
  commercial: "Commercial",
  vacant_land: "Vacant land",
};

export const METHOD_LABELS: Record<WorthMethod, string> = {
  comparison: "Comparison",
  income: "Income",
  cost: "Cost",
};

export const VALUE_LABELS: Record<WorthValueKey, string> = {
  market: "Market value",
  forcedSale: "Forced-sale value",
  insurance: "Insurance replacement value",
  rental: "Market rental (per month)",
};

export const VALUE_KEYS: WorthValueKey[] = ["market", "forcedSale", "insurance", "rental"];

// =====================
// References
// =====================

/** "VAL-2026-0142". The sequence pads to four digits and grows past 9999. */
export function formatReference(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Allocate the next reference from the org's counter. The sequence restarts
 * at 1 each calendar year.
 */
export function allocateReference(
  counter: { prefix: string; seqYear: number; nextSeq: number },
  year: number
): { reference: string; seqYear: number; nextSeq: number } {
  const seq = counter.seqYear === year ? counter.nextSeq : 1;
  return {
    reference: formatReference(counter.prefix, year, seq),
    seqYear: year,
    nextSeq: seq + 1,
  };
}

// =====================
// Dates
// =====================

/** Agencies are in Zimbabwe, South Africa and Zambia: all UTC+2, no DST. */
export const WORTH_TIMEZONE = "Africa/Harare";

/** Today's date as "YYYY-MM-DD" in the agency timezone. */
export function localToday(now: number, timeZone = WORTH_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Add whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"); negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/**
 * VW-12: an open job is overdue once its due date has passed, and due soon
 * within `soonDays` of it. Issued, cancelled and on-hold jobs are never
 * flagged (a held job is waiting on someone else).
 */
export function dueState(
  job: { status: WorthStatus; dueDate: string },
  today: string,
  soonDays: number
): "overdue" | "due_soon" | null {
  if (!isOpenStatus(job.status) || job.status === "on_hold") return null;
  const left = daysBetween(today, job.dueDate);
  if (left < 0) return "overdue";
  if (left <= soonDays) return "due_soon";
  return null;
}

// =====================
// Workflow
// =====================

export type WorthAction =
  | "assign"
  | "complete_inspection"
  | "start_draft"
  | "submit"
  | "return"
  | "issue"
  | "hold"
  | "resume"
  | "cancel"
  | "correct";

/**
 * The status a job moves to when `action` is applied, or null when the action
 * is not allowed from its current status. Who may act is decided separately
 * (access.ts); this is only the shape of the workflow.
 */
export function nextStatus(
  current: WorthStatus,
  action: WorthAction,
  opts: { statusBeforeHold?: WorthStatus; hasValuer?: boolean } = {}
): WorthStatus | null {
  switch (action) {
    case "assign":
      // Reassigning keeps the job where it is; a new job becomes Assigned.
      if (current === "new") return "assigned";
      return isOpenStatus(current) ? current : null;
    case "complete_inspection":
      if (current === "assigned" || current === "new") return opts.hasValuer ? "inspected" : null;
      return current === "inspected" || current === "draft" ? current : null;
    case "start_draft":
      if (current === "assigned" || current === "inspected") return "draft";
      return current === "draft" ? "draft" : null;
    case "submit":
      return current === "draft" || current === "inspected" ? "in_review" : null;
    case "return":
      return current === "in_review" ? "draft" : null;
    case "issue":
      return current === "in_review" ? "issued" : null;
    case "hold":
      return isOpenStatus(current) && current !== "on_hold" ? "on_hold" : null;
    case "resume":
      return current === "on_hold" ? (opts.statusBeforeHold ?? "new") : null;
    case "cancel":
      return isOpenStatus(current) ? "cancelled" : null;
    case "correct":
      return current === "issued" ? "draft" : null;
  }
}

/** At least one value must be recorded before a job goes for review. */
export function hasAnyValue(values: WorthValues): boolean {
  return VALUE_KEYS.some((k) => (values[k]?.amount ?? 0) > 0);
}

// =====================
// Turnaround
// =====================

export type StatusLogEntry = { status: WorthStatus; at: number };

/**
 * Milliseconds spent in each status, from the job's status log. The current
 * status is counted up to `now` unless the job is issued or cancelled.
 */
export function stageDurations(log: StatusLogEntry[], now: number): Partial<Record<WorthStatus, number>> {
  const out: Partial<Record<WorthStatus, number>> = {};
  for (let i = 0; i < log.length; i++) {
    const cur = log[i];
    const end = i + 1 < log.length ? log[i + 1].at : cur.status === "issued" || cur.status === "cancelled" ? cur.at : now;
    out[cur.status] = (out[cur.status] ?? 0) + Math.max(0, end - cur.at);
  }
  return out;
}

/** Days from instruction received to issue (VW dashboard turnaround). */
export function turnaroundDays(job: { receivedDate: string; issuedDate?: string }): number | null {
  if (!job.issuedDate) return null;
  return Math.max(0, daysBetween(job.receivedDate, job.issuedDate));
}

export function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// =====================
// Money
// =====================

/** Sum amounts per currency. USD and ZiG are never added together. */
export function sumByCurrency(items: Array<{ amount: number; currency: WorthCurrency }>): Record<WorthCurrency, number> {
  const out: Record<WorthCurrency, number> = { USD: 0, ZiG: 0 };
  for (const i of items) out[i.currency] += i.amount;
  return out;
}

export function formatMoney(amount: number, currency: WorthCurrency): string {
  const n = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(amount));
  return currency === "USD" ? `US$${n}` : `ZiG ${n}`;
}

/** "US$1,200 · ZiG 5,000", skipping zero totals; "US$0" when both are zero. */
export function formatTotals(t: Record<WorthCurrency, number>): string {
  const parts = (["USD", "ZiG"] as const).filter((c) => t[c] !== 0).map((c) => formatMoney(t[c], c));
  return parts.length ? parts.join(" · ") : formatMoney(0, "USD");
}

export function normaliseSuburb(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
