/**
 * Payments and receipts (BRD Stay ST-22 to ST-25, ST-40).
 *
 * A payment is recorded against a lease, gets the agency's next receipt
 * number in the same transaction, and is never deleted: a mistake is
 * reversed with a reason, which undoes its allocations and credit.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleLease, requireStay, requireStayAdmin, StayAccess } from "./access";
import { formatAmount, isValidDate, round2, dateLabel, periodLabel } from "./ledger";
import {
  agencyOf,
  allocateReceiptNumber,
  canSeeLease,
  chainAccount,
  depositForLease,
  leaseChain,
  leaseLabels,
  stayAudit,
  todayForOrg,
  userLabel,
} from "./shared";
import { allocateToLease, unwindPayment } from "./money";
import { queueEmail, receiptEmail } from "./emails";
import { METHOD_LABELS, depositHeldInValidator, paymentMethodValidator } from "./validators";
import { postStayPayment, reverseStayPayment } from "../finance/posting";

const currencyValidator = v.union(v.literal("USD"), v.literal("ZiG"));

/** The current lease of a renewal chain. Payments always land on it. */
async function headOf(ctx: MutationCtx, lease: Doc<"stayLeases">): Promise<Doc<"stayLeases">> {
  let head = lease;
  for (let i = 0; i < 50 && head.renewedToLeaseId; i++) {
    const next = await ctx.db.get(head.renewedToLeaseId);
    if (!next) break;
    head = next;
  }
  return head;
}

export const record = mutation({
  args: {
    leaseId: v.id("stayLeases"),
    purpose: v.optional(v.union(v.literal("rent"), v.literal("deposit"))),
    paidOn: v.string(),
    amount: v.number(),
    currency: currencyValidator,
    method: paymentMethodValidator,
    reference: v.optional(v.string()),
    depositHeldIn: v.optional(depositHeldInValidator),
    emailReceipt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!access.canRecordPayments) throw new ConvexError("Your role cannot record payments");
    const lease = await headOf(ctx, await getVisibleLease(ctx, access, args.leaseId));
    return recordPayment(ctx, access, lease, args);
  },
});

