/**
 * Money that reaches SyncFinance from elsewhere, and the fee rules on it.
 *
 *  - SyncStay calls postStayPayment, reverseStayPayment and
 *    postDepositSettlement from its own mutations when the agency has Sync
 *    Finance on (FN-10). Stay has already checked the amounts against its own
 *    records, so these never block on a ledger balance.
 *  - moveFee moves a receipt's commission from the client ledger to agency
 *    income (FN-31): straight away, or later in the month-end batch.
 *  - bringInStayPayments posts Stay receipts recorded before Finance went
 *    live, so an agency can migrate without retyping.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { isValidDate, isValidPeriod, periodRange } from "../stay/ledger";
import {
  NewLine,
  categoryByKey,
  ensureAccount,
  getAccount,
  ledgerBalance,
  financeAudit,
  financeOn,
  getSettings,
  postTransaction,
  receivingAccount,
  requireDirector,
  requireFinance,
  requireFinanceStaff,
  reverseTransaction,
  todayForOrg,
} from "./core";
import { feeOn, round2 } from "./lib";

type Actor = { user: Doc<"users">; orgId: Id<"organizations"> };

/** FN-30: the lease's own rate when set, else the property's. */
export function feePctFor(lease: Pick<Doc<"stayLeases">, "managementFeePct">, sp: Pick<Doc<"stayProperties">, "managementFeePct">): number {
  return lease.managementFeePct ?? sp.managementFeePct;
}

// ── Fees ─────────────────────────────────────────────────────────────

/** Move a receipt's commission to agency income. A no-op when already moved. */
export async function moveFee(ctx: MutationCtx, actor: Actor, receiptId: Id<"finTransactions">, date?: string): Promise<Id<"finTransactions"> | null> {
  const tx = await ctx.db.get(receiptId);
  if (!tx || tx.orgId !== actor.orgId || !tx.fee || tx.fee.movedTxId || tx.reversedAt || !(tx.fee.amount > 0)) return null;
  const fee = tx.fee;
  const business = await ensureAccount(ctx, actor.orgId, "business", fee.currency);
  const categoryId = await categoryByKey(ctx, actor.orgId, fee.categoryKey);
  const lines: NewLine[] = [
    { currency: fee.currency, amount: -fee.amount, ledger: fee.ledger, key: fee.key, stayPropertyId: tx.stayPropertyId },
    { currency: fee.currency, amount: fee.amount, ledger: "agency", categoryId },
  ];
  // From a bank account the commission moves to the business account. From
  // the cash float nothing physically moves: the cash stays in the drawer
  // until it is banked, so only who it belongs to changes.
  const source = await ctx.db.get(fee.accountId);
  if (fee.accountId !== business._id && source?.type !== "cash") {
    lines.push({ currency: fee.currency, amount: -fee.amount, accountId: fee.accountId });
    lines.push({ currency: fee.currency, amount: fee.amount, accountId: business._id });
  }
  const feeTxId = await postTransaction(
    ctx,
    actor,
    {
      date: date ?? tx.date,
      kind: "transfer",
      description: `Commission ${fee.pct}% on ${tx.number ?? tx.description}`,
      contactId: tx.contactId,
      leaseId: tx.leaseId,
      stayPropertyId: tx.stayPropertyId,
      standId: tx.standId,
      developmentId: tx.developmentId,
      dealCommissionId: tx.dealCommissionId,
      feeOfTxId: tx._id,
    },
    lines,
    // The receipt that put the money there may predate an opening balance.
    { allowNegative: true }
  );
  await ctx.db.patch(tx._id, { fee: { ...fee, movedTxId: feeTxId } });
  return feeTxId;
}

/** Reverse a receipt and, first, the commission it moved. */
export async function reverseWithFee(ctx: MutationCtx, actor: Actor, txId: Id<"finTransactions">, reason: string) {
  const tx = await ctx.db.get(txId);
  if (!tx || tx.orgId !== actor.orgId) throw new ConvexError("Transaction not found");
  if (tx.fee?.movedTxId) {
    const feeTx = await ctx.db.get(tx.fee.movedTxId);
    if (feeTx && !feeTx.reversedAt) await reverseTransaction(ctx, actor, feeTx._id, reason);
  }
  return reverseTransaction(ctx, actor, txId, reason);
}

