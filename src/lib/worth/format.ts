/** Display helpers shared by the Sync Worth pages and PDFs. */
import type { WorthStatus } from "../../../convex/worth/lib";

export {
  CLASS_LABELS,
  METHOD_LABELS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  VALUE_KEYS,
  VALUE_LABELS,
  formatMoney,
  formatTotals,
} from "../../../convex/worth/lib";

/** "14 Mar 2026" from "2026-03-14" (no timezone shift). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatInstant(ts: number | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatArea(m2: number | null | undefined): string {
  if (!m2) return "-";
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(m2)} m²`;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export const STATUS_BADGE: Record<
  WorthStatus,
  "default" | "secondary" | "success" | "warning" | "danger" | "info" | "neutral" | "neutralStrong"
> = {
  new: "neutralStrong",
  assigned: "info",
  inspected: "info",
  draft: "default",
  in_review: "warning",
  issued: "success",
  on_hold: "neutral",
  cancelled: "danger",
};

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
