/**
 * SyncWorth labels and small helpers shared by the app's Worth screens.
 * Labels and money formatting come from the website (and the backend's
 * dependency-free rules), so both read the same.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { WorthStatus } from "../../../convex/worth/lib";
import type { BadgeTone } from "../../components/ui";
import { formatMoney } from "@/lib/worth/format";

export {
  CLASS_LABELS,
  METHOD_LABELS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  VALUE_KEYS,
  VALUE_LABELS,
  addDaysIso,
  formatArea,
  formatDay,
  formatInstant,
  formatMoney,
  formatNumber,
  formatTotals,
  todayIso,
} from "@/lib/worth/format";

export type JobView = NonNullable<FunctionReturnType<typeof api.worth.jobs.get>>;
export type ComparableView = FunctionReturnType<typeof api.worth.comparables.search>["items"][number];
export type WorthCaps = JobView["caps"];

export const STATUS_TONE: Record<WorthStatus, BadgeTone> = {
  new: "neutral",
  assigned: "info",
  inspected: "info",
  draft: "info",
  in_review: "warning",
  issued: "success",
  on_hold: "neutral",
  cancelled: "danger",
};

export const COMPARABLE_KIND_LABELS = { sale: "Sale", rental: "Rental", valuation: "Valuation" } as const;

export const SOURCE_LABELS = {
  own_valuation: "Own valuation",
  import: "Imported",
  manual: "Added",
  crm_sale: "SynCRM deal",
} as const;

export const CURRENCY_OPTIONS: Array<{ value: "USD" | "ZiG"; label: string }> = [
  { value: "USD", label: "USD" },
  { value: "ZiG", label: "ZiG" },
];

/** A label map as options for Select. */
export function optionsOf<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }));
}

/** Inspection, values and narrative can change only while the job is being worked. */
export function isEditableStatus(s: WorthStatus): boolean {
  return s === "new" || s === "assigned" || s === "inspected" || s === "draft";
}

/** Typed number as a number, or undefined when blank or not a number. */
export function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function numStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

/** Price or rent of a comparable, e.g. "US$120,000" or "US$800 pm". */
export function comparableAmount(c: { price?: number; rent?: number; currency: "USD" | "ZiG" }, both = false): string {
  const parts: string[] = [];
  if (c.price) parts.push(formatMoney(c.price, c.currency));
  if (c.rent && (both || !c.price)) parts.push(`${formatMoney(c.rent, c.currency)} pm`);
  return parts.join(" · ") || "-";
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Convex queries are live, so a pull only needs to show the spinner briefly
 * to reassure the person the list is current.
 */
export function usePullRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);
  return { refreshing, onRefresh };
}

/**
 * The last loaded value of a query, so a list keeps showing (and its search
 * box keeps focus) while new filter arguments load.
 */
export function useKeep<T>(value: T | undefined): T | undefined {
  const ref = useRef(value);
  if (value !== undefined) ref.current = value;
  return value ?? ref.current;
}
