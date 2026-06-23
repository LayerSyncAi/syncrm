// Pure, dependency-free helpers for the reporting module.
// Kept free of any Convex imports so they can be unit-tested directly.

export interface BudgetLike {
  dealValue?: number;
  budgetMin?: number;
  budgetMax?: number;
}

/**
 * Best-estimate monetary value of a lead for pipeline/forecast purposes.
 * Prefers an explicit dealValue; falls back to the budget midpoint, then to
 * whichever budget bound is available; 0 if nothing is known.
 */
export function estimateLeadValue(lead: BudgetLike): number {
  if (typeof lead.dealValue === "number" && lead.dealValue > 0) {
    return lead.dealValue;
  }
  const { budgetMin, budgetMax } = lead;
  if (typeof budgetMin === "number" && typeof budgetMax === "number") {
    return (budgetMin + budgetMax) / 2;
  }
  if (typeof budgetMax === "number") return budgetMax;
  if (typeof budgetMin === "number") return budgetMin;
  return 0;
}

/** Weight an estimated value by a stage win-probability (0–100). */
export function weightedForecastValue(
  estimated: number,
  winProbability: number | undefined
): number {
  const p =
    typeof winProbability === "number"
      ? Math.max(0, Math.min(100, winProbability))
      : 0;
  return estimated * (p / 100);
}

/** Win rate as a percentage with one decimal place (0 when no closed deals). */
export function conversionRate(won: number, totalClosed: number): number {
  if (totalClosed <= 0) return 0;
  return Math.round((won / totalClosed) * 1000) / 10;
}

/** Inclusive [start, end] window test for a (possibly undefined) timestamp. */
export function inWindow(
  ts: number | undefined,
  start: number,
  end: number
): boolean {
  return typeof ts === "number" && ts >= start && ts <= end;
}

/** Whole days between a creation time and an end instant (never negative). */
export function daysOnMarket(createdAt: number, endTs: number): number {
  return Math.max(0, Math.round((endTs - createdAt) / (24 * 60 * 60 * 1000)));
}

// ── Task (activity) reporting ────────────────────────────────────────

export interface TaskLike {
  status: "todo" | "completed";
  createdAt: number;
  completedAt?: number;
  scheduledAt?: number;
}

export interface TaskMetrics {
  /** Tasks created within the [start, end] window. */
  created: number;
  /** Tasks completed (completedAt) within the window. */
  completed: number;
  /** Open todos not past their scheduled time — current backlog snapshot. */
  pending: number;
  /** Open todos whose scheduledAt is before `now` — current backlog snapshot. */
  overdue: number;
  /** completed ÷ (completed + pending + overdue), as a percentage. */
  completionRate: number;
}

/**
 * Summarise a set of tasks for reporting. `created` and `completed` are
 * window-bounded (period activity); `pending` and `overdue` are a point-in-time
 * snapshot of the open backlog relative to `now` (overdue is inherently
 * now-relative). Pure and Convex-free for direct unit testing.
 */
export function computeTaskMetrics(
  tasks: TaskLike[],
  start: number,
  end: number,
  now: number
): TaskMetrics {
  let created = 0;
  let completed = 0;
  let pending = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (inWindow(t.createdAt, start, end)) created++;
    if (t.status === "completed" && inWindow(t.completedAt, start, end)) {
      completed++;
    }
    if (t.status === "todo") {
      if (typeof t.scheduledAt === "number" && t.scheduledAt < now) {
        overdue++;
      } else {
        pending++;
      }
    }
  }
  return {
    created,
    completed,
    pending,
    overdue,
    completionRate: conversionRate(completed, completed + pending + overdue),
  };
}

export type CurrencyMap = Record<string, number>;

/** Accumulate an amount into a per-currency map (blank currency → "USD"). */
export function addToCurrencyMap(
  map: CurrencyMap,
  currency: string | undefined,
  amount: number
): void {
  const c = currency && currency.trim() ? currency.trim() : "USD";
  map[c] = (map[c] ?? 0) + amount;
}
