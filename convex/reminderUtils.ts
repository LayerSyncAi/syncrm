/**
 * Pure utility helpers for the activity reminder system.
 * No Convex imports here — these are plain TypeScript functions so they can be
 * unit-tested without a running Convex environment.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReminderType =
  | "pre_start_1h"
  | "post_start_1h_open"
  | "daily_digest";

export type ActivityStatus = "todo" | "completed";

// ─── Activity status helpers ──────────────────────────────────────────────────

/**
 * Single source of truth for what "closed/completed" means.
 * Update this function if more terminal statuses are ever added.
 */
export function isActivityClosed(status: ActivityStatus): boolean {
  return status === "completed";
}

// ─── Deduplication key builders ───────────────────────────────────────────────

/**
 * Dedup key for pre-start and post-start reminders.
 * One key per activity — guarantees at most one send per reminder type.
 */
export function buildActivityDedupeKey(
  reminderType: "pre_start_1h" | "post_start_1h_open",
  activityId: string
): string {
  return `${reminderType}:${activityId}`;
}

/**
 * Dedup key for the daily digest.
 * Scoped to user + local calendar date (not UTC date) so users receive exactly
 * one digest per day in their own timezone.
 *
 * @param userId   Convex user _id string
 * @param localDateStr  YYYY-MM-DD string in the user's local timezone
 */
export function buildDailyDigestDedupeKey(
  userId: string,
  localDateStr: string
): string {
  return `daily_digest:${userId}:${localDateStr}`;
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Returns the provided timezone string if it is a valid IANA timezone.
 * Falls back to "UTC" for unknown/empty values.
 *
 * Fallback behaviour: when a user has no `timezone` set (the field is
 * optional on the users table), all time calculations use "UTC".  Org
 * admins can set the field via the admin UI to give users a correct
 * local time experience.
 */
export function safeTimezone(tz?: string): string {
  if (!tz) return "UTC";
  try {
    // Intl.DateTimeFormat throws for unknown timezone identifiers
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Returns the local date string (YYYY-MM-DD) for a Unix timestamp (ms)
 * interpreted in the given IANA timezone.
 */
export function getLocalDateString(
  timestampMs: number,
  timezone: string
): string {
  // "en-CA" uses ISO 8601 date format (YYYY-MM-DD)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestampMs));
}

/**
 * Returns the local hour (0–23) for a Unix timestamp (ms)
 * interpreted in the given IANA timezone.
 */
export function getLocalHour(timestampMs: number, timezone: string): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date(timestampMs));
  // Intl may return "24" for midnight in some environments; normalise to 0
  const h = parseInt(hourStr, 10);
  return h === 24 ? 0 : h;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Returns the best available display name for a user.
 * Priority: fullName → name → email prefix → "there"
 */
export function getUserDisplayName(user: {
  fullName?: string;
  name?: string;
  email?: string;
}): string {
  return (
    user.fullName ||
    user.name ||
    (user.email ? user.email.split("@")[0] : undefined) ||
    "there"
  );
}

/**
 * Formats a Unix timestamp (ms) as a long human-readable date+time string.
 * Example: "Monday, Feb 23, 2026 at 10:30 AM"
 */
export function formatScheduledDateTime(
  timestampMs: number,
  timezone: string = "UTC"
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestampMs));
}

/**
 * Formats a Unix timestamp (ms) as a time-only string.
 * Example: "10:30 AM"
 */
export function formatTime(
  timestampMs: number,
  timezone: string = "UTC"
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestampMs));
}

/**
 * Formats a Unix timestamp (ms) as a short date string.
 * Example: "Mon, Feb 23"
 */
export function formatShortDate(
  timestampMs: number,
  timezone: string = "UTC"
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(timestampMs));
}

/**
 * Capitalises the first letter of an activity type for display.
 * e.g. "whatsapp" → "WhatsApp", "call" → "Call"
 */
export function formatActivityType(
  type: "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note"
): string {
  const labels: Record<string, string> = {
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    meeting: "Meeting",
    viewing: "Viewing",
    note: "Note",
  };
  return labels[type] ?? type;
}
