import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { generateGoogleCalendarUrl } from "./lib/calendar";
import {
  renderEmailShell,
  emailEyebrow,
  emailHeading,
  emailText,
  emailButton,
  emailSecondaryLink,
  detailCard,
  escapeHtml,
  ACCENTS,
  EMAIL_FONT,
} from "./emailLayout";

// =====================
// Formatting helpers
// =====================

export function formatTime(timestamp: number, timezone: string = "UTC"): string {
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

/**
 * Resolve the timezone to render an activity's scheduled time in. Prefers the
 * zone the time was picked in (captured at schedule time), so the displayed
 * "starts at" matches what the user chose even if their profile timezone is
 * unset or has since changed. Falls back to the recipient's profile zone, then
 * UTC.
 */
export function resolveScheduledTimezone(
  scheduledTimezone: string | undefined | null,
  userTimezone: string | undefined | null
): string {
  return scheduledTimezone || userTimezone || "UTC";
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
 * Maximum age of a missed reminder we'll still send, in minutes. Caps
 * catch-up after an outage so a long downtime can't blast stale reminders for
 * events that already started. Override with the REMINDER_MAX_CATCHUP_MINUTES
 * env var; defaults to 60.
 */
const DEFAULT_REMINDER_MAX_CATCHUP_MINUTES = 60;

/**
 * Most reminders claimed per run. The per-minute cadence and the catch-up cap
 * keep this comfortably within Convex transaction limits; the next run picks
 * up any remainder.
 */
const PRE_REMINDER_BATCH_LIMIT = 100;

function getMaxCatchupMinutes(): number {
  const parsed = parseInt(process.env.REMINDER_MAX_CATCHUP_MINUTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REMINDER_MAX_CATCHUP_MINUTES;
}

/**
 * Atomically claim pre-reminders that are due to send.
 *
 * "Due" means the reminder's due time — nextReminderAt, which equals
 * scheduledAt − 1 hour — is at or before now, the activity is still open, and
 * no reminder has been sent yet. This `due_at <= now AND not-yet-sent`
 * window (rather than an exact 60-minute match) fires reminders within ~1
 * minute of the hour mark and automatically catches up missed ticks.
 * Reminders whose due time is older than the catch-up cap are skipped.
 *
 * The claim — setting reminderSentAt — happens here, inside one serializable
 * transaction, *before* any email is sent. Two overlapping cron runs
 * therefore cannot both claim the same activity (the second sees the marker
 * already set), and a restart cannot re-send. All times are absolute UTC
 * instants (unix ms), so there is no local-timezone drift.
 */
export const claimDuePreReminders = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - getMaxCatchupMinutes() * 60 * 1000;

    const due = await ctx.db
      .query("activities")
      .withIndex("by_next_reminder", (q) =>
        q.gte("nextReminderAt", cutoff).lte("nextReminderAt", now)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "todo"),
          q.eq(q.field("reminderSentAt"), undefined)
        )
      )
      .take(PRE_REMINDER_BATCH_LIMIT);

    for (const activity of due) {
      await ctx.db.patch(activity._id, { reminderSentAt: now });
    }
    return due;
  },
});

/**
 * Get todo activities that are overdue (scheduledAt was 50+ min ago, up to 24 h).
 * Uses the by_next_reminder index for efficient batched querying.
 */
