import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireStay, requireStayAdmin } from "./access";
import { ensureSettings, getSettings, stayAudit } from "./shared";

/** Stay settings for the caller's agency (defaults until a director saves). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    return { ...(await getSettings(ctx, access.orgId)), canEdit: access.canAdmin };
  },
});

function cleanDays(list: number[], min: number, max: number, label: string): number[] {
  const out = [...new Set(list.map((n) => Math.round(n)))].sort((a, b) => a - b);
  if (out.some((n) => !Number.isFinite(n) || n < min || n > max)) {
    throw new ConvexError(`${label} must be between ${min} and ${max} days`);
  }
  return out;
}

export const update = mutation({
  args: {
    invoiceLeadDays: v.number(),
    reminderDays: v.array(v.number()),
    expiryAlertDays: v.array(v.number()),
    receiptPrefix: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireStayAdmin(access);
    const lead = Math.round(args.invoiceLeadDays);
    if (lead < 0 || lead > 27) throw new ConvexError("Invoice lead days must be between 0 and 27");
    const reminderDays = cleanDays(args.reminderDays, 1, 120, "Reminder days");
    const expiryAlertDays = cleanDays(args.expiryAlertDays, 1, 365, "Expiry alert days");
    if (!expiryAlertDays.length) throw new ConvexError("Add at least one expiry alert");
    const prefix = args.receiptPrefix.trim();
    if (prefix.length > 12) throw new ConvexError("Receipt prefix is too long");
    if (args.timezone) {
      try {
        // Throws a RangeError on an unknown zone.
        new Intl.DateTimeFormat("en-CA", { timeZone: args.timezone });
      } catch {
        throw new ConvexError("Unknown timezone");
      }
    }
    const row = await ensureSettings(ctx, access.orgId);
    await ctx.db.patch(row._id, {
      invoiceLeadDays: lead,
      reminderDays,
      expiryAlertDays,
      receiptPrefix: prefix,
      timezone: args.timezone || undefined,
      updatedAt: Date.now(),
    });
    await stayAudit(ctx, access, {
      action: "stay.settings_update",
      description: "Updated Sync Stay settings",
      targetType: "staySettings",
      targetId: row._id,
      metadata: { invoiceLeadDays: lead, reminderDays, expiryAlertDays, receiptPrefix: prefix },
    });
  },
});
