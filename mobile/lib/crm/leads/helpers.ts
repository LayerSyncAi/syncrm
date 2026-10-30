/**
 * Pure helpers for the SynCRM lead and task screens: option lists, score
 * tones, stage rules, schedule times and CSV files. The option lists come
 * from the website's own modules so labels stay identical.
 */
import { csvRows, shareXlsx } from "../../sheets";
import { File } from "expo-file-system";
import { ACTIVITY_TYPE_OPTIONS, activityTypeLabel, type ActivityType } from "@/lib/activity-types";
import { ALL_LEAD_SOURCES, LEAD_SOURCE_OPTIONS, leadSourceLabel, type LeadSource } from "@/lib/lead-sources";
import { currencies } from "@/lib/currency";
import { detectBrowserTimezone } from "@/lib/timezones";
import { generateCSV, parseCSV } from "@/lib/csv";
import { whatsAppHref } from "@/lib/phone";
import type { BadgeTone } from "../../../components/ui";
import type { Doc } from "../../../../convex/_generated/dataModel";

export { ACTIVITY_TYPE_OPTIONS, activityTypeLabel, ALL_LEAD_SOURCES, LEAD_SOURCE_OPTIONS, leadSourceLabel, generateCSV, parseCSV };
export type { ActivityType, LeadSource };

export type InterestType = "rent" | "buy";
export type MatchType = "suggested" | "requested" | "viewed" | "offered";

export const INTEREST_OPTIONS: Array<{ value: InterestType; label: string }> = [
  { value: "rent", label: "Rent" },
  { value: "buy", label: "Buy" },
];

export const MATCH_TYPE_OPTIONS: Array<{ value: MatchType; label: string }> = [
  { value: "requested", label: "Requested: client asked about it" },
  { value: "suggested", label: "Suggested: agent recommended it" },
  { value: "viewed", label: "Viewed: client visited it" },
  { value: "offered", label: "Offered: formally offered" },
];

/** USD and ZiG first (the currencies the business runs on), then the rest. */
export const CURRENCY_OPTIONS = currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.name})` }));

/** Score buckets used by the list filter, as on the website. */
export type ScoreBucket = "" | "high" | "medium" | "low" | "unscored";
export const SCORE_OPTIONS: Array<{ value: ScoreBucket; label: string }> = [
  { value: "", label: "All scores" },
  { value: "high", label: "Hot (70+)" },
  { value: "medium", label: "Warm (40 to 69)" },
  { value: "low", label: "Cold (0 to 39)" },
  { value: "unscored", label: "Not scored" },
];

export function scoreRange(b: ScoreBucket): { scoreMin?: number; scoreMax?: number } {
  switch (b) {
    case "high":
      return { scoreMin: 70 };
    case "medium":
      return { scoreMin: 40, scoreMax: 69 };
    case "low":
      return { scoreMin: 0, scoreMax: 39 };
    case "unscored":
      return { scoreMin: 0, scoreMax: 0 };
    default:
      return {};
  }
}

export function scoreTone(score: number | undefined | null): BadgeTone {
  if (score === undefined || score === null) return "neutral";
  return score >= 70 ? "success" : score >= 40 ? "warning" : "danger";
}

/** Property match scores use four bands on the website. */
export function matchTone(score: number): BadgeTone {
  return score >= 80 ? "success" : score >= 60 ? "info" : score >= 40 ? "warning" : "danger";
}

export type StageLite = Pick<Doc<"pipelineStages">, "_id" | "name" | "order" | "isTerminal" | "terminalOutcome"> & { description?: string };

/** Moving here asks the agent to resolve the contact's other open leads. */
export function triggersSiblingReview(stage: StageLite | undefined): boolean {
  if (!stage) return false;
  const won = stage.isTerminal && stage.terminalOutcome === "won";
  const underContract = !stage.isTerminal && stage.name.toLowerCase() === "under contract";
  return won || underContract;
}

export function interestLabel(t: string, verb = false): string {
  if (verb) return t === "buy" ? "Buying" : "Renting";
  return t === "buy" ? "Buy" : "Rent";
}

/** "Open", "Won" or "Lost" for a lead and its stage. */
export function leadStatus(closedAt: number | undefined, outcome: string | null | undefined): { label: string; tone: BadgeTone } {
  if (!closedAt) return { label: "Open", tone: "info" };
  return outcome === "won" ? { label: "Won", tone: "success" } : { label: "Lost", tone: "danger" };
}

export function budgetLabel(min?: number | null, max?: number | null, currency?: string | null): string {
  const c = currency || "USD";
  const f = (n: number) => `${c} ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  if (min != null && max != null) return `${f(min)} to ${f(max)}`;
  if (min != null) return `From ${f(min)}`;
  if (max != null) return `Up to ${f(max)}`;
  return "";
}

export function priceLabel(price: number | undefined, currency: string | undefined): string {
  if (price === undefined) return "";
  return `${currency || "USD"} ${price.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/** Digits and one dot, for typed amounts; null when empty or invalid. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Schedules ─────────────────────────────────────────────────────────

/** A typed date (YYYY-MM-DD) and time (HH:MM) as a device-local instant. */
export function toInstant(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim() || "09:00");
  if (!t) return null;
  const hh = Number(t[1]);
  const mm = Number(t[2]);
  if (hh > 23 || mm > 59) return null;
  return new Date(y!, m! - 1, d!, hh, mm).getTime();
}

/** An instant back to the date and time fields. */
export function fromInstant(ms: number | undefined): { date: string; time: string } {
  if (!ms) return { date: "", time: "" };
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function timezone(): string {
  try {
    return detectBrowserTimezone();
  } catch {
    return "Africa/Harare";
  }
}

export function startOfToday(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isOverdue(a: { status: string; scheduledAt?: number }): boolean {
  return a.status === "todo" && !!a.scheduledAt && a.scheduledAt < Date.now();
}

// ── Contact links ─────────────────────────────────────────────────────

/** WhatsApp wants the full international number; local ones get +263. */
export function whatsappUrl(phone: string): string {
  return whatsAppHref(phone) ?? `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// ── CSV files ─────────────────────────────────────────────────────────

/** Share CSV text as an Excel workbook, as the website's exports are. */
export async function shareCsv(csv: string, fileName: string): Promise<void> {
  await shareXlsx(csvRows(csv), fileName.replace(/\.csv$/i, ""));
}

/** Read a picked text file. */
export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}

/** YYMMDD for file names. */
export function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
