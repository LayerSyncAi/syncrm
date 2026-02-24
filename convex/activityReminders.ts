import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";

// =====================
// Formatting helpers
// =====================

function formatTime(timestamp: number, timezone: string = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date(timestamp));
  }
}

function formatDate(timestamp: number, timezone: string = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(timestamp));
  }
}

function getLocalHour(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : -1;
  } catch {
    return -1;
  }
}

function getLocalMinute(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      minute: "numeric",
      timeZone: timezone,
    }).formatToParts(new Date());
    const minutePart = parts.find((p) => p.type === "minute");
    return minutePart ? parseInt(minutePart.value, 10) : -1;
  } catch {
    return -1;
  }
}

function getLocalDateString(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(new Date());
  }
}

function getDayBoundsForTimezone(timezone: string): {
  dayStart: number;
  dayEnd: number;
} {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).formatToParts(now);

    const year = parseInt(parts.find((p) => p.type === "year")!.value);
    const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
    const day = parseInt(parts.find((p) => p.type === "day")!.value);

    // Calculate timezone offset by comparing local and UTC representations
    const localStr = now.toLocaleString("en-US", { timeZone: timezone });
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
    const offset = new Date(localStr).getTime() - new Date(utcStr).getTime();

    // Midnight UTC for this date, adjusted for timezone offset
    const midnightUTC = Date.UTC(year, month, day);
    const dayStart = midnightUTC - offset;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    return { dayStart, dayEnd };
  } catch {
    const now = new Date();
    const dayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return { dayStart, dayEnd };
  }
}

function activityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    meeting: "Meeting",
    viewing: "Viewing",
    note: "Note",
  };
  return labels[type] || type;
}

// =====================
// Internal Queries
// =====================

/**
 * Get todo activities with scheduledAt in the pre-reminder window (50–70 min from now).
 */
export const getUpcomingActivities = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = now + 50 * 60 * 1000;
    const windowEnd = now + 70 * 60 * 1000;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .collect();

    return activities.filter(
      (a) =>
        a.scheduledAt &&
        a.scheduledAt >= windowStart &&
        a.scheduledAt <= windowEnd
    );
  },
});

/**
 * Get todo activities that are overdue (scheduledAt was 50+ min ago, up to 24 h).
 */
export const getOverdueActivities = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const overdueSince = now - 50 * 60 * 1000;
    const maxLookback = now - 24 * 60 * 60 * 1000;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .collect();

    return activities.filter(
      (a) =>
        a.scheduledAt &&
        a.scheduledAt <= overdueSince &&
        a.scheduledAt >= maxLookback
    );
  },
});

/**
 * Check whether a specific reminder has already been sent for an activity.
 */
export const checkReminderSent = internalQuery({
  args: {
    activityId: v.id("activities"),
    reminderType: v.union(
      v.literal("pre_reminder"),
      v.literal("overdue_reminder")
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activityReminders")
      .withIndex("by_activity_type", (q) =>
        q.eq("activityId", args.activityId).eq("reminderType", args.reminderType)
      )
      .first();
    return !!existing;
  },
});

/**
 * Check whether a daily digest has already been sent for a user on a given date.
 */
export const checkDigestSent = internalQuery({
  args: {
    userId: v.id("users"),
    digestDate: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activityReminders")
      .withIndex("by_user_digest", (q) =>
        q
          .eq("userId", args.userId)
          .eq("reminderType", "daily_digest")
          .eq("digestDate", args.digestDate)
      )
      .first();
    return !!existing;
  },
});

export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ctx.db.get(args.userId),
});

export const getLeadById = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => ctx.db.get(args.leadId),
});

/**
 * Return all active users that have an email and belong to an organization.
 */
export const getActiveUsers = internalQuery({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.isActive && u.orgId && u.email);
  },
});

/**
 * Fetch a user's activities whose scheduledAt falls within a given time range.
 */
export const getUserDayActivities = internalQuery({
  args: {
    userId: v.id("users"),
    dayStart: v.number(),
    dayEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_assignee_status", (q) =>
        q.eq("assignedToUserId", args.userId)
      )
      .collect();

    return activities.filter(
      (a) =>
        a.scheduledAt &&
        a.scheduledAt >= args.dayStart &&
        a.scheduledAt < args.dayEnd
    );
  },
});

// =====================
// Internal Mutations
// =====================

export const recordReminder = internalMutation({
  args: {
    activityId: v.optional(v.id("activities")),
    reminderType: v.union(
      v.literal("pre_reminder"),
      v.literal("daily_digest"),
      v.literal("overdue_reminder")
    ),
    userId: v.id("users"),
    digestDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activityReminders", {
      activityId: args.activityId,
      reminderType: args.reminderType,
      userId: args.userId,
      sentAt: Date.now(),
      digestDate: args.digestDate,
    });
  },
});

