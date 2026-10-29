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

// Flag valuations due soon or overdue and remind the assigned valuer
// (06:00 Harare).
crons.daily(
  "worth due date alerts",
  { hourUTC: 4, minuteUTC: 0 },
  internal.worth.alerts.flagDueJobs
);

// Alert property managers about inspections that have fallen due.
crons.daily(
  "stay inspections due",
  { hourUTC: 5, minuteUTC: 0 },
  internal.stay.inspections.processDueInspections
);

// Sync Stay rent cycle: rent increases, monthly rent charges and invoices,
// overdue reminders and lease expiry alerts. 03:30 UTC is 05:30 Harare, so
// charges and emails are in place before the working day.
crons.daily(
  "stay daily rent cycle",
  { hourUTC: 3, minuteUTC: 30 },
  internal.stay.jobs.runDaily
);

// Sync Dev and Sync Finance: keep instalment balances current, release
// lapsed reservations and send payment reminders through Sync Notify. 04:30 UTC is 06:30 Harare.
crons.daily(
  "finance instalments daily",
  { hourUTC: 4, minuteUTC: 30 },
  internal.dev.sales.runDaily
);

export default crons;
