/**
 * Hub notification centre. Modules write rows through lib/notify.ts; these
 * functions serve the topbar bell. Every read is scoped to the caller's own
 * user id, so no id from the client can reach another user's alerts.
 */
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserWithOrg } from "./helpers";

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
