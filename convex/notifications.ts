/**
 * Hub notification centre. Modules write rows through lib/notify.ts; these
 * functions serve the topbar bell. Every read is scoped to the caller's own
 * user id, so no id from the client can reach another user's alerts.
 */
import { internalAction, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUserWithOrg } from "./helpers";
import { sendAlertEmail } from "./email";
import {
  NOTIFICATION_MODULE_LABELS,
  emailAlertChoices,
  notificationModuleValidator,
} from "./lib/modules";

const UNREAD_CAP = 99;

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

/** Unread count for the bell badge, capped so the read stays small. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(UNREAD_CAP + 1);
    return rows.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const row = await ctx.db.get(args.notificationId);
    if (!row || row.userId !== user._id) throw new ConvexError("Notification not found");
    if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(500);
    for (const row of rows) await ctx.db.patch(row._id, { readAt: now });
  },
});

// =====================
// Email alerts (HB-61)
// =====================

/** The alert sources the caller may receive by email, and which are on. */
export const myEmailAlerts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const org = await ctx.db.get(user.orgId);
    const choices = emailAlertChoices(user, org);
    return {
      email: user.email ?? null,
      choices,
      selected: (user.emailAlertModules ?? []).filter((m) => choices.includes(m)),
    };
  },
});

export const setMyEmailAlerts = mutation({
  args: { modules: v.array(notificationModuleValidator) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const org = await ctx.db.get(user.orgId);
    const choices = emailAlertChoices(user, org);
    const modules = [...new Set(args.modules)];
    const blocked = modules.find((m) => !choices.includes(m));
    if (blocked) throw new ConvexError(`${NOTIFICATION_MODULE_LABELS[blocked]} is not available to you`);
    await ctx.db.patch(user._id, { emailAlertModules: modules, updatedAt: Date.now() });
  },
});

export const orgNameForEmail = internalQuery({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => (await ctx.db.get(args.orgId))?.name ?? "SyncEstate",
});

/** Scheduled by lib/notify.ts once the alert rows are committed. */
export const sendAlertEmails = internalAction({
  args: {
    to: v.array(v.string()),
    orgId: v.id("organizations"),
    module: notificationModuleValidator,
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orgName = await ctx.runQuery(internal.notifications.orgNameForEmail, { orgId: args.orgId });
    for (const to of args.to) {
      await sendAlertEmail(
        {
          to,
          orgName,
          moduleLabel: NOTIFICATION_MODULE_LABELS[args.module],
          title: args.title,
          body: args.body,
          href: args.href,
        },
        ctx,
        { kind: `alert_${args.kind}`, relatedType: "notification", orgId: args.orgId }
      );
    }
  },
});
