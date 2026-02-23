/**
 * Activity Email Reminder System
 * ================================
 * Three reminder types are sent by Convex cron jobs:
 *
 *  1. pre_start_1h      — 60 min before activity.scheduledAt
 *  2. post_start_1h_open — 60 min after activity.scheduledAt, only if still open
 *  3. daily_digest      — every day at 08:00 in the user's local timezone
 *                         (falls back to UTC when user.timezone is absent)
 *
 * Deduplication is enforced by the `activityReminderEvents.dedupeKey` index.
 * Every send attempt first inserts a "pending" row.  If a row with that key
 * already exists the reminder is skipped — this makes the whole pipeline safe
 * to retry without sending duplicates.
 */

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { sendEmail } from "./email";
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
  formatShortDate,
  formatActivityType,
} from "./reminderUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Internal Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all "todo" activities whose scheduledAt falls in the pre-start window:
 * between (now + 55 min) and (now + 65 min).
 *
 * Running the cron every 5 minutes with a 10-minute window gives 2× overlap
 * to handle clock drift; the deduplication key prevents double-sending.
 */
export const getActivitiesForPreStart = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = now + 55 * 60 * 1000;
    const windowEnd = now + 65 * 60 * 1000;

    return ctx.db
      .query("activities")
      .withIndex("by_scheduled_at", (q) =>
        q.gte("scheduledAt", windowStart).lte("scheduledAt", windowEnd)
      )
      .filter((q) => q.eq(q.field("status"), "todo"))
      .collect();
  },
});

/**
 * Returns all "todo" activities whose scheduledAt falls in the post-start window:
 * between (now - 65 min) and (now - 55 min).
 */
export const getActivitiesForPostStart = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = now - 65 * 60 * 1000;
    const windowEnd = now - 55 * 60 * 1000;

    return ctx.db
      .query("activities")
      .withIndex("by_scheduled_at", (q) =>
        q.gte("scheduledAt", windowStart).lte("scheduledAt", windowEnd)
      )
      .filter((q) => q.eq(q.field("status"), "todo"))
      .collect();
  },
});

/** Returns all active users (used by the daily digest cron). */
export const getAllActiveUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Returns all "todo" activities assigned to `userId` whose scheduledAt falls
 * on `localDateStr` (YYYY-MM-DD in the user's local timezone), sorted by
 * scheduledAt ascending.
 */
export const getActivitiesForDigest = internalQuery({
  args: {
    userId: v.id("users"),
    dayStartMs: v.number(),
    dayEndMs: v.number(),
  },
  handler: async (ctx, { userId, dayStartMs, dayEndMs }) => {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_scheduled_at", (q) =>
        q.gte("scheduledAt", dayStartMs).lte("scheduledAt", dayEndMs)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("assignedToUserId"), userId),
          q.eq(q.field("status"), "todo")
        )
      )
      .collect();

    // Fetch lead context for each activity
    const leadIds = [...new Set(activities.map((a) => a.leadId))];
    const leads = await Promise.all(leadIds.map((id) => ctx.db.get(id)));
    const leadMap = new Map(
      leads.filter(Boolean).map((l) => [l!._id, l!])
    );

    return activities
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
      .map((activity) => ({
        ...activity,
        lead: leadMap.get(activity.leadId) ?? null,
      }));
  },
});

