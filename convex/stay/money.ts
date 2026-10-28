/**
 * Writes that move money on a lease: raising charges (which use up lease
 * credit), allocating payments, reversing them and applying a deposit. The
 * rules themselves are the pure functions in ledger.ts.
 *
 * Invariant kept by every write here: a charge's amountPaid is the sum of
 * payment allocations plus creditApplied plus depositApplied, and the lease's
 * creditBalance is what overpayments added less what charges used.
 */
import { ConvexError } from "convex/values";
import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { allocateOldestFirst, chargeStatus, outstanding, round2, unwindCredit } from "./ledger";
import { chargesForLeases, leaseChain } from "./shared";

type ChargeKind = Doc<"stayCharges">["kind"];

/** Raise a charge on a lease, settling what it can from lease credit. */
export async function insertCharge(
  ctx: MutationCtx,
  lease: Doc<"stayLeases">,
  c: {
    kind: ChargeKind;
    description: string;
    amount: number;
    dueDate: string;
    period?: string;
    createdByUserId?: Id<"users">;
  }
): Promise<Id<"stayCharges">> {
  const amount = round2(c.amount);
  if (!(amount > 0)) throw new ConvexError("Charge amount must be more than zero");
  const now = Date.now();
  const credit = round2(lease.creditBalance ?? 0);
  const fromCredit = round2(Math.min(credit, amount));
  const id = await ctx.db.insert("stayCharges", {
    orgId: lease.orgId,
    leaseId: lease._id,
    tenantContactId: lease.tenantContactId,
    stayPropertyId: lease.stayPropertyId,
    kind: c.kind,
    description: c.description,
    amount,
    currency: lease.currency,
    period: c.period,
    dueDate: c.dueDate,
    amountPaid: fromCredit,
    creditApplied: fromCredit > 0 ? fromCredit : undefined,
    status: chargeStatus({ amount, amountPaid: fromCredit }),
    createdByUserId: c.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  if (fromCredit > 0) {
    await ctx.db.patch(lease._id, { creditBalance: round2(credit - fromCredit), updatedAt: now });
  }
  return id;
}

/**
 * Allocate a rent payment across the open charges of the lease and the
 * leases it renewed, oldest first. Returns the allocations and the credit
 * added to the lease. Does not insert the payment.
 */
export async function allocateToLease(
  ctx: MutationCtx,
  lease: Doc<"stayLeases">,
  amount: number
): Promise<{ allocations: Array<{ chargeId: Id<"stayCharges">; amount: number }>; creditAdded: number }> {
  const chain = await leaseChain(ctx, lease);
  const charges = (await chargesForLeases(ctx, chain.map((l) => l._id))).filter((c) => c.status !== "cancelled");
  const plan = allocateOldestFirst(
    charges.map((c) => ({ id: c._id, dueDate: c.dueDate, createdAt: c.createdAt, amount: c.amount, amountPaid: c.amountPaid })),
    amount
  );
  const now = Date.now();
  for (const a of plan.allocations) {
    const c = charges.find((x) => x._id === a.chargeId)!;
    const amountPaid = round2(c.amountPaid + a.amount);
    await ctx.db.patch(c._id, { amountPaid, status: chargeStatus({ amount: c.amount, amountPaid }), updatedAt: now });
  }
  if (plan.credit > 0) {
    await ctx.db.patch(lease._id, { creditBalance: round2((lease.creditBalance ?? 0) + plan.credit), updatedAt: now });
  }
  return { allocations: plan.allocations, creditAdded: plan.credit };
}

/**
 * Undo a rent payment's allocations and the credit it created. Credit that
 * a later charge already used is taken back from that charge.
 */
export async function unwindPayment(ctx: MutationCtx, payment: Doc<"stayPayments">) {
  const now = Date.now();
  for (const a of payment.allocations) {
    const c = await ctx.db.get(a.chargeId);
    if (!c) continue;
    const amountPaid = Math.max(0, round2(c.amountPaid - a.amount));
    await ctx.db.patch(c._id, {
      amountPaid,
      status: c.status === "cancelled" ? "cancelled" : chargeStatus({ amount: c.amount, amountPaid }),
      updatedAt: now,
    });
  }
  if (payment.creditAdded > 0) {
    let lease = await ctx.db.get(payment.leaseId);
    if (!lease) return;
    // Renewal moves credit forward, so work on the current lease of the chain.
    for (let i = 0; i < 50 && lease.renewedToLeaseId; i++) {
      const next: Doc<"stayLeases"> | null = await ctx.db.get(lease.renewedToLeaseId);
      if (!next) break;
      lease = next;
    }
    const chain = await leaseChain(ctx, lease);
    const charges = (await chargesForLeases(ctx, chain.map((l) => l._id))).filter(
      (c) => c.status !== "cancelled" && (c.creditApplied ?? 0) > 0
    );
    const plan = unwindCredit(
      lease.creditBalance ?? 0,
      payment.creditAdded,
      charges.map((c) => ({ id: c._id, dueDate: c.dueDate, createdAt: c.createdAt, creditApplied: c.creditApplied ?? 0 }))
    );
    for (const u of plan.unwind) {
      const c = charges.find((x) => x._id === u.chargeId)!;
      const amountPaid = Math.max(0, round2(c.amountPaid - u.amount));
      await ctx.db.patch(c._id, {
        amountPaid,
        creditApplied: round2((c.creditApplied ?? 0) - u.amount) || undefined,
        status: chargeStatus({ amount: c.amount, amountPaid }),
        updatedAt: now,
      });
    }
    await ctx.db.patch(lease._id, { creditBalance: plan.newCreditBalance, updatedAt: now });
  }
}

/**
 * Apply up to `amount` of a deposit to the open charges of a lease chain,
 * oldest first. Returns what was applied per charge (never more than owed).
 */
export async function applyDepositToCharges(
  ctx: MutationCtx,
  lease: Doc<"stayLeases">,
  amount: number
): Promise<Array<{ chargeId: Id<"stayCharges">; amount: number }>> {
  const chain = await leaseChain(ctx, lease);
  const charges = (await chargesForLeases(ctx, chain.map((l) => l._id))).filter((c) => c.status !== "cancelled");
  const plan = allocateOldestFirst(
    charges.map((c) => ({ id: c._id, dueDate: c.dueDate, createdAt: c.createdAt, amount: c.amount, amountPaid: c.amountPaid })),
    amount
  );
  const now = Date.now();
  for (const a of plan.allocations) {
    const c = charges.find((x) => x._id === a.chargeId)!;
    const amountPaid = round2(c.amountPaid + a.amount);
    await ctx.db.patch(c._id, {
      amountPaid,
      depositApplied: round2((c.depositApplied ?? 0) + a.amount),
      status: chargeStatus({ amount: c.amount, amountPaid }),
      updatedAt: now,
    });
  }
  return plan.allocations;
}

/** Total still owed on a lease chain (all open charges, due or not). */
export async function owedOnChain(ctx: MutationCtx, lease: Doc<"stayLeases">): Promise<number> {
  const chain = await leaseChain(ctx, lease);
  const charges = await chargesForLeases(ctx, chain.map((l) => l._id));
  return round2(charges.filter((c) => c.status !== "cancelled").reduce((s, c) => s + outstanding(c), 0));
}
