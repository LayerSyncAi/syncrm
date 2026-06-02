import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  format,
  getQuarter,
} from "date-fns";

export type ReportPeriod = "all" | "week" | "month" | "quarter" | "year";

export interface PeriodRange {
  /** Inclusive start, epoch ms. */
  start: number;
  /** Inclusive end, epoch ms (last ms of the period). */
  end: number;
  /** Human-readable label, e.g. "March 2026" or "Q1 2026". */
  label: string;
}

export const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
];

/** Largest safe timestamp; used as the upper bound for the "all time" window. */
const MAX_TS = 8640000000000000;

/** True when the period has no meaningful previous/next navigation. */
export function isNavigablePeriod(period: ReportPeriod): boolean {
  return period !== "all";
}

// Week starts on Monday for business reporting.
const WEEK_OPTS = { weekStartsOn: 1 as const };

/**
 * Resolve the [start, end] epoch-ms window and label for a reporting period
 * containing `refDate` (defaults to now). Boundaries are computed in the
 * runtime's local time zone (the browser's), which matches the signed-in
 * user's locale in practice.
 */
export function getPeriodRange(
  period: ReportPeriod,
  refDate: Date = new Date()
): PeriodRange {
  switch (period) {
    case "all":
      return { start: 0, end: MAX_TS, label: "All time" };
    case "week": {
      const start = startOfWeek(refDate, WEEK_OPTS);
      const end = endOfWeek(refDate, WEEK_OPTS);
      return {
        start: start.getTime(),
        end: end.getTime(),
        label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
      };
    }
    case "month": {
      const start = startOfMonth(refDate);
      const end = endOfMonth(refDate);
      return { start: start.getTime(), end: end.getTime(), label: format(start, "MMMM yyyy") };
    }
    case "quarter": {
      const start = startOfQuarter(refDate);
      const end = endOfQuarter(refDate);
      return {
        start: start.getTime(),
        end: end.getTime(),
        label: `Q${getQuarter(start)} ${format(start, "yyyy")}`,
      };
    }
    case "year": {
      const start = startOfYear(refDate);
      const end = endOfYear(refDate);
      return { start: start.getTime(), end: end.getTime(), label: format(start, "yyyy") };
    }
  }
}

/** Shift a reference date by `delta` whole periods (negative = earlier). */
export function shiftPeriod(period: ReportPeriod, refDate: Date, delta: number): Date {
  switch (period) {
    case "all":
      return refDate;
    case "week":
      return addWeeks(refDate, delta);
    case "month":
      return addMonths(refDate, delta);
    case "quarter":
      return addQuarters(refDate, delta);
    case "year":
      return addYears(refDate, delta);
  }
}