/** Checks whether a dedup key already exists in the reminder events table. */
export const getReminderByDedupeKey = internalQuery({
  args: { dedupeKey: v.string() },
  handler: async (ctx, { dedupeKey }) => {
    return ctx.db
      .query("activityReminderEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically claims a reminder slot.
 *
 * If a row with `dedupeKey` already exists → returns { claimed: false }.
 * Otherwise inserts a "pending" row and returns { claimed: true, id }.
 *
 * Because Convex mutations are serialisable transactions, the check-then-insert
 * is race-condition free even under concurrent cron retries.
 */
export const claimReminderSlot = internalMutation({
  args: {
    activityId: v.optional(v.id("activities")),
    userId: v.id("users"),
    reminderType: v.union(
      v.literal("pre_start_1h"),
      v.literal("post_start_1h_open"),
      v.literal("daily_digest")
    ),
    scheduledFor: v.number(),
    dedupeKey: v.string(),
    orgId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activityReminderEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .first();

    if (existing) {
      return { claimed: false, existingStatus: existing.status };
    }

    const now = Date.now();
    const id = await ctx.db.insert("activityReminderEvents", {
      activityId: args.activityId,
      userId: args.userId,
      reminderType: args.reminderType,
      scheduledFor: args.scheduledFor,
      dedupeKey: args.dedupeKey,
      status: "pending",
      orgId: args.orgId,
      createdAt: now,
      updatedAt: now,
    });

    return { claimed: true, id };
  },
});

/** Updates a reminder row to its final status after an attempt. */
export const finalizeReminder = internalMutation({
  args: {
    id: v.id("activityReminderEvents"),
    status: v.union(
      v.literal("sent"),
      v.literal("skipped"),
      v.literal("failed")
    ),
    sentAt: v.optional(v.number()),
    skipReason: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, sentAt, skipReason, error }) => {
    await ctx.db.patch(id, {
      status,
      sentAt,
      skipReason,
      error,
      updatedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────────────────────

function buildPreStartEmail(opts: {
  userName: string;
  activityTitle: string;
  activityType: string;
  scheduledAt: number;
  timezone: string;
  leadName: string;
  leadPhone: string;
}): { subject: string; html: string; text: string } {
  const timeStr = formatScheduledDateTime(opts.scheduledAt, opts.timezone);
  const subject = `Reminder: "${opts.activityTitle}" starts in 1 hour`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <h2 style="color:#2563eb;">⏰ Activity Reminder</h2>
      <p>Hi <strong>${opts.userName}</strong>,</p>
      <p>
        Your <strong>${opts.activityType}</strong>
        <em>"${opts.activityTitle}"</em> with
        <strong>${opts.leadName}</strong> (${opts.leadPhone}) is
        scheduled to start in <strong>1 hour</strong>.
      </p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;width:120px;">When</td>
          <td style="padding:8px;background:#f9fafb;">${timeStr}</td>
        </tr>
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;">Lead</td>
          <td style="padding:8px;background:#f9fafb;">${opts.leadName} — ${opts.leadPhone}</td>
        </tr>
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;">Type</td>
          <td style="padding:8px;background:#f9fafb;">${opts.activityType}</td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:13px;">Please prepare accordingly. This is an automated reminder from SynCRM.</p>
    </div>
  `;

  const text =
    `Hi ${opts.userName},\n\n` +
    `Your ${opts.activityType} "${opts.activityTitle}" with ${opts.leadName} (${opts.leadPhone}) ` +
    `is scheduled to start in 1 hour at ${timeStr}.\n\n` +
    `Please prepare accordingly.\n\n— SynCRM`;

  return { subject, html, text };
}

function buildPostStartEmail(opts: {
  userName: string;
  activityTitle: string;
  activityType: string;
  scheduledAt: number;
  timezone: string;
  leadName: string;
  leadPhone: string;
}): { subject: string; html: string; text: string } {
  const timeStr = formatScheduledDateTime(opts.scheduledAt, opts.timezone);
  const subject = `Action needed: "${opts.activityTitle}" is overdue`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <h2 style="color:#dc2626;">⚠️ Activity Update Required</h2>
      <p>Hi <strong>${opts.userName}</strong>,</p>
      <p>
        Your <strong>${opts.activityType}</strong>
        <em>"${opts.activityTitle}"</em> with
        <strong>${opts.leadName}</strong> was scheduled for
        <strong>${timeStr}</strong> and is still open.
      </p>
      <p>
        Please log in to <strong>SynCRM</strong> to either
        <strong>close the activity</strong> or
        <strong>leave a progress update</strong>.
      </p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;width:120px;">Scheduled</td>
          <td style="padding:8px;background:#fff3cd;">${timeStr}</td>
        </tr>
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;">Lead</td>
          <td style="padding:8px;background:#f9fafb;">${opts.leadName} — ${opts.leadPhone}</td>
        </tr>
        <tr>
          <td style="padding:8px;background:#f3f4f6;font-weight:bold;">Type</td>
          <td style="padding:8px;background:#f9fafb;">${opts.activityType}</td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:13px;">This is an automated reminder from SynCRM.</p>
    </div>
  `;

  const text =
    `Hi ${opts.userName},\n\n` +
    `Your ${opts.activityType} "${opts.activityTitle}" with ${opts.leadName} was scheduled ` +
    `for ${timeStr} and is still open.\n\n` +
    `Please log in to SynCRM to close the activity or add a progress update.\n\n— SynCRM`;

  return { subject, html, text };
}

type DigestActivity = {
  _id: Id<"activities">;
  title: string;
  type: "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note";
  scheduledAt?: number;
  lead: {
    fullName: string;
    phone: string;
    email?: string;
  } | null;
};

function buildDailyDigestEmail(opts: {
  userName: string;
  localDateStr: string;
  timezone: string;
  activities: DigestActivity[];
}): { subject: string; html: string; text: string } {
  const dateLabel = formatShortDate(
    // Parse YYYY-MM-DD as midnight in UTC (used only for display label)
    new Date(opts.localDateStr + "T12:00:00Z").getTime(),
    "UTC"
  );
  const subject = `Your activity digest for ${dateLabel}`;

  const activityRows = opts.activities
    .map((a) => {
      const timeStr = a.scheduledAt
        ? formatTime(a.scheduledAt, opts.timezone)
        : "No time set";
      const leadInfo = a.lead
        ? `${a.lead.fullName} (${a.lead.phone})`
        : "Unknown lead";
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
            <strong>${timeStr}</strong>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
            ${formatActivityType(a.type)}: <em>${a.title}</em>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">
            ${leadInfo}
          </td>
        </tr>
      `;
    })
    .join("");

  const noActivitiesRow = `
    <tr>
      <td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;">
        No scheduled activities for today.
      </td>
    </tr>
  `;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <h2 style="color:#2563eb;">📅 Daily Activity Digest</h2>
      <p>Hi <strong>${opts.userName}</strong>, here are your scheduled activities for <strong>${dateLabel}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px;text-align:left;width:90px;">Time</th>
            <th style="padding:8px;text-align:left;">Activity</th>
            <th style="padding:8px;text-align:left;">Lead</th>
          </tr>
        </thead>
        <tbody>
          ${opts.activities.length > 0 ? activityRows : noActivitiesRow}
        </tbody>
      </table>
      <p style="color:#6b7280;font-size:13px;">
        Timezone: ${opts.timezone}. This is an automated digest from SynCRM.
      </p>
    </div>
  `;

  const textLines = opts.activities.map((a) => {
    const timeStr = a.scheduledAt
      ? formatTime(a.scheduledAt, opts.timezone)
      : "No time set";
    const leadInfo = a.lead
      ? `${a.lead.fullName} (${a.lead.phone})`
      : "Unknown lead";
    return `  • ${timeStr} — ${formatActivityType(a.type)}: ${a.title} | ${leadInfo}`;
  });

  const text =
    `Hi ${opts.userName},\n\n` +
    `Here are your scheduled activities for ${dateLabel}:\n\n` +
    (textLines.length > 0
      ? textLines.join("\n")
      : "  No scheduled activities for today.") +
    `\n\nTimezone: ${opts.timezone}\n— SynCRM`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Actions (called by cron jobs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes the pre-start (1 hour before) reminders.
 * Called every 5 minutes by the cron job in crons.ts.
 */
export const processPreStartReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    const activities = await ctx.runQuery(
      internal.reminders.getActivitiesForPreStart,
      {}
    );

    let sent = 0, skipped = 0, failed = 0;
    console.log(`[reminders:pre_start] Found ${activities.length} eligible activities`);

    for (const activity of activities) {
      if (!activity.scheduledAt) continue;

      const dedupeKey = buildActivityDedupeKey("pre_start_1h", activity._id);

      // Claim the slot — if already exists, skip
      const claim = await ctx.runMutation(internal.reminders.claimReminderSlot, {
        activityId: activity._id,
        userId: activity.assignedToUserId,
        reminderType: "pre_start_1h",
        scheduledFor: activity.scheduledAt - 60 * 60 * 1000,
        dedupeKey,
        orgId: activity.orgId,
      });

      if (!claim.claimed) {
        // Already processed (sent/skipped/failed/pending)
        console.log(`[reminders:pre_start] Skipping ${activity._id} — already claimed (${claim.existingStatus})`);
        skipped++;
        continue;
      }

      const eventId = claim.id as Id<"activityReminderEvents">;

      // Fetch user
      const user = await ctx.runQuery(internal.reminders.getUserById, {
        userId: activity.assignedToUserId,
      });

      if (!user || !user.email) {
        const reason = !user ? "user not found" : "user has no email";
        console.log(`[reminders:pre_start] Skipping activity ${activity._id} — ${reason}`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "skipped",
          skipReason: reason,
        });
        skipped++;
        continue;
      }

      // Fetch lead for context
      const lead = await ctx.runQuery(internal.reminders.getLeadById, {
        leadId: activity.leadId,
      });

      const tz = safeTimezone(user.timezone);
      const template = buildPreStartEmail({
        userName: getUserDisplayName(user),
        activityTitle: activity.title,
        activityType: formatActivityType(activity.type),
        scheduledAt: activity.scheduledAt,
        timezone: tz,
        leadName: lead?.fullName ?? "Unknown lead",
        leadPhone: lead?.phone ?? "",
      });

      const result = await sendEmail({ to: user.email, ...template });

      if (result.success) {
        console.log(`[reminders:pre_start] Sent to ${user.email} for activity ${activity._id} (messageId=${result.messageId})`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "sent",
          sentAt: Date.now(),
        });
        sent++;
      } else {
        console.error(`[reminders:pre_start] Failed for activity ${activity._id}: ${result.error}`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "failed",
          error: result.error ?? "unknown error",
        });
        failed++;
      }
    }

    console.log(`[reminders:pre_start] Done — sent=${sent} skipped=${skipped} failed=${failed}`);
  },
});

/**
 * Processes the post-start (1 hour after, still open) reminders.
 * Called every 5 minutes by the cron job in crons.ts.
 */
export const processPostStartReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const activities = await ctx.runQuery(
      internal.reminders.getActivitiesForPostStart,
      {}
    );

    let sent = 0, skipped = 0, failed = 0;
    console.log(`[reminders:post_start] Found ${activities.length} eligible activities`);

    for (const activity of activities) {
      if (!activity.scheduledAt) continue;

      // Re-read the activity to get the freshest status before processing
      const freshActivity = await ctx.runQuery(
        internal.reminders.getActivityById,
        { activityId: activity._id }
      );

      if (!freshActivity) {
        console.log(`[reminders:post_start] Activity ${activity._id} no longer exists — skipping`);
        skipped++;
        continue;
      }

      // Skip if activity has been closed since the query ran
      if (isActivityClosed(freshActivity.status as "todo" | "completed")) {
        console.log(`[reminders:post_start] Activity ${activity._id} is now closed — skipping`);
        skipped++;
        continue;
      }

      const dedupeKey = buildActivityDedupeKey("post_start_1h_open", activity._id);

      const claim = await ctx.runMutation(internal.reminders.claimReminderSlot, {
        activityId: activity._id,
        userId: activity.assignedToUserId,
        reminderType: "post_start_1h_open",
        scheduledFor: activity.scheduledAt + 60 * 60 * 1000,
        dedupeKey,
        orgId: activity.orgId,
      });

      if (!claim.claimed) {
        console.log(`[reminders:post_start] Skipping ${activity._id} — already claimed (${claim.existingStatus})`);
        skipped++;
        continue;
      }

      const eventId = claim.id as Id<"activityReminderEvents">;

      const user = await ctx.runQuery(internal.reminders.getUserById, {
        userId: activity.assignedToUserId,
      });

      if (!user || !user.email) {
        const reason = !user ? "user not found" : "user has no email";
        console.log(`[reminders:post_start] Skipping activity ${activity._id} — ${reason}`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "skipped",
          skipReason: reason,
        });
        skipped++;
        continue;
      }

      const lead = await ctx.runQuery(internal.reminders.getLeadById, {
        leadId: activity.leadId,
      });

      const tz = safeTimezone(user.timezone);
      const template = buildPostStartEmail({
        userName: getUserDisplayName(user),
        activityTitle: activity.title,
        activityType: formatActivityType(activity.type),
        scheduledAt: activity.scheduledAt,
        timezone: tz,
        leadName: lead?.fullName ?? "Unknown lead",
        leadPhone: lead?.phone ?? "",
      });

      const result = await sendEmail({ to: user.email, ...template });

      if (result.success) {
        console.log(`[reminders:post_start] Sent to ${user.email} for activity ${activity._id} (messageId=${result.messageId})`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "sent",
          sentAt: Date.now(),
        });
        sent++;
      } else {
        console.error(`[reminders:post_start] Failed for activity ${activity._id}: ${result.error}`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "failed",
          error: result.error ?? "unknown error",
        });
        failed++;
      }
    }

    console.log(`[reminders:post_start] Done — sent=${sent} skipped=${skipped} failed=${failed}`);
  },
});

