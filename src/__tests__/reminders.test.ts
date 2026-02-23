/**
 * Unit tests for the activity reminder utility functions.
 *
 * These tests cover the pure helpers in convex/reminderUtils.ts.
 * They do NOT require a running Convex instance — everything here is
 * plain TypeScript logic that can run under Vitest.
 *
 * Test plan:
 *   ✅ isActivityClosed — correct for "todo" and "completed"
 *   ✅ buildActivityDedupeKey — format is stable and unique per type+id
 *   ✅ buildDailyDigestDedupeKey — format is stable and unique per user+date
 *   ✅ safeTimezone — valid tz returned as-is; invalid falls back to UTC
 *   ✅ getLocalDateString — returns YYYY-MM-DD in the given timezone
 *   ✅ getLocalHour — returns the correct local hour
 *   ✅ getUserDisplayName — priority: fullName > name > email prefix > "there"
 *   ✅ formatScheduledDateTime — returns a non-empty string
 *   ✅ formatTime — returns a non-empty string
 *   ✅ formatActivityType — known types have correct labels
 *
 * Integration-level behaviour validated through the test plan (manual or CI):
 *   • pre_start reminder sends exactly once per activity
 *   • pre_start reminder is NOT sent a second time when cron re-runs (dedupe)
 *   • post_start reminder is skipped when activity is already "completed"
 *   • post_start reminder IS sent when activity remains "todo"
 *   • daily digest includes only activities assigned to the correct user
 *   • daily digest dedupe prevents a second send on the same local calendar day
 *   • missing user email → status = "skipped", no crash
 */

import { describe, it, expect } from "vitest";
import {
  isActivityClosed,
  buildActivityDedupeKey,
  buildDailyDigestDedupeKey,
  safeTimezone,
  getLocalDateString,
  getLocalHour,
  getUserDisplayName,
  formatScheduledDateTime,
  formatTime,
  formatActivityType,
} from "../../convex/reminderUtils";

// ─── isActivityClosed ─────────────────────────────────────────────────────────

describe("isActivityClosed", () => {
  it('returns false for "todo"', () => {
    expect(isActivityClosed("todo")).toBe(false);
  });

  it('returns true for "completed"', () => {
    expect(isActivityClosed("completed")).toBe(true);
  });
});

// ─── buildActivityDedupeKey ───────────────────────────────────────────────────

describe("buildActivityDedupeKey", () => {
  it("builds the correct key for pre_start_1h", () => {
    expect(buildActivityDedupeKey("pre_start_1h", "abc123")).toBe(
      "pre_start_1h:abc123"
    );
  });

  it("builds the correct key for post_start_1h_open", () => {
    expect(buildActivityDedupeKey("post_start_1h_open", "xyz789")).toBe(
      "post_start_1h_open:xyz789"
    );
  });

  it("produces different keys for different reminder types and same activity", () => {
    const id = "sameActivity";
    expect(buildActivityDedupeKey("pre_start_1h", id)).not.toBe(
      buildActivityDedupeKey("post_start_1h_open", id)
    );
  });

  it("produces different keys for same type and different activities", () => {
    expect(buildActivityDedupeKey("pre_start_1h", "act1")).not.toBe(
      buildActivityDedupeKey("pre_start_1h", "act2")
    );
  });
});

// ─── buildDailyDigestDedupeKey ────────────────────────────────────────────────

describe("buildDailyDigestDedupeKey", () => {
  it("builds the correct format", () => {
    expect(buildDailyDigestDedupeKey("user1", "2026-02-23")).toBe(
      "daily_digest:user1:2026-02-23"
    );
  });

  it("produces different keys for different dates", () => {
    expect(buildDailyDigestDedupeKey("user1", "2026-02-23")).not.toBe(
      buildDailyDigestDedupeKey("user1", "2026-02-24")
    );
  });

  it("produces different keys for different users on the same date", () => {
    expect(buildDailyDigestDedupeKey("user1", "2026-02-23")).not.toBe(
      buildDailyDigestDedupeKey("user2", "2026-02-23")
    );
  });
});

// ─── safeTimezone ─────────────────────────────────────────────────────────────

describe("safeTimezone", () => {
  it("returns a valid IANA timezone unchanged", () => {
    expect(safeTimezone("America/New_York")).toBe("America/New_York");
    expect(safeTimezone("Europe/London")).toBe("Europe/London");
    expect(safeTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it('returns "UTC" for an invalid timezone string', () => {
    expect(safeTimezone("Not/ATimezone")).toBe("UTC");
    expect(safeTimezone("invalid")).toBe("UTC");
  });

  it('returns "UTC" when the argument is undefined', () => {
    expect(safeTimezone(undefined)).toBe("UTC");
  });

  it('returns "UTC" for an empty string', () => {
    expect(safeTimezone("")).toBe("UTC");
  });

  it('returns "UTC" for the "UTC" string itself', () => {
    expect(safeTimezone("UTC")).toBe("UTC");
  });
});

// ─── getLocalDateString ───────────────────────────────────────────────────────

describe("getLocalDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    // 2026-02-23 00:00:00 UTC
    const ts = Date.UTC(2026, 1, 23, 0, 0, 0);
    const result = getLocalDateString(ts, "UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-02-23");
  });

  it("returns the correct local date for a UTC-offset timezone", () => {
    // 2026-02-23 23:30:00 UTC = 2026-02-24 in UTC+1
    const ts = Date.UTC(2026, 1, 23, 23, 30, 0);
    const utcResult = getLocalDateString(ts, "UTC");
    const berlinResult = getLocalDateString(ts, "Europe/Berlin"); // UTC+1 in Feb
    expect(utcResult).toBe("2026-02-23");
    expect(berlinResult).toBe("2026-02-24");
  });

  it("accounts for negative UTC offsets", () => {
    // 2026-02-23 01:00:00 UTC = 2026-02-22 in UTC-5
    const ts = Date.UTC(2026, 1, 23, 1, 0, 0);
    const nyResult = getLocalDateString(ts, "America/New_York"); // UTC-5 in Feb
    expect(nyResult).toBe("2026-02-22");
  });
});