/** FN-31 month-end batch: move every commission still in trust for receipts in a month. */
export const moveCommissionBatch = mutation({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!isValidPeriod(args.month)) throw new ConvexError("Pick a month");
    const { from, to } = periodRange(args.month);
    const today = await todayForOrg(ctx, access.orgId);
    const date = to < today ? to : today;
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", from).lte("date", to))
      .collect();
    let moved = 0;
    for (const tx of txs) {
      if (tx.fee && !tx.fee.movedTxId && !tx.reversedAt && tx.fee.amount > 0) {
        if (await moveFee(ctx, access, tx._id, date)) moved++;
      }
    }
    await financeAudit(ctx, access, {
      action: "finance.commission_batch",
      description: `Moved commission on ${moved} receipts for ${args.month}`,
      targetType: "organization",
      targetId: access.orgId,
    });
    return { moved };
  },
});

// ── SyncStay receipts ───────────────────────────────────────────────

/**
 * FN-10: post a Stay payment. Rent lands with the landlord (admin fees with
 * the agency), deposits on the tenant's deposit ledger. Cash goes to the
 * cash float, everything else to trust (or business, for a deposit the
 * agency keeps there). Returns the transaction id, or null when skipped.
 */
export async function postStayPayment(ctx: MutationCtx, actor: Actor, paymentId: Id<"stayPayments">): Promise<Id<"finTransactions"> | null> {
  const org = await ctx.db.get(actor.orgId);
  if (!financeOn(org)) return null;
  const payment = await ctx.db.get(paymentId);
  if (!payment || payment.orgId !== actor.orgId || payment.reversedAt) return null;
  const already = await ctx.db
    .query("finTransactions")
    .withIndex("by_stay_payment", (q) => q.eq("stayPaymentId", paymentId))
    .first();
  if (already) return already._id;

  const lease = await ctx.db.get(payment.leaseId);
  const sp = await ctx.db.get(payment.stayPropertyId);
  if (!lease || !sp) return null;
  const tenant = await ctx.db.get(payment.tenantContactId);
  const currency = payment.currency;
  const header = {
    date: payment.paidOn,
    kind: "receipt" as const,
    number: payment.receiptNumber,
    method: payment.method,
    reference: payment.reference,
    contactId: payment.tenantContactId,
    counterparty: tenant?.name,
    stayPaymentId: payment._id,
    leaseId: lease._id,
    stayPropertyId: sp._id,
  };

  if (payment.purpose === "deposit") {
    const deposit = (
      await ctx.db
        .query("stayDeposits")
        .withIndex("by_org", (q) => q.eq("orgId", actor.orgId))
        .collect()
    ).find((d) => d.movements.some((m) => m.paymentId === payment._id));
    // A deposit paid straight to the landlord is not money we hold.
    if (!deposit || deposit.heldIn === "landlord") return null;
    const account = await receivingAccount(ctx, actor.orgId, payment.method, currency, deposit.heldIn === "trust");
    return postTransaction(
      ctx,
      actor,
      { ...header, description: `Deposit from ${tenant?.name ?? "tenant"}` },
      [
        { currency, amount: payment.amount, accountId: account._id },
        { currency, amount: payment.amount, ledger: "deposit", key: deposit._id, stayPropertyId: sp._id },
      ],
      { allowNegative: true }
    );
  }

  // Split what the payment settled: lease admin fees are agency income.
  let adminFee = 0;
  for (const a of payment.allocations) {
    const c = await ctx.db.get(a.chargeId);
    if (c?.kind === "admin_fee") adminFee = round2(adminFee + a.amount);
  }
  const toLandlord = round2(payment.amount - adminFee);
  const account = await receivingAccount(ctx, actor.orgId, payment.method, currency, true);
  const lines: NewLine[] = [{ currency, amount: payment.amount, accountId: account._id }];
  if (toLandlord > 0) lines.push({ currency, amount: toLandlord, ledger: "landlord", key: lease.landlordContactId, stayPropertyId: sp._id });
  if (adminFee > 0) lines.push({ currency, amount: adminFee, ledger: "agency", categoryId: await categoryByKey(ctx, actor.orgId, "lease_admin_fee") });

  const pct = feePctFor(lease, sp);
  const amount = feeOn(toLandlord, pct);
  const txId = await postTransaction(
    ctx,
    actor,
    {
      ...header,
      description: `Rent from ${tenant?.name ?? "tenant"}`,
      fee:
        amount > 0
          ? { ledger: "landlord", key: lease.landlordContactId, currency, accountId: account._id, base: toLandlord, pct, amount, categoryKey: "management_fee" }
          : undefined,
    },
    lines,
    { allowNegative: true }
  );
  const settings = await getSettings(ctx, actor.orgId);
  if (settings.commissionTiming === "on_receipt") await moveFee(ctx, actor, txId);
  return txId;
}

