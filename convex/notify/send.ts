/**
 * SyncNotify delivery. Any module calls queueMessage from a mutation; the
 * message row and the decision to send commit together, and a scheduled
 * action delivers it by email (Resend) or SMS (Twilio) and records the
 * outcome on the row.
 */
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserWithOrg } from "../helpers";
import { hasEstateRole } from "../lib/modules";
import { sendEmail } from "../email";
import { sendSms, type SmsCredentials } from "../sms";
import { open } from "../lib/secretBox";
import { escapeHtml } from "../emailLayout";
import { p, shell } from "../stay/emails";
import { routeMessage } from "./lib";

export { routeMessage };

type Ctx = QueryCtx | MutationCtx;

// ── Access ───────────────────────────────────────────────────────────

/**
 * Directors, and staff whose work is talking to clients: accounts,
 * marketing, sales managers and property managers. Only directors change
 * the channels and provider settings.
 */
export async function requireNotify(ctx: Ctx) {
  const user = await getCurrentUserWithOrg(ctx);
  const org = await ctx.db.get(user.orgId);
  if (!org) throw new ConvexError("Organisation not found");
  const isDirector = user.role === "admin" && !user.agentMode;
  const allowed =
    user.role === "admin" ||
    (["accounts", "marketing", "sales_manager", "property_manager"] as const).some((r) => hasEstateRole(user, r));
  if (!allowed) throw new ConvexError("SyncNotify is not available to you");
  return { user, org, orgId: user.orgId, isDirector };
}

// ── Settings ─────────────────────────────────────────────────────────

export type NotifySettingsView = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  preferredChannel: "email" | "sms";
  senderName: string;
  replyTo: string;
  smsOwnAccount: boolean;
  smsFrom: string;
};

export async function getNotifySettings(ctx: Ctx, orgId: Id<"organizations">): Promise<NotifySettingsView> {
  const row = await ctx.db
    .query("notifySettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  return {
    emailEnabled: row?.emailEnabled ?? true,
    smsEnabled: row?.smsEnabled ?? false,
    preferredChannel: row?.preferredChannel ?? "email",
    senderName: row?.senderName ?? "",
    replyTo: row?.replyTo ?? "",
    smsOwnAccount: !!row?.smsSealed,
    smsFrom: row?.smsFrom ?? "",
  };
}

// ── Queueing ─────────────────────────────────────────────────────────

export type OutgoingMessage = {
  /** "preferred" uses the agency's setting, falling back to whichever address exists. */
  channel: "email" | "sms" | "preferred";
  name: string;
  email?: string;
  phone?: string;
  subject?: string;
  body: string;
  source: string;
  kind: string;
  campaignId?: Id<"notifyCampaigns">;
  relatedType?: string;
  relatedId?: string;
  createdByUserId?: Id<"users">;
};

/**
 * Record messages and schedule their delivery. Messages that cannot be
 * routed are stored as failed with the reason, so the log shows them.
 */
export async function queueMessages(ctx: MutationCtx, orgId: Id<"organizations">, messages: OutgoingMessage[]): Promise<{ queued: number; failed: number }> {
  const settings = await getNotifySettings(ctx, orgId);
  const now = Date.now();
  const ids: Id<"notifyMessages">[] = [];
  let failed = 0;
  for (const m of messages) {
    const route = routeMessage(settings, m);
    const base = {
      orgId,
      name: m.name,
      subject: m.subject,
      body: m.body,
      source: m.source,
      kind: m.kind,
      campaignId: m.campaignId,
      relatedType: m.relatedType,
      relatedId: m.relatedId,
      createdByUserId: m.createdByUserId,
      createdAt: now,
    };
    if ("error" in route) {
      await ctx.db.insert("notifyMessages", {
        ...base,
        channel: m.channel === "sms" ? "sms" : "email",
        to: (m.channel === "sms" ? m.phone : m.email) ?? "",
        status: "failed",
        error: route.error,
      });
      failed++;
      continue;
    }
    ids.push(await ctx.db.insert("notifyMessages", { ...base, channel: route.channel, to: route.to, status: "queued" }));
  }
  // Small batches, so a large campaign spreads over several actions.
  for (let i = 0; i < ids.length; i += 25) {
    await ctx.scheduler.runAfter(Math.floor(i / 25) * 2000, internal.notify.send.deliver, { messageIds: ids.slice(i, i + 25) });
  }
  return { queued: ids.length, failed };
}

/** One message, for modules. */
export async function queueMessage(ctx: MutationCtx, orgId: Id<"organizations">, m: OutgoingMessage) {
  return queueMessages(ctx, orgId, [m]);
}

// ── Delivery ─────────────────────────────────────────────────────────

export const loadForDelivery = internalQuery({
  args: { messageId: v.id("notifyMessages") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.messageId);
    if (!m || m.status !== "queued") return null;
    const org = await ctx.db.get(m.orgId);
    const settings = await ctx.db
      .query("notifySettings")
      .withIndex("by_org", (q) => q.eq("orgId", m.orgId))
      .unique();
    return { message: m, org, smsSealed: settings?.smsSealed ?? null, senderName: settings?.senderName ?? null, replyTo: settings?.replyTo ?? null };
  },
});

export const markResult = internalMutation({
  args: {
    messageId: v.id("notifyMessages"),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("logged")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { status: args.status, error: args.error, sentAt: Date.now() });
  },
});

function emailHtml(org: Doc<"organizations"> | null, senderName: string | null, subject: string, body: string): string {
  const agency = { name: senderName || org?.name || "", address: org?.address, phone: org?.phone, email: org?.email };
  return shell(agency, subject, body.split(/\n{2,}/).map((para) => p(escapeHtml(para).replace(/\n/g, "<br>"))).join(""));
}

export const deliver = internalAction({
  args: { messageIds: v.array(v.id("notifyMessages")) },
  handler: async (ctx, args) => {
    for (const messageId of args.messageIds) {
      const data = await ctx.runQuery(internal.notify.send.loadForDelivery, { messageId });
      if (!data) continue;
      const m = data.message;
      try {
        if (m.channel === "sms") {
          let creds: SmsCredentials | null = null;
          if (data.smsSealed) {
            const key = process.env.NOTIFY_SECRET_KEY;
            if (!key) throw new Error("NOTIFY_SECRET_KEY is not set, so the agency's SMS account cannot be read");
            creds = JSON.parse(await open(data.smsSealed, key)) as SmsCredentials;
          }
          const r = await sendSms(m.to, m.body, creds);
          await ctx.runMutation(internal.notify.send.markResult, { messageId, status: r.status, error: r.error });
        } else {
          const subject = m.subject || `Message from ${data.senderName || data.org?.name || "us"}`;
          const r = await sendEmail(
            { to: m.to, subject, html: emailHtml(data.org, data.senderName, subject, m.body), text: m.body, replyTo: data.replyTo ?? undefined },
            ctx,
            { kind: `notify_${m.kind}`, orgId: m.orgId, relatedType: "notifyMessage", relatedId: m._id, triggeredByUserId: m.createdByUserId }
          );
          const status = r.success ? (process.env.RESEND_API_KEY ? "sent" : "logged") : "failed";
          await ctx.runMutation(internal.notify.send.markResult, { messageId, status, error: r.error });
        }
      } catch (e) {
        await ctx.runMutation(internal.notify.send.markResult, { messageId, status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }
  },
});
