import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send "1 hour before" reminders for upcoming scheduled activities.
// Runs every 5 minutes; deduplication in the handler prevents repeat emails.
crons.interval(
  "pre-activity reminders",
  { minutes: 5 },
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

export default crons;
