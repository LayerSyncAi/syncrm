/**
 * Convex Cron Jobs — Activity Email Reminders
 * =============================================
 * Registers three scheduled jobs that drive the reminder system.
 * Convex discovers this file automatically; no extra wiring is needed.
 *
 * Job schedule:
 *   • pre_start_1h       — every 5 minutes
 *   • post_start_1h_open — every 5 minutes
 *   • daily_digest       — every hour at :00
 *
 * The 5-minute interval combined with the ±5-minute window inside each
 * handler gives 2× overlap for reliability.  The `activityReminderEvents`
 * deduplication table prevents any duplicate sends regardless of retries.
 *
 * Reference: https://docs.convex.dev/scheduling/cron-jobs
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ── 1. Pre-start reminder ─────────────────────────────────────────────────────
// Fires 60 minutes before each scheduled activity.
// Handler: convex/reminders.ts → processPreStartReminders
crons.interval(
  "process pre-start activity reminders",
  { minutes: 5 },
  internal.reminders.processPreStartReminders
);

// ── 2. Post-start / overdue reminder ─────────────────────────────────────────
// Fires 60 minutes after the scheduled start if the activity is still open.
// Handler: convex/reminders.ts → processPostStartReminders
crons.interval(
  "process post-start activity reminders",
  { minutes: 5 },
  internal.reminders.processPostStartReminders
);

// ── 3. Daily 8 AM digest ──────────────────────────────────────────────────────
// Runs every hour.  The handler computes each user's local hour and only sends
// to users whose local clock currently shows 8 AM.  This gives correct per-user
// digest timing without needing per-user scheduled jobs.
// Handler: convex/reminders.ts → processDailyDigests
crons.hourly(
  "process daily digest reminders",
  { minuteOfHour: 0 },
  internal.reminders.processDailyDigests
);

export default crons;