/** Reverse the Finance side of a reversed Stay payment. */
export async function reverseStayPayment(ctx: MutationCtx, actor: Actor, paymentId: Id<"stayPayments">, reason: string) {
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_stay_payment", (q) => q.eq("stayPaymentId", paymentId))
    .collect();
  const original = txs.find((t) => !t.reversalOfId && !t.reversedAt);
  if (original) await reverseWithFee(ctx, actor, original._id, reason);
}

/**
 * FN-21: a deposit applied to what the tenant owed becomes the landlord's
 * money; a refund leaves the account it was held in.
 */
export async function postDepositSettlement(
  ctx: MutationCtx,
  actor: Actor,
  deposit: Doc<"stayDeposits">,
  args: {
    date: string;
    apply: number;
    refund: number;
    landlordContactId: Id<"contacts">;
    // What the applied amount settled, so lease admin fees go to the agency.
    applied: Array<{ chargeId: Id<"stayCharges">; amount: number }>;
  }
) {
  const org = await ctx.db.get(actor.orgId);
  if (!financeOn(org) || deposit.heldIn === "landlord") return;
  const currency = deposit.currency;
  const held = await ensureAccount(ctx, actor.orgId, deposit.heldIn === "trust" ? "trust" : "business", currency);
  const base = { leaseId: deposit.leaseId, stayPropertyId: deposit.stayPropertyId };
  if (args.apply > 0) {
    // As with a Stay receipt: lease admin fees are agency income, the rest is
    // the landlord's. Applied deposit carries no commission (Stay's rule).
    let adminFee = 0;
    for (const a of args.applied) {
      const c = await ctx.db.get(a.chargeId);
      if (c?.kind === "admin_fee") adminFee = round2(adminFee + a.amount);
    }
    const toLandlord = round2(args.apply - adminFee);
    const lines: NewLine[] = [{ currency, amount: -args.apply, ledger: "deposit", key: deposit._id }];
    if (toLandlord > 0) lines.push({ currency, amount: toLandlord, ledger: "landlord", key: args.landlordContactId, stayPropertyId: deposit.stayPropertyId });
    if (adminFee > 0) lines.push({ currency, amount: adminFee, ledger: "agency", categoryId: await categoryByKey(ctx, actor.orgId, "lease_admin_fee") });
    // Landlord money belongs in trust and agency money in business.
    const other = await ensureAccount(ctx, actor.orgId, held.type === "trust" ? "business" : "trust", currency);
    const moving = held.type === "trust" ? adminFee : toLandlord;
    if (moving > 0) lines.push({ currency, amount: -moving, accountId: held._id }, { currency, amount: moving, accountId: other._id });
    await postTransaction(ctx, actor, { ...base, date: args.date, kind: "transfer", description: "Deposit applied to amounts owed" }, lines, { allowNegative: true });
  }
  if (args.refund > 0) {
    await postTransaction(
      ctx,
      actor,
      { ...base, date: args.date, kind: "payment", description: "Deposit refunded to tenant" },
      [
        { currency, amount: -args.refund, accountId: held._id },
        { currency, amount: -args.refund, ledger: "deposit", key: deposit._id },
      ],
      { allowNegative: true }
    );
  }
}

/**
 * A Stay deposit moved to where else it is held (FN-21): between the trust
 * and business accounts, handed to the landlord (it leaves our books) or
 * taken back from the landlord (it comes onto them).
 */
