/**
 * Deposits (BRD Stay ST-40 to ST-42). A deposit is held against the lease,
 * apart from rent. Money in arrives as a "deposit" payment with its own
 * receipt (payments.record); at move-out it is applied to what the tenant
 * owes and/or refunded. Each movement is kept on the deposit row.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleLease, requireLeaseEditor, requireStay } from "./access";
import { addTo, CurrencyTotals, formatAmount, isValidDate, round2 } from "./ledger";
import { canSeeLease, depositForLease, leaseLabels, stayAudit, todayForOrg } from "./shared";
import { applyDepositToCharges, owedOnChain } from "./money";
import { depositHeldInValidator } from "./validators";
import { postDepositMove, postDepositSettlement } from "../finance/posting";

function heldOf(d: Doc<"stayDeposits">) {
  return round2(d.amountReceived - d.amountApplied - d.amountRefunded);
}

/** ST-41: at move-out, apply the deposit to amounts owed and refund the rest. */
export const settle = mutation({
  args: {
    leaseId: v.id("stayLeases"),
    date: v.string(),
    applyAmount: v.number(),
    refundAmount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.leaseId);
    const deposit = await depositForLease(ctx, lease._id);
    if (!deposit) throw new ConvexError("No deposit is recorded on this lease");
    if (!isValidDate(args.date)) throw new ConvexError("Enter a valid date");
    const apply = round2(args.applyAmount);
    const refund = round2(args.refundAmount);
    if (apply < 0 || refund < 0) throw new ConvexError("Amounts cannot be negative");
    if (apply + refund <= 0) throw new ConvexError("Enter an amount to apply or refund");
    const held = heldOf(deposit);
    if (round2(apply + refund) > held) {
      throw new ConvexError(`Only ${formatAmount(held, deposit.currency)} of the deposit is held`);
    }
    const owed = await owedOnChain(ctx, lease);
    if (apply > owed) throw new ConvexError(`The tenant owes ${formatAmount(owed, deposit.currency)}. Add any damage charges first.`);

    const now = Date.now();
    const note = args.note?.trim() || undefined;
    const movements = [...deposit.movements];
    let applied: Array<{ chargeId: Id<"stayCharges">; amount: number }> = [];
    if (apply > 0) {
      applied = await applyDepositToCharges(ctx, lease, apply);
      for (const a of applied) {
        movements.push({ kind: "applied", amount: a.amount, date: args.date, note, chargeId: a.chargeId, byUserId: access.user._id, at: now });
      }
    }
    if (refund > 0) {
      movements.push({ kind: "refunded", amount: refund, date: args.date, note, byUserId: access.user._id, at: now });
    }
    const amountApplied = round2(deposit.amountApplied + apply);
    const amountRefunded = round2(deposit.amountRefunded + refund);
    const left = round2(deposit.amountReceived - amountApplied - amountRefunded);
    await ctx.db.patch(deposit._id, {
      amountApplied,
      amountRefunded,
      movements,
      status: left <= 0 ? "settled" : "held",
      updatedAt: now,
    });
    await postDepositSettlement(ctx, access, deposit, { date: args.date, apply, refund, landlordContactId: lease.landlordContactId, applied });
    await stayAudit(ctx, access, {
      action: "stay.deposit_settle",
      description: `Deposit: applied ${formatAmount(apply, deposit.currency)}, refunded ${formatAmount(refund, deposit.currency)}`,
      targetType: "stayDeposit",
      targetId: deposit._id,
      metadata: { leaseId: lease._id, apply, refund, date: args.date, note },
    });
  },
});

/** Where the deposit is held (trust, business account or paid to the landlord). */
export const setHeldIn = mutation({
  args: { leaseId: v.id("stayLeases"), heldIn: depositHeldInValidator },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.leaseId);
    const deposit = await depositForLease(ctx, lease._id);
    if (!deposit) throw new ConvexError("No deposit is recorded on this lease");
    if (deposit.heldIn === args.heldIn) return;
    await postDepositMove(ctx, access, deposit, args.heldIn, access.isDirector);
    await ctx.db.patch(deposit._id, { heldIn: args.heldIn, updatedAt: Date.now() });
    await stayAudit(ctx, access, {
      action: "stay.deposit_held_in",
      description: `Deposit now held in ${args.heldIn} (was ${deposit.heldIn})`,
      targetType: "stayDeposit",
      targetId: deposit._id,
      metadata: { from: deposit.heldIn, to: args.heldIn },
    });
  },
});

/** ST-42: deposits held, with totals by property and landlord. */
export const list = query({
  args: { status: v.optional(v.union(v.literal("held"), v.literal("pending"), v.literal("settled"), v.literal("all"))) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const status = args.status ?? "held";
    const deposits = await ctx.db
      .query("stayDeposits")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    const leaseDocs = await Promise.all(deposits.map((d) => ctx.db.get(d.leaseId)));
    const pairs = deposits
      .map((d, i) => ({ d, l: leaseDocs[i] }))
      .filter((x): x is { d: Doc<"stayDeposits">; l: Doc<"stayLeases"> } => !!x.l && canSeeLease(access, x.l))
      .filter(({ d }) => status === "all" || d.status === status);
    const label = await leaseLabels(ctx, pairs.map((p) => p.l));
    const today = await todayForOrg(ctx, access.orgId);

    const rows = pairs.map(({ d, l }) => {
      const lab = label(l);
      return {
        _id: d._id,
        leaseId: l._id,
        leaseStatus: l.status,
        tenantName: lab.tenantName,
        propertyName: lab.propertyName,
        unitLabel: lab.unitLabel,
        landlordName: lab.landlordName,
        landlordContactId: l.landlordContactId,
        stayPropertyId: l.stayPropertyId,
        currency: d.currency,
        expected: d.amountExpected,
        received: d.amountReceived,
        applied: d.amountApplied,
        refunded: d.amountRefunded,
        held: heldOf(d),
        heldIn: d.heldIn,
        status: d.status,
      };
    });
    const total: CurrencyTotals = {};
    const byProperty = new Map<string, { name: string; landlordName: string; totals: CurrencyTotals; count: number }>();
    const byLandlord = new Map<string, { name: string; totals: CurrencyTotals; count: number }>();
    const byHeldIn: Record<string, CurrencyTotals> = {};
    for (const r of rows) {
      if (r.held <= 0) continue;
      addTo(total, r.currency, r.held);
      const p = byProperty.get(r.stayPropertyId) ?? { name: r.propertyName, landlordName: r.landlordName, totals: {}, count: 0 };
      addTo(p.totals, r.currency, r.held);
      p.count++;
      byProperty.set(r.stayPropertyId, p);
      const ll = byLandlord.get(r.landlordContactId) ?? { name: r.landlordName, totals: {}, count: 0 };
      addTo(ll.totals, r.currency, r.held);
      ll.count++;
      byLandlord.set(r.landlordContactId, ll);
      byHeldIn[r.heldIn] = byHeldIn[r.heldIn] ?? {};
      addTo(byHeldIn[r.heldIn], r.currency, r.held);
    }
    return {
      rows: rows.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitLabel.localeCompare(b.unitLabel)),
      total,
      byProperty: [...byProperty.values()].sort((a, b) => a.name.localeCompare(b.name)),
      byLandlord: [...byLandlord.values()].sort((a, b) => a.name.localeCompare(b.name)),
      byHeldIn,
      today,
    };
  },
});
