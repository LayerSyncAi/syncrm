/**
 * Property expenses. Recorded here by staff, and also written from repair
 * costs by the maintenance flow. Those with rechargeToLandlord are deducted
 * on the landlord statement.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getVisibleStayProperty, requireLeaseEditor, requireStay } from "./access";
import { isValidDate, round2 } from "./ledger";
import { nameMaps, stayAudit, visibleStayProperties } from "./shared";

export const create = mutation({
  args: {
    stayPropertyId: v.id("stayProperties"),
    unitId: v.optional(v.id("stayUnits")),
    date: v.string(),
    description: v.string(),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("ZiG")),
    supplier: v.optional(v.string()),
    rechargeToLandlord: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const sp = await getVisibleStayProperty(ctx, access, args.stayPropertyId);
    if (!isValidDate(args.date)) throw new ConvexError("Enter a valid date");
    const description = args.description.trim();
    if (!description) throw new ConvexError("Describe the expense");
    if (!(args.amount > 0)) throw new ConvexError("Amount must be more than zero");
    if (args.unitId) {
      const unit = await ctx.db.get(args.unitId);
      if (!unit || unit.stayPropertyId !== sp._id) throw new ConvexError("Unit not found");
    }
    const id = await ctx.db.insert("stayExpenses", {
      orgId: access.orgId,
      stayPropertyId: sp._id,
      unitId: args.unitId,
      date: args.date,
      description,
      amount: round2(args.amount),
      currency: args.currency,
      supplier: args.supplier?.trim() || undefined,
      rechargeToLandlord: args.rechargeToLandlord,
      createdByUserId: access.user._id,
      createdAt: Date.now(),
    });
    await stayAudit(ctx, access, {
      action: "stay.expense_create",
      description: `Expense "${description}" ${args.currency} ${round2(args.amount)}`,
      targetType: "stayExpense",
      targetId: id,
      metadata: { stayPropertyId: sp._id, rechargeToLandlord: args.rechargeToLandlord },
    });
    return id;
  },
});

/** Expenses in a date range on the caller's properties. */
export const list = query({
  args: { from: v.string(), to: v.string(), stayPropertyId: v.optional(v.id("stayProperties")) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sps = (await visibleStayProperties(ctx, access)).filter((sp) => !args.stayPropertyId || sp._id === args.stayPropertyId);
    const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId) });
    const rows = [];
    for (const sp of sps) {
      const list = await ctx.db
        .query("stayExpenses")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .collect();
      for (const e of list) {
        if (e.date < args.from || e.date > args.to) continue;
        rows.push({
          _id: e._id,
          date: e.date,
          propertyName: names.property(sp.propertyId)?.title ?? "Property",
          description: e.description,
          amount: e.amount,
          currency: e.currency,
          supplier: e.supplier ?? "",
          rechargeToLandlord: e.rechargeToLandlord,
          fromMaintenance: !!e.maintenanceId,
        });
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  },
});
