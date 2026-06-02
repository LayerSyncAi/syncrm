import { describe, it, expect } from "vitest";
import {
  formatTime,
  resolveScheduledTimezone,
} from "../../convex/activityReminders";

/**
 * Regression tests for reminder "starts at" accuracy.
 *
 * Bug: an activity scheduled for 5:00 PM in a UTC+2 zone (e.g. Africa/Harare)
 * is stored as the absolute instant 15:00 UTC. The pre-reminder fires at the
 * right moment (1h before, timezone-independent), but the email's "Starts at"
 * label was formatted with `user.timezone || "UTC"`. For a user whose profile
 * timezone was never set, that fell back to UTC and rendered "3:00 PM" — two
 * hours off. The fix persists the scheduling timezone on the activity and
 * formats reminders in that zone.
 */
describe("reminder starts-at timezone", () => {
  // 2026-06-01 15:00:00 UTC === 5:00 PM in Africa/Harare (UTC+2, no DST).
  const fivePmHarareInstant = Date.UTC(2026, 5, 1, 15, 0, 0);

  it("renders the scheduled local time, not the UTC fallback", () => {
    expect(formatTime(fivePmHarareInstant, "Africa/Harare")).toBe("5:00 PM");
    // The old behavior (UTC fallback) is what produced the wrong 3:00 PM.
    expect(formatTime(fivePmHarareInstant, "UTC")).toBe("3:00 PM");
  });

  describe("resolveScheduledTimezone", () => {
    it("prefers the activity's stored scheduling timezone", () => {
      expect(
        resolveScheduledTimezone("Africa/Harare", "America/New_York")
      ).toBe("Africa/Harare");
    });

    it("falls back to the user's profile timezone when none was stored", () => {
      expect(resolveScheduledTimezone(undefined, "Africa/Harare")).toBe(
        "Africa/Harare"
      );
      expect(resolveScheduledTimezone(null, "Africa/Harare")).toBe(
        "Africa/Harare"
      );
    });

    it("falls back to UTC only when nothing is known", () => {
      expect(resolveScheduledTimezone(undefined, undefined)).toBe("UTC");
      expect(resolveScheduledTimezone("", "")).toBe("UTC");
    });
  });

  it("displays the stored zone even when the profile zone is unset (the reported bug)", () => {
    const tz = resolveScheduledTimezone("Africa/Harare", undefined);
    expect(formatTime(fivePmHarareInstant, tz)).toBe("5:00 PM");
  });
});
