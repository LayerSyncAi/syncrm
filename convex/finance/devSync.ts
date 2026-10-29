/**
 * The Sync Dev contract (BRD Finance §7). Sync Dev owns developments,
 * stands, buyers and payment plans; Sync Finance owns the money.
 *
 *  Dev -> Finance: syncDevelopment, syncStand (create or update, by id).
 *  Finance -> Dev: standStatus (paid to date, balance, overdue, next due and
 *                  every payment), for showing against each stand.
 *
 * Internal functions, called by Sync Dev's own server code in this app. Until
 * Sync Dev ships, the Instalments screens write the same tables.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { finCurrency } from "../schemas/finance";
import { insertStand, recomputeStand } from "./stands";
import { round2 } from "./lib";

const planRow = v.object({ dueDate: v.string(), amount: v.number(), label: v.string() });

export const syncDevelopment = internalMutation({
  args: {
    orgId: v.id("organizations"),
    developmentId: v.optional(v.id("finDevelopments")),
    name: v.string(),
    developerContactId: v.optional(v.id("contacts")),
    developerName: v.string(),
    developerEmail: v.optional(v.string()),
    moneyHeldBy: v.union(v.literal("developer"), v.literal("agency_trust")),
    commissionPct: v.number(),
    commissionTiming: v.union(v.literal("each_payment"), v.literal("fully_paid")),
    currency: finCurrency,
  },
  handler: async (ctx, args) => {
    const { orgId, developmentId, ...fields } = args;
    const now = Date.now();
    if (developmentId) {
      const d = await ctx.db.get(developmentId);
      if (!d || d.orgId !== orgId) throw new ConvexError("Development not found");
      if (d.currency !== fields.currency || d.moneyHeldBy !== fields.moneyHeldBy) {
        const sold = await ctx.db
          .query("finStands")
          .withIndex("by_development", (q) => q.eq("developmentId", d._id))
          .first();
        if (sold) throw new ConvexError("Currency and who holds the money cannot change once stands are sold");
      }
      await ctx.db.patch(d._id, { ...fields, updatedAt: now });
      return d._id;
    }
    return ctx.db.insert("finDevelopments", { orgId, ...fields, isActive: true, createdAt: now, updatedAt: now });
  },
});

/**
 * Create a stand sale, or update its buyer and plan. Interest Finance has
 * charged stays on the plan; payments already received are kept and
 * re-allocated to the new plan, oldest first.
 */
export const syncStand = internalMutation({
  args: {
    orgId: v.id("organizations"),
    actorUserId: v.id("users"),
    standId: v.optional(v.id("finStands")),
    developmentId: v.id("finDevelopments"),
    standNumber: v.string(),
    buyerContactId: v.optional(v.id("contacts")),
    buyerName: v.string(),
    buyerEmail: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    price: v.number(),
    schedule: v.array(planRow),
    status: v.optional(v.union(v.literal("active"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorUserId);
    if (!actor || actor.orgId !== args.orgId) throw new ConvexError("User not found");
    if (!args.standId) {
      return insertStand(ctx, { user: { ...actor, orgId: args.orgId }, orgId: args.orgId }, args);
    }
    const s = await ctx.db.get(args.standId);
    if (!s || s.orgId !== args.orgId || s.developmentId !== args.developmentId) throw new ConvexError("Stand not found");
    const total = round2(args.schedule.reduce((t, r) => t + r.amount, 0));
    if (total !== round2(args.price)) throw new ConvexError("The plan must add up to the price");
    const interest = s.schedule.filter((r) => r.kind === "interest");
    await ctx.db.patch(s._id, {
      standNumber: args.standNumber.trim(),
      buyerContactId: args.buyerContactId,
      buyerName: args.buyerName.trim(),
      buyerEmail: args.buyerEmail?.trim() || undefined,
      buyerPhone: args.buyerPhone?.trim() || undefined,
      price: round2(args.price),
      schedule: [...args.schedule.map((r) => ({ ...r, amount: round2(r.amount), kind: "plan" as const })), ...interest],
      status: args.status ?? s.status,
      updatedAt: Date.now(),
    });
    await recomputeStand(ctx, s._id);
    return s._id;
  },
});

/** What Sync Dev shows against a stand. */
export const standStatus = internalQuery({
  args: { standId: v.id("finStands") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.standId);
    if (!s) return null;
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_stand", (q) => q.eq("standId", s._id))
      .collect();
    const payments = [];
    for (const t of txs) {
      if (t.kind !== "receipt" && t.kind !== "payment") continue;
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_tx", (q) => q.eq("txId", t._id))
        .collect();
      payments.push({ date: t.date, number: t.number ?? "", amount: round2(lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0)) });
    }
    return {
      status: s.status,
      currency: s.currency,
      price: s.price,
      paidToDate: s.paidToDate,
      balance: s.balance,
      overdue: s.overdue,
      nextDueDate: s.nextDueDate ?? null,
      nextDueAmount: s.nextDueAmount ?? null,
      payments: payments.sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  },
});
