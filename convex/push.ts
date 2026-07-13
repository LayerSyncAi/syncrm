/**
 * Web Push (PWA) subscription management.
 *
 * Public mutations let a signed-in browser register/unregister its
 * PushSubscription. Internal query/mutations serve the sender action
 * (convex/pushSender.ts), which runs in the Node runtime.
 *
 * The endpoint URL is the natural key for a subscription: the browser mints a
 * new one when permission is (re)granted, and reuses it otherwise, so we upsert
 * by endpoint to avoid duplicates for the same device.
 */

import { mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOptional } from "./helpers";

/**
 * Register (or refresh) the current user's push subscription for one browser.
 * Upserts by endpoint: re-subscribing the same device updates its keys and
 * re-points it at the current user rather than creating a duplicate row.
 */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOptional(ctx);
    if (!user) throw new Error("Unauthorized");

    const now = Date.now();
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: user._id,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
        orgId: user.orgId,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("pushSubscriptions", {
      userId: user._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      orgId: user.orgId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Remove a subscription by endpoint (called when the user turns notifications
 * off, or when the browser reports the subscription was revoked). Only the
 * owning user may delete their own subscription.
 */
export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOptional(ctx);
    if (!user) return;

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing && existing.userId === user._id) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Whether the current user has at least one active push subscription. Drives
 * the "notifications on/off" state of the settings toggle.
 */
export const hasSubscription = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOptional(ctx);
    if (!user) return false;
    const one = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return !!one;
  },
});

// ─── Internal (used by the Node sender action) ──────────────────────────────

/** All subscriptions for a user, across their devices. */
export const getSubscriptionsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Delete a dead subscription by endpoint. Called by the sender when the push
 * service returns 404/410 (the browser unsubscribed or the endpoint expired).
 */
export const deleteByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