/**
 * Processes the daily 8 AM digest for all active users.
 * Called every hour by the cron job in crons.ts.
 *
 * Timezone logic:
 *   1. Use user.timezone (IANA string) if set.
 *   2. Fall back to "UTC" if not set.
 *   3. Check if the current moment is within the 8:00–8:59 AM hour in that timezone.
 *   4. Dedup key = "daily_digest:{userId}:{YYYY-MM-DD}" — date in user's local timezone.
 *      This guarantees exactly one digest per user per local calendar day.
 */
export const processDailyDigests = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    const users = await ctx.runQuery(internal.reminders.getAllActiveUsers, {});

    let sent = 0, skipped = 0, failed = 0;
    console.log(`[reminders:daily_digest] Processing ${users.length} active users`);

    for (const user of users) {
      const tz = safeTimezone(user.timezone);
      const localHour = getLocalHour(now, tz);

      // Only send if it is currently the 8 AM hour in this user's timezone
      if (localHour !== 8) {
        continue;
      }

      const localDateStr = getLocalDateString(now, tz);
      const dedupeKey = buildDailyDigestDedupeKey(user._id, localDateStr);

      const claim = await ctx.runMutation(internal.reminders.claimReminderSlot, {
        userId: user._id,
        reminderType: "daily_digest",
        scheduledFor: now,
        dedupeKey,
        orgId: user.orgId,
      });

      if (!claim.claimed) {
        console.log(`[reminders:daily_digest] Skipping user ${user._id} on ${localDateStr} — already claimed (${claim.existingStatus})`);
        skipped++;
        continue;
      }

      const eventId = claim.id as Id<"activityReminderEvents">;

      if (!user.email) {
        console.log(`[reminders:daily_digest] Skipping user ${user._id} — no email address`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "skipped",
          skipReason: "user has no email",
        });
        skipped++;
        continue;
      }

      // Compute day boundaries in the user's local timezone
      // Parse YYYY-MM-DD as a day boundary: midnight-to-midnight in the user's tz
      const dayStartMs = new Date(localDateStr + "T00:00:00").getTime() -
        getTimezoneOffsetMs(localDateStr + "T00:00:00", tz);
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;

      const activities = await ctx.runQuery(
        internal.reminders.getActivitiesForDigest,
        {
          userId: user._id,
          dayStartMs,
          dayEndMs,
        }
      );

      const template = buildDailyDigestEmail({
        userName: getUserDisplayName(user),
        localDateStr,
        timezone: tz,
        activities: activities as DigestActivity[],
      });

      const result = await sendEmail({ to: user.email, ...template });

      if (result.success) {
        console.log(`[reminders:daily_digest] Sent to ${user.email} for ${localDateStr} (${activities.length} activities, messageId=${result.messageId})`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "sent",
          sentAt: Date.now(),
        });
        sent++;
      } else {
        console.error(`[reminders:daily_digest] Failed for user ${user._id}: ${result.error}`);
        await ctx.runMutation(internal.reminders.finalizeReminder, {
          id: eventId,
          status: "failed",
          error: result.error ?? "unknown error",
        });
        failed++;
      }
    }

    console.log(`[reminders:daily_digest] Done — sent=${sent} skipped=${skipped} failed=${failed}`);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional Internal Queries (for use by the actions above)
// ─────────────────────────────────────────────────────────────────────────────

export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

export const getLeadById = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => ctx.db.get(leadId),
});

export const getActivityById = internalQuery({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => ctx.db.get(activityId),
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the UTC offset in milliseconds for a given local datetime string
 * in a specific timezone.  Used to convert a "local midnight" string to
 * a UTC timestamp.
 *
 * Example: getTimezoneOffsetMs("2026-02-23T00:00:00", "America/New_York")
 *   → returns the UTC offset for New York on that date (accounting for DST)
 */
function getTimezoneOffsetMs(localIsoStr: string, timezone: string): number {
  // Create a Date from the local string treated as UTC, then find
  // the actual UTC timestamp it corresponds to in the target timezone.
  const utcDate = new Date(localIsoStr + "Z"); // treat as UTC
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);

  const get = (type: string) =>
    parseInt(localParts.find((p) => p.type === type)?.value ?? "0", 10);

  const localDateFromParts = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  );

  return utcDate.getTime() - localDateFromParts.getTime();
}