export async function postDepositMove(
  ctx: MutationCtx,
  actor: Actor,
  deposit: Doc<"stayDeposits">,
  to: Doc<"stayDeposits">["heldIn"],
  isDirector: boolean
) {
  const org = await ctx.db.get(actor.orgId);
  const from = deposit.heldIn;
  if (!financeOn(org) || from === to) return;
  // Moving client money is a director's call, as for any transfer out of trust.
  const stillHeld = round2(deposit.amountReceived - deposit.amountApplied - deposit.amountRefunded);
  if (stillHeld > 0 && !isDirector) throw new ConvexError("A director must move a deposit the agency holds");
  const currency = deposit.currency;
  const today = await todayForOrg(ctx, actor.orgId);
  const base = { date: today, leaseId: deposit.leaseId, stayPropertyId: deposit.stayPropertyId };
  const accountFor = (h: "trust" | "business") => ensureAccount(ctx, actor.orgId, h, currency);
  if (from === "landlord") {
    // The landlord hands the deposit to us: it comes onto our books.
    const held = round2(deposit.amountReceived - deposit.amountApplied - deposit.amountRefunded);
    if (held <= 0) return;
    const acc = await accountFor(to as "trust" | "business");
    await postTransaction(ctx, actor, { ...base, kind: "receipt", description: "Deposit taken over from the landlord" }, [
      { currency, amount: held, accountId: acc._id },
      { currency, amount: held, ledger: "deposit", key: deposit._id, stayPropertyId: deposit.stayPropertyId },
    ], { allowNegative: true });
    return;
  }
  const held = (await ledgerBalance(ctx, actor.orgId, "deposit", deposit._id))[currency] ?? 0;
  if (held <= 0) return;
  const fromAcc = await accountFor(from);
  if (to === "landlord") {
    await postTransaction(ctx, actor, { ...base, kind: "payment", description: "Deposit handed to the landlord" }, [
      { currency, amount: -held, accountId: fromAcc._id },
      { currency, amount: -held, ledger: "deposit", key: deposit._id, stayPropertyId: deposit.stayPropertyId },
    ], { allowNegative: true });
    return;
  }
  const toAcc = await accountFor(to);
  await postTransaction(ctx, actor, { ...base, kind: "transfer", description: `Deposit moved to the ${to} account` }, [
    { currency, amount: -held, accountId: fromAcc._id },
    { currency, amount: held, accountId: toAcc._id },
  ], { allowNegative: true });
}

// ── Stand sales (SyncDev) ───────────────────────────────────────────

/**
 * FN-90: post a payment on a stand sale to the ledger. The account defaults
 * from the development: the developer's own money to the business account,
 * money we hold for a developer to trust, cash to the float either way.
 * Commission per payment is moved per the agency's timing (FN-93).
 */
export async function postStandReceipt(
  ctx: MutationCtx,
  actor: Actor,
  s: Doc<"finStands">,
  dev: Doc<"finDevelopments">,
  args: { date: string; amount: number; method: Doc<"finTransactions">["method"] & string; accountId?: Id<"finAccounts">; reference?: string; number: string },
  // A cancelled sale earns no commission (used when bringing in old payments).
  opts: { noFee?: boolean } = {}
): Promise<{ txId: Id<"finTransactions">; account: Doc<"finAccounts"> }> {
  const inTrust = dev.moneyHeldBy === "agency_trust";
  const account = args.accountId
    ? await getAccount(ctx, actor.orgId, args.accountId)
    : await ensureAccount(ctx, actor.orgId, args.method === "cash" ? "cash" : inTrust ? "trust" : "business", s.currency);
  if (account.currency !== s.currency) throw new ConvexError(`This stand is in ${s.currency}`);
  const lines: NewLine[] = [{ currency: s.currency, amount: args.amount, accountId: account._id }];
  if (inTrust) lines.push({ currency: s.currency, amount: args.amount, ledger: "developer", key: dev._id });
  else lines.push({ currency: s.currency, amount: args.amount, ledger: "agency", categoryId: await categoryByKey(ctx, actor.orgId, "stand_sales") });
  const fee = inTrust && dev.commissionTiming === "each_payment" && !opts.noFee ? feeOn(args.amount, dev.commissionPct) : 0;
  const txId = await postTransaction(
    ctx,
    actor,
    {
      date: args.date,
      kind: "receipt",
      number: args.number,
      description: `Stand ${s.standNumber}, ${dev.name}`,
      method: args.method,
      reference: args.reference?.trim() || undefined,
      contactId: s.buyerContactId,
      counterparty: s.buyerName,
      standId: s._id,
      developmentId: dev._id,
      fee:
        fee > 0
          ? { ledger: "developer", key: dev._id, currency: s.currency, accountId: account._id, base: args.amount, pct: dev.commissionPct, amount: fee, categoryKey: "stand_commission" }
          : undefined,
    },
    lines
  );
  const settings = await getSettings(ctx, actor.orgId);
  if (fee > 0 && settings.commissionTiming === "on_receipt") await moveFee(ctx, actor, txId);
  return { txId, account };
}

