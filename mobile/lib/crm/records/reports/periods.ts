/**
 * Reporting periods, the same windows as the website's
 * src/lib/reporting-periods.ts (weeks start on Monday, local time), without
 * date-fns so the app bundle stays small.
 */

export type ReportPeriod = "all" | "week" | "month" | "quarter" | "year";

export const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: "all", label: "All time" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

const MAX_TS = 8640000000000000;
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type PeriodRange = { start: number; end: number; label: string };

export function getPeriodRange(period: ReportPeriod, ref: Date = new Date()): PeriodRange {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (period) {
    case "all":
      return { start: 0, end: MAX_TS, label: "All time" };
    case "week": {
      const offset = (ref.getDay() + 6) % 7; // Monday = 0
      const start = new Date(y, m, ref.getDate() - offset);
      const end = new Date(y, m, ref.getDate() - offset + 7, 0, 0, 0, -1);
      return {
        start: start.getTime(),
        end: end.getTime(),
        label: `${start.getDate()} ${SHORT[start.getMonth()]} to ${end.getDate()} ${SHORT[end.getMonth()]} ${end.getFullYear()}`,
      };
    }
    case "month":
      return { start: new Date(y, m, 1).getTime(), end: new Date(y, m + 1, 1, 0, 0, 0, -1).getTime(), label: `${LONG[m]} ${y}` };
    case "quarter": {
      const q = Math.floor(m / 3);
      return { start: new Date(y, q * 3, 1).getTime(), end: new Date(y, q * 3 + 3, 1, 0, 0, 0, -1).getTime(), label: `Q${q + 1} ${y}` };
    }
    case "year":
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1, 0, 0, 0, -1).getTime(), label: String(y) };
  }
}

/** Move the reference date by whole periods (negative is earlier). */
export function shiftPeriod(period: ReportPeriod, ref: Date, delta: number): Date {
  const d = new Date(ref);
  if (period === "week") d.setDate(d.getDate() + 7 * delta);
  else if (period === "month") d.setMonth(d.getMonth() + delta, 1);
  else if (period === "quarter") d.setMonth(d.getMonth() + 3 * delta, 1);
  else if (period === "year") d.setFullYear(d.getFullYear() + delta);
  return d;
}