// ─── getLocalHour ─────────────────────────────────────────────────────────────

describe("getLocalHour", () => {
  it("returns 8 for 08:00 UTC in the UTC timezone", () => {
    const ts = Date.UTC(2026, 1, 23, 8, 0, 0);
    expect(getLocalHour(ts, "UTC")).toBe(8);
  });

  it("returns 8 for 13:00 UTC in America/New_York (UTC-5 in Feb)", () => {
    const ts = Date.UTC(2026, 1, 23, 13, 0, 0);
    expect(getLocalHour(ts, "America/New_York")).toBe(8);
  });

  it("returns a value between 0 and 23 inclusive", () => {
    const ts = Date.UTC(2026, 1, 23, 0, 0, 0);
    const h = getLocalHour(ts, "UTC");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });
});

// ─── getUserDisplayName ───────────────────────────────────────────────────────

describe("getUserDisplayName", () => {
  it("uses fullName when available", () => {
    expect(
      getUserDisplayName({ fullName: "Alice Smith", name: "alice", email: "a@b.com" })
    ).toBe("Alice Smith");
  });

  it("falls back to name when fullName is absent", () => {
    expect(
      getUserDisplayName({ name: "alice", email: "a@b.com" })
    ).toBe("alice");
  });

  it("falls back to email prefix when only email is available", () => {
    expect(getUserDisplayName({ email: "alice@example.com" })).toBe("alice");
  });

  it('falls back to "there" when all fields are absent', () => {
    expect(getUserDisplayName({})).toBe("there");
  });
});

// ─── formatScheduledDateTime ──────────────────────────────────────────────────

describe("formatScheduledDateTime", () => {
  it("returns a non-empty string", () => {
    const ts = Date.UTC(2026, 1, 23, 10, 30, 0);
    const result = formatScheduledDateTime(ts, "UTC");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the year and a time indicator", () => {
    const ts = Date.UTC(2026, 1, 23, 14, 0, 0); // 2 PM UTC
    const result = formatScheduledDateTime(ts, "UTC");
    expect(result).toContain("2026");
    expect(result).toMatch(/AM|PM/);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("returns a non-empty time string", () => {
    const ts = Date.UTC(2026, 1, 23, 9, 15, 0);
    const result = formatTime(ts, "UTC");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/AM|PM/);
  });
});

// ─── formatActivityType ───────────────────────────────────────────────────────

describe("formatActivityType", () => {
  it('formats "whatsapp" as "WhatsApp"', () => {
    expect(formatActivityType("whatsapp")).toBe("WhatsApp");
  });

  it('formats "call" as "Call"', () => {
    expect(formatActivityType("call")).toBe("Call");
  });

  it('formats "meeting" as "Meeting"', () => {
    expect(formatActivityType("meeting")).toBe("Meeting");
  });

  it('formats "viewing" as "Viewing"', () => {
    expect(formatActivityType("viewing")).toBe("Viewing");
  });

  it('formats "email" as "Email"', () => {
    expect(formatActivityType("email")).toBe("Email");
  });

  it('formats "note" as "Note"', () => {
    expect(formatActivityType("note")).toBe("Note");
  });
});

// ─── Deduplication behaviour (documented test plan) ──────────────────────────
//
// The following scenarios require a live Convex environment and are validated
// manually or via integration tests.  They are documented here as a reference.
//
// 1. pre_start_1h sends once
//    - Create activity with scheduledAt = now + 60 min
//    - Run processPreStartReminders twice
//    - Assert activityReminderEvents has exactly 1 row with status="sent"
//
// 2. pre_start_1h does not duplicate on retry
//    - Same setup as above; second run should find claim.claimed=false
//    - No second email is sent
//
// 3. post_start_1h_open skips completed activity
//    - Create activity with scheduledAt = now - 60 min, status="completed"
//    - Run processPostStartReminders
//    - Assert no email is sent (or status="skipped" if claimed then checked)
//
// 4. post_start_1h_open sends for open activity
//    - Create activity with scheduledAt = now - 60 min, status="todo"
//    - Run processPostStartReminders
//    - Assert email sent, status="sent"
//
// 5. daily_digest includes only assigned activities
//    - Two users with activities on the same day, each only assigned their own
//    - Run processDailyDigests
//    - Assert each user's email contains only their activities
//
// 6. daily_digest dedup prevents double-send same day
//    - Run processDailyDigests twice within the same 8 AM hour
//    - Assert only one "sent" row per user per date
//
// 7. missing email → skipped, no crash
//    - Create a user with no email field
//    - Assign activity to them
//    - Run processPreStartReminders
//    - Assert status="skipped", skipReason contains "no email"