/** Shared by record and the Excel import (deposit already received). */
export async function recordPayment(
  ctx: MutationCtx,
  access: StayAccess,
  lease: Doc<"stayLeases">,
  args: {
    purpose?: "rent" | "deposit";
    paidOn: string;
    amount: number;
    currency: "USD" | "ZiG";
    method: Doc<"stayPayments">["method"];
    reference?: string;
    depositHeldIn?: "trust" | "business" | "landlord";
    emailReceipt?: boolean;
  }
): Promise<{ paymentId: Id<"stayPayments">; receiptNumber: string }> {
  const purpose = args.purpose ?? "rent";
  const amount = round2(args.amount);
  if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
  if (!isValidDate(args.paidOn)) throw new ConvexError("Enter a valid payment date");
  if (args.currency !== lease.currency) {
    throw new ConvexError(`This lease is in ${lease.currency}. Record the payment in ${lease.currency}; amounts are never converted.`);
  }
  const today = await todayForOrg(ctx, access.orgId);
  if (args.paidOn > today) throw new ConvexError("The payment date cannot be in the future");

  const now = Date.now();
  const receiptNumber = await allocateReceiptNumber(ctx, access.orgId);
  let allocations: Array<{ chargeId: Id<"stayCharges">; amount: number }> = [];
  let creditAdded = 0;
  let deposit: Doc<"stayDeposits"> | null = null;

  if (purpose === "rent") {
    ({ allocations, creditAdded } = await allocateToLease(ctx, lease, amount));
  } else {
    deposit = await depositForLease(ctx, lease._id);
    if (deposit?.status === "settled") throw new ConvexError("This lease's deposit has been settled");
  }

  const paymentId = await ctx.db.insert("stayPayments", {
    orgId: access.orgId,
    leaseId: lease._id,
    tenantContactId: lease.tenantContactId,
    stayPropertyId: lease.stayPropertyId,
    purpose,
    receiptNumber,
    paidOn: args.paidOn,
    amount,
    currency: lease.currency,
    method: args.method,
    reference: args.reference?.trim() || undefined,
    allocations,
    creditAdded,
    recordedByUserId: access.user._id,
    createdAt: now,
  });

  if (purpose === "deposit") {
    const movement = { kind: "received" as const, amount, date: args.paidOn, paymentId, byUserId: access.user._id, at: now };
    if (deposit) {
      await ctx.db.patch(deposit._id, {
        amountReceived: round2(deposit.amountReceived + amount),
        heldIn: args.depositHeldIn ?? deposit.heldIn,
        status: "held",
        movements: [...deposit.movements, movement],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("stayDeposits", {
        orgId: access.orgId,
        leaseId: lease._id,
        stayPropertyId: lease.stayPropertyId,
        currency: lease.currency,
        amountExpected: lease.depositAmount || amount,
        amountReceived: amount,
        amountApplied: 0,
        amountRefunded: 0,
        heldIn: args.depositHeldIn ?? "trust",
        status: "held",
        movements: [movement],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // SyncFinance, when switched on, posts the receipt to the trust ledger.
  await postStayPayment(ctx, access, paymentId);

  const label = await leaseLabels(ctx, [lease]);
  const lab = label(lease);
  await stayAudit(ctx, access, {
    action: purpose === "deposit" ? "stay.deposit_received" : "stay.payment_record",
    description: `Receipt ${receiptNumber}: ${formatAmount(amount, lease.currency)} ${purpose === "deposit" ? "deposit " : ""}from ${lab.tenantName} (${METHOD_LABELS[args.method]})`,
    targetType: "stayPayment",
    targetId: paymentId,
    targetLabel: receiptNumber,
    metadata: { leaseId: lease._id, amount, currency: lease.currency, paidOn: args.paidOn, allocations, creditAdded },
  });

  if (args.emailReceipt !== false && lab.tenantEmail) {
    await sendReceipt(ctx, access, paymentId);
    await ctx.db.patch(paymentId, { emailedAt: now });
  }
  return { paymentId, receiptNumber };
}

async function sendReceipt(ctx: MutationCtx, access: StayAccess, paymentId: Id<"stayPayments">) {
  const payment = (await ctx.db.get(paymentId))!;
  const lease = (await ctx.db.get(payment.leaseId))!;
  const org = (await ctx.db.get(access.orgId))!;
  const label = (await leaseLabels(ctx, [lease]))(lease);
  if (!label.tenantEmail) throw new ConvexError("The tenant has no email address");
  const today = await todayForOrg(ctx, access.orgId);
  const acc = await chainAccount(ctx, await leaseChain(ctx, lease), today);
  return queueEmail(
    ctx,
    access.orgId,
    receiptEmail({
      agency: agencyOf(org),
      to: label.tenantEmail,
      tenantName: label.tenantName,
      receiptNumber: payment.receiptNumber,
      paidOn: dateLabel(payment.paidOn),
      amount: formatAmount(payment.amount, payment.currency),
      method: METHOD_LABELS[payment.method],
      reference: payment.reference,
      property: `${label.propertyName}, ${label.unitLabel}`,
      purpose: payment.purpose,
      balance: formatAmount(acc.balance, payment.currency),
      paymentId: payment._id,
    }),
    access.user._id
  );
}

/** Email a receipt again (e.g. the tenant lost it). */
export const emailReceipt = mutation({
  args: { paymentId: v.id("stayPayments") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.orgId !== access.orgId) throw new ConvexError("Payment not found");
    await getVisibleLease(ctx, access, payment.leaseId);
    if (payment.reversedAt) throw new ConvexError("This payment was reversed");
    await sendReceipt(ctx, access, payment._id);
    await ctx.db.patch(payment._id, { emailedAt: Date.now() });
  },
});

/** ST-25: reverse a payment with a reason. Directors only. */
export const reverse = mutation({
  args: { paymentId: v.id("stayPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireStayAdmin(access);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.orgId !== access.orgId) throw new ConvexError("Payment not found");
    if (payment.reversedAt) throw new ConvexError("This payment is already reversed");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason for the reversal");
    const now = Date.now();

    if (payment.purpose === "rent") {
      await unwindPayment(ctx, payment);
    } else {
      const deposit = await ctx.db
        .query("stayDeposits")
        .withIndex("by_lease", (q) => q.eq("leaseId", payment.leaseId))
        .first();
      // The deposit may have moved to a renewal; find it through the movement.
      const dep =
        deposit && deposit.movements.some((m) => m.paymentId === payment._id)
          ? deposit
          : (await ctx.db.query("stayDeposits").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).find((d) =>
              d.movements.some((m) => m.paymentId === payment._id)
            );
      if (dep) {
        const held = round2(dep.amountReceived - dep.amountApplied - dep.amountRefunded);
        if (held < payment.amount) throw new ConvexError("Part of this deposit has already been applied or refunded");
        const received = round2(dep.amountReceived - payment.amount);
        await ctx.db.patch(dep._id, {
          amountReceived: received,
          status: received > 0 ? "held" : "pending",
          movements: [
            ...dep.movements,
            { kind: "received", amount: -payment.amount, date: payment.paidOn, note: `Reversed ${payment.receiptNumber}: ${reason}`, paymentId: payment._id, byUserId: access.user._id, at: now },
          ],
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(payment._id, { reversedAt: now, reversedByUserId: access.user._id, reverseReason: reason });
    await reverseStayPayment(ctx, access, payment._id, reason);
    await stayAudit(ctx, access, {
      action: "stay.payment_reverse",
      description: `Reversed receipt ${payment.receiptNumber} (${formatAmount(payment.amount, payment.currency)}): ${reason}`,
      targetType: "stayPayment",
      targetId: payment._id,
      targetLabel: payment.receiptNumber,
      metadata: { leaseId: payment.leaseId, reason, allocations: payment.allocations, creditAdded: payment.creditAdded },
    });
  },
});

/** Payments received in a date range (by payment date), newest first. */
export const list = query({
  args: {
    from: v.string(),
    to: v.string(),
    q: v.optional(v.string()),
    includeReversed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!isValidDate(args.from) || !isValidDate(args.to)) throw new ConvexError("Enter a valid date range");
    const rows = await ctx.db
      .query("stayPayments")
      .withIndex("by_org_paid", (q) => q.eq("orgId", access.orgId).gte("paidOn", args.from).lte("paidOn", args.to))
      .collect();
    const leaseDocs = await Promise.all([...new Set(rows.map((p) => p.leaseId))].map((id) => ctx.db.get(id)));
    const leases = leaseDocs.filter((l): l is Doc<"stayLeases"> => !!l && canSeeLease(access, l));
    const leaseMap = new Map(leases.map((l) => [l._id as string, l]));
    const label = await leaseLabels(ctx, leases);
    const recorders = new Map<string, string>();
    for (const id of new Set(rows.map((p) => p.recordedByUserId))) recorders.set(id, userLabel(await ctx.db.get(id)));
    const q = args.q?.trim().toLowerCase();
    return rows
      .filter((p) => leaseMap.has(p.leaseId) && (args.includeReversed !== false || !p.reversedAt))
      .map((p) => {
        const lab = label(leaseMap.get(p.leaseId)!);
        return {
          _id: p._id,
          leaseId: p.leaseId,
          tenantContactId: p.tenantContactId,
          receiptNumber: p.receiptNumber,
          paidOn: p.paidOn,
          amount: p.amount,
          currency: p.currency,
          method: p.method,
          reference: p.reference ?? "",
          purpose: p.purpose,
          reversed: !!p.reversedAt,
          reverseReason: p.reverseReason ?? null,
          tenantName: lab.tenantName,
          propertyName: lab.propertyName,
          unitLabel: lab.unitLabel,
          landlordName: lab.landlordName,
          recordedBy: recorders.get(p.recordedByUserId) ?? "",
          createdAt: p.createdAt,
        };
      })
      .filter((r) => !q || [r.receiptNumber, r.tenantName, r.propertyName, r.reference].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.paidOn !== b.paidOn ? (a.paidOn < b.paidOn ? 1 : -1) : b.createdAt - a.createdAt));
  },
});

/**
 * Everything printed on a receipt. Also the shape the tenant portal needs to
 * reprint one (it must check the tenant owns the lease before calling).
 */
export const getReceipt = query({
  args: { paymentId: v.id("stayPayments") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.orgId !== access.orgId) return null;
    const lease = await ctx.db.get(payment.leaseId);
    if (!lease || !canSeeLease(access, lease)) return null;
    const org = (await ctx.db.get(access.orgId))!;
    return await receiptData(ctx, payment, lease, org);
  },
});

/**
 * Everything a receipt shows. Shared by the staff screens and the tenant
 * portal, which check access to the payment before calling it.
 */
export async function receiptData(
  ctx: QueryCtx | MutationCtx,
  payment: Doc<"stayPayments">,
  lease: Doc<"stayLeases">,
  org: Doc<"organizations">
) {
  const label = (await leaseLabels(ctx, [lease]))(lease);
  const today = await todayForOrg(ctx, org._id);
  const acc = await chainAccount(ctx, await leaseChain(ctx, lease), today);
  const charges = await Promise.all(payment.allocations.map((a) => ctx.db.get(a.chargeId)));
  const recorder = await ctx.db.get(payment.recordedByUserId);
  return {
    agency: { ...agencyOf(org), vatNumber: org.vatNumber ?? "" },
    receiptNumber: payment.receiptNumber,
    paidOn: payment.paidOn,
    amount: payment.amount,
    currency: payment.currency,
    method: METHOD_LABELS[payment.method],
    reference: payment.reference ?? "",
    purpose: payment.purpose,
    tenantName: label.tenantName,
    propertyName: label.propertyName,
    propertyAddress: label.propertyAddress,
    unitLabel: label.unitLabel,
    allocations: payment.allocations.map((a, i) => ({
      description: charges[i]?.description ?? (charges[i]?.period ? `Rent ${periodLabel(charges[i]!.period!)}` : "Charge"),
      amount: a.amount,
    })),
    creditAdded: payment.creditAdded,
    balanceNow: acc.balance,
    recordedBy: userLabel(recorder),
    reversed: !!payment.reversedAt,
    reverseReason: payment.reverseReason ?? null,
    tenantEmail: label.tenantEmail,
    emailedAt: payment.emailedAt ?? null,
    leaseId: lease._id,
  };
}

/** Recent payments for the dashboard. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const rows = await ctx.db
      .query("stayPayments")
      .withIndex("by_org_paid", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(60);
    const leases = (await Promise.all([...new Set(rows.map((p) => p.leaseId))].map((id) => ctx.db.get(id)))).filter(
      (l): l is Doc<"stayLeases"> => !!l && canSeeLease(access, l)
    );
    const leaseMap = new Map(leases.map((l) => [l._id as string, l]));
    const label = await leaseLabels(ctx, leases);
    return rows
      .filter((p) => leaseMap.has(p.leaseId))
      .slice(0, 8)
      .map((p) => {
        const lab = label(leaseMap.get(p.leaseId)!);
        return {
          _id: p._id,
          receiptNumber: p.receiptNumber,
          paidOn: p.paidOn,
          amount: p.amount,
          currency: p.currency,
          tenantName: lab.tenantName,
          unit: `${lab.propertyName}, ${lab.unitLabel}`,
          reversed: !!p.reversedAt,
        };
      });
  },
});