// =====================
// Cron-triggered Actions
// =====================

/**
 * Sends "1 hour before" email reminders for upcoming activities.
 * Runs every 5 minutes via cron; deduplication prevents repeat sends.
 */
export const processPreReminders = internalAction({
  handler: async (ctx) => {
    const activities = await ctx.runQuery(
      internal.activityReminders.getUpcomingActivities
    );

    for (const activity of activities) {
      const alreadySent = await ctx.runQuery(
        internal.activityReminders.checkReminderSent,
        { activityId: activity._id, reminderType: "pre_reminder" }
      );
      if (alreadySent) continue;

      const [user, lead] = await Promise.all([
        ctx.runQuery(internal.activityReminders.getUserById, {
          userId: activity.assignedToUserId,
        }),
        ctx.runQuery(internal.activityReminders.getLeadById, {
          leadId: activity.leadId,
        }),
      ]);

      if (!user || !user.email || !user.isActive) continue;

      const timezone = user.timezone || "UTC";
      const userName = user.fullName || user.name || "there";
      const timeStr = formatTime(activity.scheduledAt!, timezone);
      const leadName = lead?.fullName || "Unknown";
      const typeLabel = activityTypeLabel(activity.type);

      await sendEmail({
        to: user.email,
        subject: `Reminder: ${typeLabel} "${activity.title}" starts in 1 hour`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Upcoming Activity Reminder</h2>
            <p>Hi ${userName},</p>
            <p>Please note your <strong>${typeLabel.toLowerCase()}</strong> &ldquo;<strong>${activity.title}</strong>&rdquo; is meant to start in an hour at <strong>${timeStr}</strong>.</p>
            <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Activity:</strong> ${activity.title}</p>
              <p style="margin: 4px 0;"><strong>Type:</strong> ${typeLabel}</p>
              <p style="margin: 4px 0;"><strong>Scheduled:</strong> ${timeStr}</p>
              <p style="margin: 4px 0;"><strong>Lead:</strong> ${leadName}</p>
            </div>
            <p style="color: #666; font-size: 14px;">Log in to SynCRM to view full details and prepare for your activity.</p>
          </div>
        `,
        text: `Hi ${userName}, please note your ${typeLabel.toLowerCase()} "${activity.title}" is meant to start in an hour at ${timeStr}. Lead: ${leadName}.`,
      });

      await ctx.runMutation(internal.activityReminders.recordReminder, {
        activityId: activity._id,
        reminderType: "pre_reminder",
        userId: user._id,
      });
    }
  },
});

/**
 * Sends "1 hour after" follow-up reminders for activities still open past their
 * scheduled time. Runs every 5 minutes; deduplication prevents repeat sends.
 */
export const processOverdueReminders = internalAction({
  handler: async (ctx) => {
    const activities = await ctx.runQuery(
      internal.activityReminders.getOverdueActivities
    );

    for (const activity of activities) {
      const alreadySent = await ctx.runQuery(
        internal.activityReminders.checkReminderSent,
        { activityId: activity._id, reminderType: "overdue_reminder" }
      );
      if (alreadySent) continue;

      const [user, lead] = await Promise.all([
        ctx.runQuery(internal.activityReminders.getUserById, {
          userId: activity.assignedToUserId,
        }),
        ctx.runQuery(internal.activityReminders.getLeadById, {
          leadId: activity.leadId,
        }),
      ]);

      if (!user || !user.email || !user.isActive) continue;

      const timezone = user.timezone || "UTC";
      const userName = user.fullName || user.name || "there";
      const timeStr = formatTime(activity.scheduledAt!, timezone);
      const leadName = lead?.fullName || "Unknown";
      const typeLabel = activityTypeLabel(activity.type);

      await sendEmail({
        to: user.email,
        subject: `Follow-up needed: ${typeLabel} "${activity.title}" is overdue`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Overdue Activity Reminder</h2>
            <p>Hi ${userName},</p>
            <p>Your <strong>${typeLabel.toLowerCase()}</strong> &ldquo;<strong>${activity.title}</strong>&rdquo; was scheduled for <strong>${timeStr}</strong> and is still open.</p>
            <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Activity:</strong> ${activity.title}</p>
              <p style="margin: 4px 0;"><strong>Type:</strong> ${typeLabel}</p>
              <p style="margin: 4px 0;"><strong>Was scheduled for:</strong> ${timeStr}</p>
              <p style="margin: 4px 0;"><strong>Lead:</strong> ${leadName}</p>
              <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #dc2626;">Still open</span></p>
            </div>
            <p>Please check in and either:</p>
            <ul>
              <li>Mark the activity as completed with notes on what happened</li>
              <li>Leave a progress update or comment</li>
            </ul>
            <p style="color: #666; font-size: 14px;">Log in to SynCRM to update this activity.</p>
          </div>
        `,
        text: `Hi ${userName}, your ${typeLabel.toLowerCase()} "${activity.title}" was scheduled for ${timeStr} and is still open. Lead: ${leadName}. Please log in to SynCRM to update this activity.`,
      });

      await ctx.runMutation(internal.activityReminders.recordReminder, {
        activityId: activity._id,
        reminderType: "overdue_reminder",
        userId: user._id,
      });
    }
  },
});

