/**
 * SyncNotify: the agency's correspondence, at Hub level.
 *
 * Each agency chooses its channels (email, SMS) once, in notifySettings.
 * Modules only trigger a message (convex/notify/send.ts queueMessage); Sync
 * Notify picks the channel, delivers it and keeps the outcome. Bulk sends
 * written in SyncNotify are campaigns: one row, plus a message per person.
 *
 * Module emails sent before SyncNotify (receipts, statements, reminders)
 * keep logging to emailLogs; the SyncNotify log shows both.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const notifyChannel = v.union(v.literal("email"), v.literal("sms"));

export const notifyStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  // No provider configured: written to the server log only (development).
  v.literal("logged")
);

export const notifyTables = {
  notifySettings: defineTable({
    orgId: v.id("organizations"),
    emailEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    // Used when a module asks for "the agency's preferred channel".
    preferredChannel: notifyChannel,
    // Shown as the sender name on emails; SMS uses the provider's sender id.
    senderName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    // The agency's own Twilio account, encrypted with NOTIFY_SECRET_KEY
    // (convex/lib/secretBox.ts). Never returned to the app. Absent = the
    // deployment's TWILIO_* environment variables.
    smsSealed: v.optional(v.string()),
    // The sender shown in settings; not secret.
    smsFrom: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  // A bulk send written in SyncNotify.
  notifyCampaigns: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    channel: notifyChannel,
    // Where the recipients came from: "import", "contacts", "staff",
    // "instalments", "invoices", "tenants".
    audience: v.string(),
    subject: v.optional(v.string()),
    template: v.string(),
    total: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // Every message SyncNotify sends, and how it went.
  notifyMessages: defineTable({
    orgId: v.id("organizations"),
    channel: notifyChannel,
    to: v.string(),
    name: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    status: notifyStatus,
    error: v.optional(v.string()),
    // The module or screen that triggered it ("notify", "finance", "stay").
    source: v.string(),
    // What kind of message, e.g. "campaign", "instalment_reminder".
    kind: v.string(),
    campaignId: v.optional(v.id("notifyCampaigns")),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_created", ["orgId", "createdAt"])
    .index("by_campaign", ["campaignId"]),
};