export const getOverdueActivities = internalQuery({
  handler: async (ctx) => {
    const now = Date.now();
    const overdueSince = now - 50 * 60 * 1000;
    const maxLookback = now - 24 * 60 * 60 * 1000;
    // nextReminderAt for overdue: activities whose pre-reminder was due 1h50m to 25h ago
    const reminderLookback = maxLookback - 60 * 60 * 1000;
    const reminderCutoff = overdueSince - 60 * 60 * 1000;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_next_reminder", (q) =>
        q.gte("nextReminderAt", reminderLookback).lte("nextReminderAt", reminderCutoff)
      )
      .collect();

    return activities.filter(
      (a) =>
        a.status === "todo" &&
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
    // Use compound index to narrow by assignee + scheduledAt range
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_assignee_status", (q) =>
        q
          .eq("assignedToUserId", args.userId)
          .gte("scheduledAt", args.dayStart)
          .lt("scheduledAt", args.dayEnd)
      )
      .collect();

    return activities;
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
 *
 * Runs once per minute. It claims every reminder whose due time has passed
 * (see claimDuePreReminders) rather than matching an exact 60-minute offset,
 * so reminders fire within ~1 minute of the hour mark and ticks missed during
 * downtime are caught up automatically, bounded by the catch-up cap.
 */
export const processPreReminders = internalAction({
  handler: async (ctx) => {
    // Claiming marks reminderSentAt inside one transaction, so the send below
    // is already deduplicated against overlapping runs and restarts.
    const activities = await ctx.runMutation(
      internal.activityReminders.claimDuePreReminders
    );

    for (const activity of activities) {
      const user = await ctx.runQuery(internal.activityReminders.getUserById, {
        userId: activity.assignedToUserId,
      });
      if (!user || !user.email || !user.isActive) continue;

      const lead = activity.leadId
        ? await ctx.runQuery(internal.activityReminders.getLeadById, { leadId: activity.leadId })
        : null;

      const timezone = resolveScheduledTimezone(
        activity.scheduledTimezone,
        user.timezone
      );
      const userName = user.fullName || user.name || "there";
      const timeStr = formatTime(activity.scheduledAt!, timezone);
      const leadName = lead?.fullName || null;
      const typeLabel = activityTypeLabel(activity.type);
      const leadText = leadName ? ` Lead: ${leadName}.` : "";

      const { accent, tint } = ACCENTS.blue;
      const siteUrl = process.env.SITE_URL || "http://localhost:3000";
      const tasksUrl = `${siteUrl}/app/tasks`;
      const safeTitle = escapeHtml(activity.title);

      // Map the activity onto the generic calendar-event model for the
      // "Add to Google Calendar" link.
      const googleCalendarUrl = generateGoogleCalendarUrl({
        title: activity.title,
        description: activity.description || typeLabel,
        start: new Date(activity.scheduledAt!),
        url: tasksUrl,
      });

      const detailRows = [
        { label: "Activity", value: safeTitle },
        { label: "Type", value: typeLabel },
        { label: "Starts at", value: timeStr },
      ];
      if (leadName) {
        detailRows.push({ label: "Lead", value: escapeHtml(leadName) });
      }

      const content =
        emailEyebrow("Upcoming Activity", accent, tint) +
        emailHeading(`${typeLabel} starting soon`) +
        emailText(
          `Hi ${escapeHtml(userName)}, your ${typeLabel.toLowerCase()} &ldquo;<strong style="color:#0f172a;">${safeTitle}</strong>&rdquo; is scheduled to begin in about an hour, at <strong style="color:#0f172a;">${timeStr}</strong>.`
        ) +
        detailCard(detailRows) +
        emailButton({
          href: googleCalendarUrl,
          label: "Add to Google Calendar",
          accentColor: accent,
        }) +
        emailSecondaryLink(tasksUrl, "Want the full details?");

      await sendEmail({
        to: user.email,
        subject: `Reminder: ${typeLabel} "${activity.title}" starts in 1 hour`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `Starts at ${timeStr} — about an hour from now.`,
          content,
        }),
        text: `Hi ${userName}, your ${typeLabel.toLowerCase()} "${activity.title}" is scheduled to begin in about an hour, at ${timeStr}.${leadText}\n\nAdd to Google Calendar: ${googleCalendarUrl}\n\nView in SynCRM: ${tasksUrl}`,
      }, ctx, {
        kind: "activity_pre_reminder",
        triggeredByUserId: user._id,
        triggeredByLabel: user.email,
        relatedType: "activity",
        relatedId: activity._id,
        orgId: user.orgId,
      });

      // Fire a web push alongside the email (no-op if push isn't configured or
      // the user has no subscribed devices).
      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: user._id,
        title: `${typeLabel} starting soon`,
        body: `"${activity.title}" starts at ${timeStr}${leadName ? ` · ${leadName}` : ""}`,
        url: "/app/tasks",
        tag: `activity-${activity._id}`,
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

      const user = await ctx.runQuery(internal.activityReminders.getUserById, {
        userId: activity.assignedToUserId,
      });
      const lead = activity.leadId
        ? await ctx.runQuery(internal.activityReminders.getLeadById, { leadId: activity.leadId })
        : null;

      if (!user || !user.email || !user.isActive) continue;

      const timezone = resolveScheduledTimezone(
        activity.scheduledTimezone,
        user.timezone
      );
      const userName = user.fullName || user.name || "there";
      const timeStr = formatTime(activity.scheduledAt!, timezone);
      const leadName = lead?.fullName || null;
      const typeLabel = activityTypeLabel(activity.type);
      const leadText = leadName ? ` Lead: ${leadName}.` : "";

      const { accent, tint } = ACCENTS.red;
      const siteUrl = process.env.SITE_URL || "http://localhost:3000";
      const tasksUrl = `${siteUrl}/app/tasks`;
      const safeTitle = escapeHtml(activity.title);

      const detailRows = [
        { label: "Activity", value: safeTitle },
        { label: "Type", value: typeLabel },
        { label: "Was due", value: timeStr },
      ];
      if (leadName) {
        detailRows.push({ label: "Lead", value: escapeHtml(leadName) });
      }
      detailRows.push({
        label: "Status",
        value: `<span style="color:${accent};">Still open</span>`,
      });

      const content =
        emailEyebrow("Action Needed", accent, tint) +
        emailHeading(`${typeLabel} needs a follow-up`) +
        emailText(
          `Hi ${escapeHtml(userName)}, your ${typeLabel.toLowerCase()} &ldquo;<strong style="color:#0f172a;">${safeTitle}</strong>&rdquo; was scheduled for <strong style="color:#0f172a;">${timeStr}</strong> and is still marked open.`
        ) +
        detailCard(detailRows) +
        emailText("Take a moment to close the loop:") +
        `<ul style="margin:10px 0 0 0;padding-left:22px;font-family:${EMAIL_FONT};font-size:15px;line-height:24px;color:#475569;">` +
        `<li style="margin:5px 0;">Mark it complete with a note on what happened</li>` +
        `<li style="margin:5px 0;">Or leave a progress update for your team</li>` +
        `</ul>` +
        emailButton({
          href: tasksUrl,
          label: "Update this activity",
          accentColor: accent,
        });

      await sendEmail({
        to: user.email,
        subject: `Follow-up needed: ${typeLabel} "${activity.title}" is overdue`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `Scheduled for ${timeStr} and still open.`,
          content,
        }),
        text: `Hi ${userName}, your ${typeLabel.toLowerCase()} "${activity.title}" was scheduled for ${timeStr} and is still open.${leadText} Update it in SynCRM: ${tasksUrl}`,
      }, ctx, {
        kind: "activity_overdue_reminder",
        triggeredByUserId: user._id,
        triggeredByLabel: user.email,
        relatedType: "activity",
        relatedId: activity._id,
        orgId: user.orgId,
      });

      await ctx.runMutation(internal.activityReminders.recordReminder, {
        activityId: activity._id,
        reminderType: "overdue_reminder",
        userId: user._id,
      });

      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: user._id,
        title: `${typeLabel} overdue`,
        body: `"${activity.title}" was due at ${timeStr} and is still open.`,
        url: "/app/tasks",
        tag: `activity-${activity._id}`,
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

      // Batch-fetch leads (only for lead-linked activities)
      const leadIds = [...new Set(sorted.map((a) => a.leadId).filter(Boolean))];
      const leads: Record<string, { fullName: string; phone?: string }> = {};
      for (const leadId of leadIds) {
        const lead = await ctx.runQuery(
          internal.activityReminders.getLeadById,
          { leadId: leadId! }
        );
        if (lead) leads[leadId as string] = lead;
      }

      const userName = user.fullName || user.name || "there";
      // Use noon for safe date formatting (avoids midnight edge-case)
      const dateLabel = formatDate(dayStart + 12 * 60 * 60 * 1000, timezone);

      const { accent, tint } = ACCENTS.blue;
      const siteUrl = process.env.SITE_URL || "http://localhost:3000";
      const tasksUrl = `${siteUrl}/app/tasks`;

      const todoCount = sorted.filter((a) => a.status === "todo").length;
      const completedCount = sorted.filter(
        (a) => a.status === "completed"
      ).length;

      const activityRows = sorted
        .map((a, i) => {
          const lead = a.leadId ? leads[a.leadId as string] : null;
          const leadName = lead?.fullName || (a.leadId ? "Lead" : null);
          const timeStr = a.scheduledAt
            ? formatTime(
                a.scheduledAt,
                resolveScheduledTimezone(a.scheduledTimezone, timezone)
              )
            : "Anytime";
          const rowTypeLabel = activityTypeLabel(a.type);
          const subline = leadName
            ? `${rowTypeLabel} &middot; ${escapeHtml(leadName)}`
            : rowTypeLabel;
          const statusPill =
            a.status === "completed"
              ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:#dcfce7;color:#15803d;">Done</span>`
              : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:#fef3c7;color:#b45309;">To do</span>`;
          return `<tr><td style="padding:14px 0;${i > 0 ? "border-top:1px solid #e2e8f0;" : ""}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="62" valign="top" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">${timeStr}</td>
<td valign="top" style="padding:0 12px;">
<p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:20px;font-weight:600;color:#0f172a;">${escapeHtml(a.title)}</p>
<p style="margin:3px 0 0 0;font-family:${EMAIL_FONT};font-size:12px;line-height:18px;color:#94a3b8;">${subline}</p>
</td>
<td width="72" valign="top" align="right">${statusPill}</td>
</tr></table>
</td></tr>`;
        })
        .join("");

      const statCard = (count: number, label: string) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
<tr><td style="padding:16px 10px;text-align:center;">
<p style="margin:0;font-family:${EMAIL_FONT};font-size:26px;line-height:30px;font-weight:700;color:#0f172a;">${count}</p>
<p style="margin:4px 0 0 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;">${label}</p>
</td></tr></table>`;

      const content =
        emailEyebrow("Daily Agenda", accent, tint) +
        emailHeading(`Good morning, ${escapeHtml(userName)}`) +
        emailText(
          `Here's everything on your plate for <strong style="color:#0f172a;">${dateLabel}</strong>.`
        ) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;"><tr>` +
        `<td width="33.33%" valign="top" style="padding-right:6px;">${statCard(todoCount, "To do")}</td>` +
        `<td width="33.33%" valign="top" style="padding:0 6px;">${statCard(completedCount, "Done")}</td>` +
        `<td width="33.33%" valign="top" style="padding-left:6px;">${statCard(sorted.length, "Total")}</td>` +
        `</tr></table>` +
        `<p style="margin:30px 0 0 0;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;">Today's activities</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0 0;">${activityRows}</table>` +
        emailButton({
          href: tasksUrl,
          label: "Open my agenda",
          accentColor: accent,
        });

      await sendEmail({
        to: user.email,
        subject: `Your daily agenda for ${dateLabel} — ${todoCount} task${todoCount !== 1 ? "s" : ""} scheduled`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `${todoCount} task${todoCount !== 1 ? "s" : ""} to do${completedCount ? `, ${completedCount} already done` : ""}.`,
          content,
        }),
        text: `Good morning ${userName}, here's your schedule for ${dateLabel}: ${sorted
          .map((a) => {
            const lead = a.leadId ? leads[a.leadId as string] : null;
            const timeStr = a.scheduledAt
              ? formatTime(
                  a.scheduledAt,
                  resolveScheduledTimezone(a.scheduledTimezone, timezone)
                )
              : "No time";
            const leadCtx = lead ? `Lead: ${lead.fullName}` : "Standalone task";
            return `${timeStr} - ${activityTypeLabel(a.type)}: ${a.title} (${leadCtx})`;
          })
          .join("; ")}`,
      }, ctx, {
        kind: "daily_digest",
        triggeredByUserId: user._id,
        triggeredByLabel: user.email,
        orgId: user.orgId,
      });

      await ctx.runMutation(internal.activityReminders.recordReminder, {
        reminderType: "daily_digest",
        userId: user._id,
        digestDate: dateStr,
      });

      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: user._id,
        title: "Your daily agenda",
        body: `${todoCount} task${todoCount !== 1 ? "s" : ""} scheduled for ${dateLabel}.`,
        url: "/app/tasks",
        tag: `digest-${dateStr}`,
      });
    }
  },
});
