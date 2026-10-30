/**
 * SyncNotify settings: which channels the agency uses, which one it
 * prefers, and its own SMS account. Directors only.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { recordAudit } from "../logs";
import { userLabel } from "../stay/shared";
import { getNotifySettings, queueMessage, requireNotify } from "./send";
import { seal } from "../lib/secretBox";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireNotify(ctx);
    return {
      ...(await getNotifySettings(ctx, access.orgId)),
      canEdit: access.isDirector,
      // Whether the deployment has provider keys to fall back on.
      platformEmail: !!process.env.RESEND_API_KEY,
      platformSms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
      // Saving an agency's own SMS account needs the encryption key.
      canStoreSms: !!process.env.NOTIFY_SECRET_KEY,
    };
  },
});

export const update = mutation({
  args: {
    emailEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    preferredChannel: v.union(v.literal("email"), v.literal("sms")),
    senderName: v.string(),
    replyTo: v.string(),
    // Leave out to keep the saved account; null to remove it.
    sms: v.optional(v.union(v.null(), v.object({ accountSid: v.string(), authToken: v.string(), from: v.string() }))),
  },
  handler: async (ctx, args) => {
    const access = await requireNotify(ctx);
    if (!access.isDirector) throw new ConvexError("Director access required");
    if (!args.emailEnabled && !args.smsEnabled) throw new ConvexError("Keep at least one channel on");
    if (args.preferredChannel === "sms" && !args.smsEnabled) throw new ConvexError("Switch SMS on to make it the preferred channel");
    if (args.preferredChannel === "email" && !args.emailEnabled) throw new ConvexError("Switch email on to make it the preferred channel");
    let sealed: { smsSealed?: string; smsFrom?: string } | undefined;
    if (args.sms) {
      const s = { accountSid: args.sms.accountSid.trim(), authToken: args.sms.authToken.trim(), from: args.sms.from.trim() };
      if (!s.accountSid || !s.authToken || !s.from) throw new ConvexError("Fill in the account SID, auth token and sender");
      const key = process.env.NOTIFY_SECRET_KEY;
      if (!key) throw new ConvexError("This deployment cannot store SMS accounts yet: LayerSync needs to set NOTIFY_SECRET_KEY");
      sealed = { smsSealed: await seal(JSON.stringify(s), key), smsFrom: s.from };
    } else if (args.sms === null) {
      sealed = { smsSealed: undefined, smsFrom: undefined };
    }
    const existing = await ctx.db
      .query("notifySettings")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .unique();
    const patch = {
      emailEnabled: args.emailEnabled,
      smsEnabled: args.smsEnabled,
      preferredChannel: args.preferredChannel,
      senderName: args.senderName.trim() || undefined,
      replyTo: args.replyTo.trim() || undefined,
      ...(sealed ?? {}),
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("notifySettings", { orgId: access.orgId, ...patch });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: userLabel(access.user),
      action: "notify.settings_update",
      category: "email",
      description: `SyncNotify: email ${args.emailEnabled ? "on" : "off"}, SMS ${args.smsEnabled ? "on" : "off"}, prefers ${args.preferredChannel}${args.sms === null ? ", SMS account removed" : args.sms ? ", SMS account updated" : ""}`,
      targetType: "organization",
      targetId: access.orgId,
      orgId: access.orgId,
    });
  },
});

/** Send yourself a test message on a channel. */
export const sendTest = mutation({
  args: { channel: v.union(v.literal("email"), v.literal("sms")), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireNotify(ctx);
    const res = await queueMessage(ctx, access.orgId, {
      channel: args.channel,
      name: userLabel(access.user),
      email: args.channel === "email" ? args.to : undefined,
      phone: args.channel === "sms" ? args.to : undefined,
      subject: "SyncNotify test",
      body: `This is a test message from ${access.org.name} via SyncNotify.`,
      source: "notify",
      kind: "test",
      createdByUserId: access.user._id,
    });
    if (!res.queued) throw new ConvexError("Could not send: check the address and that the channel is on");
  },
});