/** Commission on the full price once a stand is fully paid (FN-93). */
export async function postFullyPaidCommission(ctx: MutationCtx, actor: Actor, s: Doc<"finStands">, dev: Doc<"finDevelopments">, date: string) {
  const full = feeOn(s.price, dev.commissionPct);
  if (full > 0) {
    const business = await ensureAccount(ctx, actor.orgId, "business", s.currency);
    const trust = await ensureAccount(ctx, actor.orgId, "trust", s.currency);
    await postTransaction(
      ctx,
      actor,
      { date, kind: "transfer", description: `Commission ${dev.commissionPct}% on stand ${s.standNumber} (fully paid)`, standId: s._id, developmentId: dev._id },
      [
        { currency: s.currency, amount: -full, ledger: "developer", key: dev._id },
        { currency: s.currency, amount: full, ledger: "agency", categoryId: await categoryByKey(ctx, actor.orgId, "stand_commission") },
        { currency: s.currency, amount: -full, accountId: trust._id },
        { currency: s.currency, amount: full, accountId: business._id },
      ],
      { allowNegative: true }
    );
  }
}

/** FN-97: pay a buyer back on a cancelled sale, out of the ledger it went into. */
export async function postStandRefund(
  ctx: MutationCtx,
  actor: Actor,
  s: Doc<"finStands">,
  dev: Doc<"finDevelopments">,
  args: { date: string; amount: number; method: Doc<"finTransactions">["method"] & string; accountId?: Id<"finAccounts">; reference?: string; number: string }
) {
  const inTrust = dev.moneyHeldBy === "agency_trust";
  const account = args.accountId
    ? await getAccount(ctx, actor.orgId, args.accountId)
    : await ensureAccount(ctx, actor.orgId, args.method === "cash" ? "cash" : inTrust ? "trust" : "business", s.currency);
  if (account.currency !== s.currency) throw new ConvexError(`This stand is in ${s.currency}`);
  return postTransaction(
    ctx,
    actor,
    {
      date: args.date,
      kind: "payment",
      number: args.number,
      description: `Refund on cancelled stand ${s.standNumber}, ${dev.name}`,
      method: args.method,
      reference: args.reference?.trim() || undefined,
      contactId: s.buyerContactId,
      counterparty: s.buyerName,
      standId: s._id,
      developmentId: dev._id,
    },
    [
      { currency: s.currency, amount: -args.amount, accountId: account._id },
      inTrust
        ? { currency: s.currency, amount: -args.amount, ledger: "developer", key: dev._id }
        : { currency: s.currency, amount: -args.amount, ledger: "agency", categoryId: await categoryByKey(ctx, actor.orgId, "stand_sales") },
    ]
  );
}

/**
 * Post SyncDev payments recorded before the agency had SyncFinance, with
 * their original receipt numbers. Safe to run again; 150 per call.
 */