/**
 * Sends a personalised daily agenda digest at 8:00 AM in each user's local
 * timezone. Runs every 15 minutes; deduplication by user + date prevents
 * repeat sends even for half-hour offset timezones.
 */
export const processDailyDigests = internalAction({
  handler: async (ctx) => {
    const users = await ctx.runQuery(
      internal.activityReminders.getActiveUsers
    );

    for (const user of users) {
      if (!user.email) continue;

      const timezone = user.timezone || "UTC";
      const hour = getLocalHour(timezone);
      const minute = getLocalMinute(timezone);

      // Only send during the 8:00-8:14 window
      if (hour !== 8 || minute >= 15) continue;

      const dateStr = getLocalDateString(timezone);

      // Dedup check
      const alreadySent = await ctx.runQuery(
        internal.activityReminders.checkDigestSent,
        { userId: user._id, digestDate: dateStr }
      );
      if (alreadySent) continue;

      const { dayStart, dayEnd } = getDayBoundsForTimezone(timezone);

      const activities = await ctx.runQuery(
        internal.activityReminders.getUserDayActivities,
        { userId: user._id, dayStart, dayEnd }
      );

      // Record digest even when empty so we don't re-check this user today
      if (activities.length === 0) {
        await ctx.runMutation(internal.activityReminders.recordReminder, {
          reminderType: "daily_digest",
          userId: user._id,
          digestDate: dateStr,
        });
        continue;
      }

      const sorted = [...activities].sort(
        (a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0)
      );

      // Batch-fetch leads
      const leadIds = [...new Set(sorted.map((a) => a.leadId))];
      const leads: Record<string, { fullName: string; phone: string }> = {};
      for (const leadId of leadIds) {
        const lead = await ctx.runQuery(
          internal.activityReminders.getLeadById,
          { leadId }
        );
        if (lead) leads[leadId] = lead;
      }

      const userName = user.fullName || user.name || "there";
      // Use noon for safe date formatting (avoids midnight edge-case)
      const dateLabel = formatDate(dayStart + 12 * 60 * 60 * 1000, timezone);

      const activityRows = sorted
        .map((a) => {
          const lead = leads[a.leadId];
          const leadName = lead?.fullName || "Unknown";
          const leadPhone = lead?.phone || "";
          const timeStr = a.scheduledAt
            ? formatTime(a.scheduledAt, timezone)
            : "No time set";
          const typeLabel = activityTypeLabel(a.type);
          const statusBadge =
            a.status === "completed"
              ? '<span style="color: #16a34a;">Completed</span>'
              : '<span style="color: #f59e0b;">To Do</span>';

          return `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${timeStr}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${typeLabel}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.title}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${leadName}${leadPhone ? ` (${leadPhone})` : ""}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${statusBadge}</td>
            </tr>
          `;
        })
        .join("");

      const todoCount = sorted.filter((a) => a.status === "todo").length;
      const completedCount = sorted.filter(
        (a) => a.status === "completed"
      ).length;

      await sendEmail({
        to: user.email,
        subject: `Your daily agenda for ${dateLabel} — ${todoCount} task${todoCount !== 1 ? "s" : ""} scheduled`,
        html: `
          <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Daily Agenda</h2>
            <p>Good morning ${userName},</p>
            <p>Here&rsquo;s your schedule for <strong>${dateLabel}</strong>:</p>
            <p style="margin: 8px 0;">
              <strong>${todoCount}</strong> to do &middot;
              <strong>${completedCount}</strong> completed &middot;
              <strong>${sorted.length}</strong> total
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Time</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Type</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Activity</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Lead</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activityRows}
              </tbody>
            </table>
            <p style="color: #666; font-size: 14px;">Log in to SynCRM to manage your activities and update your progress.</p>
          </div>
        `,
        text: `Good morning ${userName}, here's your schedule for ${dateLabel}: ${sorted
          .map((a) => {
            const lead = leads[a.leadId];
            const timeStr = a.scheduledAt
              ? formatTime(a.scheduledAt, timezone)
              : "No time";
            return `${timeStr} - ${activityTypeLabel(a.type)}: ${a.title} (Lead: ${lead?.fullName || "Unknown"})`;
          })
          .join("; ")}`,
      });

      await ctx.runMutation(internal.activityReminders.recordReminder, {
        reminderType: "daily_digest",
        userId: user._id,
        digestDate: dateStr,
      });
    }
  },
});
