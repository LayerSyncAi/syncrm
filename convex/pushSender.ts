"use node";

/**
 * Web Push sender (Node runtime).
 *
 * Sends a notification to every device a user has subscribed. Runs in the Node
 * runtime because the `web-push` library depends on Node's crypto for VAPID
 * signing and payload encryption.
 *
 * Required Convex deployment env vars (npx convex env set NAME VALUE):
 *   VAPID_PUBLIC_KEY   — must match NEXT_PUBLIC_VAPID_PUBLIC_KEY in the web build
 *   VAPID_PRIVATE_KEY  — kept server-side only
 *   VAPID_SUBJECT      — mailto: or https: contact URL
 *
 * If the keys are absent the action is a no-op (logs a warning) so the app —
 * and the reminder crons — keep working without push configured.
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Send a push notification to all of a user's subscribed devices.
 *
 * Dead subscriptions (push service returns 404/410) are pruned as we go, so the
 * table self-heals when users clear browser data or unsubscribe out-of-band.
 */
export const sendToUser = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    // Relative path the notification opens, e.g. "/app/tasks".
    url: v.optional(v.string()),
    // Collapse key: a newer push with the same tag replaces the old one.
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    if (!publicKey || !privateKey) {
      console.warn(
        "[push] VAPID keys not configured — skipping push for user",
        args.userId
      );
      return { sent: 0, pruned: 0 };
    }

    const subs = await ctx.runQuery(
      internal.push.getSubscriptionsForUser,
      { userId: args.userId }
    );
    if (subs.length === 0) return { sent: 0, pruned: 0 };

    const webpush = await import("web-push");
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url || "/app",
      tag: args.tag,
    });

    let sent = 0;
    let pruned = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 * 60 } // deliver within an hour or drop
        );
        sent++;
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404 Not Found / 410 Gone => the subscription is dead. Prune it.
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.push.deleteByEndpoint, {
            endpoint: sub.endpoint,
          });
          pruned++;
        } else {
          console.error(
            "[push] send failed for endpoint",
            sub.endpoint,
            statusCode ?? err
          );
        }
      }
    }

    return { sent, pruned };
  },
});