export const bringInDevPayments = mutation({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const pays = await ctx.db
      .query("devPayments")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    let posted = 0;
    let remaining = 0;
    const errors: string[] = [];
    for (const p of pays.sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (p.finTxId || p.reversedAt) continue;
      if (posted + errors.length >= 150) {
        remaining++;
        continue;
      }
      try {
        const s = await ctx.db.get(p.standId);
        const dev = s ? await ctx.db.get(s.developmentId) : null;
        if (!s || !dev) throw new ConvexError("Sale not found");
        const args = { date: p.date, amount: p.amount, method: p.method, reference: p.reference, number: p.number };
        const txId =
          p.kind === "receipt"
            ? (await postStandReceipt(ctx, access, s, dev, args, { noFee: s.status === "cancelled" })).txId
            : await postStandRefund(ctx, access, s, dev, args);
        await ctx.db.patch(p._id, { finTxId: txId });
        posted++;
      } catch (e) {
        errors.push(`${p.number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await financeAudit(ctx, access, {
      action: "finance.dev_catch_up",
      description: `Brought in ${posted} SyncDev payments`,
      targetType: "organization",
      targetId: access.orgId,
      metadata: { posted, errors: errors.length },
    });
    return { posted, errors, remaining };
  },
});

// ── Migration from SyncStay ─────────────────────────────────────────

/**
 * Post Stay receipts from `from` onwards that Finance has not seen, oldest
 * first, up to 150 per call. Safe to run again; call until `remaining` is 0.
 */
export const bringInStayPayments = mutation({
  args: { from: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    if (!isValidDate(args.from)) throw new ConvexError("Enter a valid date");
    const payments = await ctx.db
      .query("stayPayments")
      .withIndex("by_org_paid", (q) => q.eq("orgId", access.orgId).gte("paidOn", args.from))
      .collect();
    let posted = 0;
    let skipped = 0;
    const errors: string[] = [];
    let pending = 0;
    for (const p of payments) {
      if (p.reversedAt) continue;
      const seen = await ctx.db
        .query("finTransactions")
        .withIndex("by_stay_payment", (q) => q.eq("stayPaymentId", p._id))
        .first();
      if (seen) continue;
      // Skipped receipts (deposits paid to the landlord) are cheap and never
      // post, so only real work counts towards the batch.
      if (posted + errors.length >= 150) {
        pending++;
        continue;
      }
      try {
        if (await postStayPayment(ctx, access, p._id)) posted++;
        else skipped++;
      } catch (e) {
        errors.push(`${p.receiptNumber}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await financeAudit(ctx, access, {
      action: "finance.stay_catch_up",
      description: `Brought in ${posted} SyncStay receipts from ${args.from}`,
      targetType: "organization",
      targetId: access.orgId,
      metadata: { posted, skipped, errors: errors.length },
    });
    return { posted, skipped, errors, remaining: pending };
  },
});

/**
 * FN-30: a landlord's default commission rate. Sets it on every Stay property
 * of theirs; a single property can then be changed in SyncStay and a lease
 * can have its own rate, both of which win at receipt time.
 */
export const setLandlordRate = mutation({
  args: { landlordId: v.id("contacts"), pct: v.number() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const c = await ctx.db.get(args.landlordId);
    if (!c || c.orgId !== access.orgId) throw new ConvexError("Landlord not found");
    if (!(args.pct >= 0 && args.pct <= 100)) throw new ConvexError("Rate must be between 0 and 100");
    const now = Date.now();
    await ctx.db.patch(c._id, { landlordFeePct: args.pct, updatedAt: now });
    const sps = await ctx.db
      .query("stayProperties")
      .withIndex("by_landlord", (q) => q.eq("landlordContactId", c._id))
      .collect();
    for (const sp of sps) if (sp.orgId === access.orgId) await ctx.db.patch(sp._id, { managementFeePct: args.pct, updatedAt: now });
    await financeAudit(ctx, access, {
      action: "finance.landlord_rate",
      description: `${c.name}: commission ${args.pct}% on ${sps.length} properties`,
      targetType: "contact",
      targetId: c._id,
    });
    return { properties: sps.length };
  },
});

/** The rates that apply to a landlord: their default, each property and any lease of its own. */
export const landlordRates = query({
  args: { landlordId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    const c = await ctx.db.get(args.landlordId);
    if (!c || c.orgId !== access.orgId) return null;
    const sps = (
      await ctx.db
        .query("stayProperties")
        .withIndex("by_landlord", (q) => q.eq("landlordContactId", c._id))
        .collect()
    ).filter((sp) => sp.orgId === access.orgId);
    const properties = [];
    for (const sp of sps) {
      const p = await ctx.db.get(sp.propertyId);
      const leases = (
        await ctx.db
          .query("stayLeases")
          .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
          .collect()
      ).filter((l) => l.status === "active" && l.managementFeePct !== undefined);
      properties.push({ _id: sp._id, name: p?.title ?? "Property", pct: sp.managementFeePct, leaseOverrides: leases.length });
    }
    return { landlordPct: c.landlordFeePct ?? null, canEdit: access.isStaff, properties };
  },
});

/** FN-30: set or clear a lease's own management fee rate. */
export const setLeaseRate = mutation({
  args: { leaseId: v.id("stayLeases"), pct: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const lease = await ctx.db.get(args.leaseId);
    if (!lease || lease.orgId !== access.orgId) throw new ConvexError("Lease not found");
    if (args.pct !== undefined && !(args.pct >= 0 && args.pct <= 100)) throw new ConvexError("Rate must be between 0 and 100");
    await ctx.db.patch(lease._id, { managementFeePct: args.pct, updatedAt: Date.now() });
    await financeAudit(ctx, access, {
      action: "finance.lease_rate",
      description: args.pct === undefined ? "Lease now uses the property's commission rate" : `Lease commission rate set to ${args.pct}%`,
      targetType: "stayLease",
      targetId: lease._id,
    });
  },
});
