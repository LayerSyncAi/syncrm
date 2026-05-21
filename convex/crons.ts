import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send "1 hour before" reminders for upcoming scheduled activities.
// Runs once per minute: each run claims every reminder whose due time has
// passed and hasn't been sent, so reminders fire within ~1 minute of the
// hour mark and missed ticks are caught up automatically.
crons.interval(
  "pre-activity reminders",
  { minutes: 1 },
  internal.activityReminders.processPreReminders
);

// Send follow-up reminders for activities still open 1 hour past their
// scheduled start. Runs every 5 minutes with deduplication.
crons.interval(
  "overdue activity reminders",
  { minutes: 5 },
  internal.activityReminders.processOverdueReminders
);

// Send daily agenda digest at 8:00 AM in each user's local timezone.
// Runs every 15 minutes to cover half-hour and quarter-hour offset timezones.
crons.interval(
  "daily agenda digest",
  { minutes: 15 },
  internal.activityReminders.processDailyDigests
);

// Refresh price/status for properties previously imported from PropertyBook
// against the agencies each org has chosen to track.
crons.daily(
  "propertybook tracked agency refresh",
  { hourUTC: 2, minuteUTC: 30 },
  internal.propertyBook.refresh.refreshAllTracked
);

export default crons;
