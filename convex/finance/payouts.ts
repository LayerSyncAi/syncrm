/**
 * Payouts from client money: landlords (FN-41, FN-42), sellers after a sale
 * (FN-44) and developers (FN-93), each with a remittance advice (FN-43).
 *
 * Approval is a setting (BRD §4). With one approver the director prepares
 * and pays in one step. With two, anyone in finance prepares and a director
 * other than the preparer approves. Paying posts the money out of trust.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { agencyOf, nameMaps } from "../stay/shared";
import { dateLabel, formatAmount } from "../stay/ledger";
import { METHOD_LABELS } from "../stay/validators";
import {
  FinanceAccess,
  ensureAccount,
  financeAudit,
  getAccount,
  getSettings,
  ledgerBalance,
  ledgerBalances,
  nextNumber,
  postTransaction,
  requireDirector,
  requireFinance,
  requireFinanceStaff,
  reverseTransaction,
  userLabel,
  visibleLandlordIds,
} from "./core";
import { round2 } from "./lib";
import { finCurrency, finMethod } from "../schemas/finance";
import { documentEmail, queueDocumentEmail } from "./emails";
import { remittanceDocument } from "./documents";

type PayoutLedger = Doc<"finPayouts">["ledger"];
const payoutLedger = v.union(v.literal("landlord"), v.literal("sale"), v.literal("developer"));

/** Who a ledger key is, for display and email. */
async function payee(ctx: QueryCtx | MutationCtx, orgId: Id<"organizations">, ledger: PayoutLedger, key: string) {
  if (ledger === "landlord") {
    const c = await ctx.db.get(key as Id<"contacts">);
    if (!c || c.orgId !== orgId) throw new ConvexError("Landlord not found");
    return { name: c.name, email: c.email ?? undefined };
  }
  if (ledger === "developer") {
    const d = await ctx.db.get(key as Id<"finDevelopments">);
    if (!d || d.orgId !== orgId) throw new ConvexError("Development not found");
    return { name: `${d.developerName} (${d.name})`, email: d.developerEmail };
  }
  const lead = await ctx.db.get(key as Id<"leads">);
  if (!lead || lead.orgId !== orgId) throw new ConvexError("Deal not found");
  return { name: `Sale: ${lead.fullName}`, email: undefined };
}

/**
 * The ledger movements since the last paid payout to this payee in this
 * currency: what the remittance advice itemises.
 */
async function remittanceLines(ctx: MutationCtx, orgId: Id<"organizations">, ledger: PayoutLedger, key: string, currency: "USD" | "ZiG") {
  const payouts = await ctx.db
    .query("finPayouts")
    .withIndex("by_org_ledger_key", (q) => q.eq("orgId", orgId).eq("ledger", ledger).eq("key", key))
    .collect();
  const lastPaidAt = Math.max(0, ...payouts.filter((p) => p.status === "paid" && p.currency === currency).map((p) => p.paidAt ?? 0));
  const lines = await ctx.db
    .query("finLines")
    .withIndex("by_org_ledger_key", (q) => q.eq("orgId", orgId).eq("ledger", ledger).eq("key", key))
    .collect();
  const out = [];
  for (const l of lines) {
    if (l.currency !== currency) continue;
    const t = await ctx.db.get(l.txId);
    if (!t || t.createdAt <= lastPaidAt || t.payoutId) continue;
    out.push({ date: l.date, description: t.description, amount: l.amount });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function preparedTotal(ctx: MutationCtx, orgId: Id<"organizations">, ledger: PayoutLedger, key: string, currency: string) {
  const ps = await ctx.db
    .query("finPayouts")
    .withIndex("by_org_ledger_key", (q) => q.eq("orgId", orgId).eq("ledger", ledger).eq("key", key))
    .collect();
  return round2(ps.filter((p) => p.status === "prepared" && p.currency === currency).reduce((s, p) => s + p.amount, 0));
}

async function prepareOne(
  ctx: MutationCtx,
  access: FinanceAccess,
  args: {
    ledger: PayoutLedger;
    key: string;
    currency: "USD" | "ZiG";
    amount: number;
    date: string;
    method: Doc<"finPayouts">["method"];
    accountId?: Id<"finAccounts">;
    reference?: string;
    payeeEmail?: string;
  }
): Promise<Id<"finPayouts">> {
  const amount = round2(args.amount);
  if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
  const who = await payee(ctx, access.orgId, args.ledger, args.key);
  const held = (await ledgerBalance(ctx, access.orgId, args.ledger, args.key))[args.currency] ?? 0;
  const pending = await preparedTotal(ctx, access.orgId, args.ledger, args.key, args.currency);
  if (round2(amount + pending) > held) {
    throw new ConvexError(`${who.name} has ${formatAmount(round2(held - pending), args.currency)} available to pay out`);
  }
  const account = args.accountId ? await getAccount(ctx, access.orgId, args.accountId) : await ensureAccount(ctx, access.orgId, "trust", args.currency);
  if (account.currency !== args.currency) throw new ConvexError(`${account.name} is in ${account.currency}`);
  const number = await nextNumber(ctx, access.orgId, "payout");
  const id = await ctx.db.insert("finPayouts", {
    orgId: access.orgId,
    number,
    ledger: args.ledger,
    key: args.key,
    payeeName: who.name,
    payeeEmail: args.payeeEmail?.trim() || who.email,
    currency: args.currency,
    amount,
    accountId: account._id,
    method: args.method,
    reference: args.reference?.trim() || undefined,
    date: args.date,
    status: "prepared",
    remittance: await remittanceLines(ctx, access.orgId, args.ledger, args.key, args.currency),
    preparedByUserId: access.user._id,
    preparedAt: Date.now(),
  });
  await financeAudit(ctx, access, {
    action: "finance.payout_prepare",
    description: `Prepared payout ${number}: ${formatAmount(amount, args.currency)} to ${who.name}`,
    targetType: "finPayout",
    targetId: id,
    targetLabel: number,
  });
  return id;
}

async function payOne(ctx: MutationCtx, access: FinanceAccess, payoutId: Id<"finPayouts">, reference?: string) {
  requireDirector(access);
  const p = await ctx.db.get(payoutId);
  if (!p || p.orgId !== access.orgId) throw new ConvexError("Payout not found");
  if (p.status !== "prepared") throw new ConvexError("Only a prepared payout can be paid");
  const settings = await getSettings(ctx, access.orgId);
  if (settings.approvers === "two" && p.preparedByUserId === access.user._id) {
    throw new ConvexError("Two approvers are required. Another director must approve a payout you prepared.");
  }
  const txId = await postTransaction(
    ctx,
    access,
    {
      date: p.date,
      kind: "payment",
      number: p.number,
      description: `Payout to ${p.payeeName}`,
      method: p.method,
      reference: reference?.trim() || p.reference,
      counterparty: p.payeeName,
      contactId: p.ledger === "landlord" ? (p.key as Id<"contacts">) : undefined,
      developmentId: p.ledger === "developer" ? (p.key as Id<"finDevelopments">) : undefined,
      payoutId: p._id,
    },
    [
      { currency: p.currency, amount: -p.amount, accountId: p.accountId },
      { currency: p.currency, amount: -p.amount, ledger: p.ledger, key: p.key },
    ]
  );
  await ctx.db.patch(p._id, {
    status: "paid",
    txId,
    reference: reference?.trim() || p.reference,
    approvedByUserId: access.user._id,
    paidAt: Date.now(),
  });
  await financeAudit(ctx, access, {
    action: "finance.payout_pay",
    description: `Approved and paid ${p.number}: ${formatAmount(p.amount, p.currency)} to ${p.payeeName}`,
    targetType: "finPayout",
    targetId: p._id,
    targetLabel: p.number,
  });
  if (p.payeeEmail) await sendRemittance(ctx, access, p._id);
}

/** Prepare a payout; a director with one-approver settings can pay at once. */
export const prepare = mutation({
  args: {
    ledger: payoutLedger,
    key: v.string(),
    currency: finCurrency,
    amount: v.number(),
    date: v.string(),
    method: finMethod,
    accountId: v.optional(v.id("finAccounts")),
    reference: v.optional(v.string()),
    payeeEmail: v.optional(v.string()),
    payNow: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const { payNow, ...rest } = args;
    const id = await prepareOne(ctx, access, rest);
    const settings = await getSettings(ctx, access.orgId);
    if (payNow && access.canApprove && settings.approvers === "one") await payOne(ctx, access, id);
    return id;
  },
});

export const approve = mutation({
  args: { payoutId: v.id("finPayouts"), reference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    await payOne(ctx, access, args.payoutId, args.reference);
  },
});

/** Cancel a prepared payout, or reverse a paid one (directors). */
export const cancel = mutation({
  args: { payoutId: v.id("finPayouts"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.orgId !== access.orgId) throw new ConvexError("Payout not found");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    if (p.status === "cancelled") throw new ConvexError("Already cancelled");
    if (p.status === "paid") {
      requireDirector(access);
      if (p.txId) await reverseTransaction(ctx, access, p.txId, reason);
    }
    await ctx.db.patch(p._id, { status: "cancelled", cancelReason: reason });
    await financeAudit(ctx, access, {
      action: "finance.payout_cancel",
      description: `${p.status === "paid" ? "Reversed" : "Cancelled"} payout ${p.number}: ${reason}`,
      targetType: "finPayout",
      targetId: p._id,
      targetLabel: p.number,
    });
  },
});

/**
 * FN-42: prepare a payout for every landlord with money available, in one
 * currency. With one approver a director's run pays them too.
 */
export const prepareMonthly = mutation({
  args: { currency: finCurrency, date: v.string(), method: finMethod, payNow: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const settings = await getSettings(ctx, access.orgId);
    const balances = await ledgerBalances(ctx, access.orgId, "landlord");
    let count = 0;
    for (const [key, t] of balances) {
      const held = t[args.currency] ?? 0;
      const available = round2(held - (await preparedTotal(ctx, access.orgId, "landlord", key, args.currency)));
      if (available <= 0) continue;
      const id = await prepareOne(ctx, access, { ledger: "landlord", key, currency: args.currency, amount: available, date: args.date, method: args.method });
      if (args.payNow && access.canApprove && settings.approvers === "one") await payOne(ctx, access, id);
      count++;
    }
    return { count };
  },
});

/** Everyone with client money we could pay out, and payouts waiting. */
export const payable = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    const visible = await visibleLandlordIds(ctx, access);
    const out = [];
    for (const ledger of ["landlord", "sale", "developer"] as const) {
      if (ledger !== "landlord" && !access.isStaff) continue;
      const balances = await ledgerBalances(ctx, access.orgId, ledger);
      for (const [key, t] of balances) {
        if (ledger === "landlord" && visible !== "all" && !visible.has(key)) continue;
        for (const currency of ["USD", "ZiG"] as const) {
          const held = t[currency] ?? 0;
          if (held === 0) continue;
          let who: { name: string; email?: string };
          try {
            who = await payee(ctx, access.orgId, ledger, key);
          } catch {
            continue;
          }
          const ps = await ctx.db
            .query("finPayouts")
            .withIndex("by_org_ledger_key", (q) => q.eq("orgId", access.orgId).eq("ledger", ledger).eq("key", key))
            .collect();
          const prepared = round2(ps.filter((p) => p.status === "prepared" && p.currency === currency).reduce((s, p) => s + p.amount, 0));
          const lastPaid = ps.filter((p) => p.status === "paid" && p.currency === currency).sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))[0];
          out.push({ ledger, key, name: who.name, email: who.email ?? "", currency, held, prepared, available: round2(held - prepared), lastPaidOn: lastPaid?.date ?? null });
        }
      }
    }
    return out.sort((a, b) => b.available - a.available);
  },
});

export const list = query({
  args: { status: v.optional(v.union(v.literal("prepared"), v.literal("paid"), v.literal("cancelled"))) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const rows = args.status
      ? await ctx.db
          .query("finPayouts")
          .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", args.status!))
          .order("desc")
          .take(500)
      : await ctx.db
          .query("finPayouts")
          .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
          .order("desc")
          .take(500);
    const names = await nameMaps(ctx, { users: rows.flatMap((p) => [p.preparedByUserId, ...(p.approvedByUserId ? [p.approvedByUserId] : [])]) });
    const settings = await getSettings(ctx, access.orgId);
    return rows.map((p) => ({
      _id: p._id,
      number: p.number,
      ledger: p.ledger,
      payeeName: p.payeeName,
      currency: p.currency,
      amount: p.amount,
      date: p.date,
      method: METHOD_LABELS[p.method],
      reference: p.reference ?? "",
      status: p.status,
      preparedBy: userLabel(names.user(p.preparedByUserId)),
      approvedBy: p.approvedByUserId ? userLabel(names.user(p.approvedByUserId)) : "",
      // Two approvers: the preparer cannot approve their own payout.
      canApprove: p.status === "prepared" && access.canApprove && (settings.approvers === "one" || p.preparedByUserId !== access.user._id),
      cancelReason: p.cancelReason ?? null,
    }));
  },
});

async function remittanceData(ctx: QueryCtx | MutationCtx, access: Pick<FinanceAccess, "org">, p: Doc<"finPayouts">) {
  const account = await ctx.db.get(p.accountId);
  const received = round2(p.remittance.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const deducted = round2(-p.remittance.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  return {
    agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
    number: p.number,
    date: p.date,
    status: p.status,
    payeeName: p.payeeName,
    payeeEmail: p.payeeEmail ?? "",
    currency: p.currency,
    amount: p.amount,
    method: METHOD_LABELS[p.method],
    reference: p.reference ?? "",
    account: account?.name ?? "",
    lines: p.remittance,
    received,
    deducted,
  };
}

export const get = query({
  args: { payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.orgId !== access.orgId) return null;
    if (!access.isStaff) {
      const visible = await visibleLandlordIds(ctx, access);
      if (p.ledger !== "landlord" || (visible !== "all" && !visible.has(p.key))) return null;
    }
    return remittanceData(ctx, access, p);
  },
});

async function sendRemittance(ctx: MutationCtx, access: FinanceAccess, payoutId: Id<"finPayouts">) {
  const p = (await ctx.db.get(payoutId))!;
  if (!p.payeeEmail) throw new ConvexError("No email address for this payee");
  const d = await remittanceData(ctx, access, p);
  const c = p.currency;
  await queueDocumentEmail(
    ctx,
    access.orgId,
    documentEmail({
      agency: agencyOf(access.org),
      to: p.payeeEmail,
      name: p.payeeName,
      subject: `Remittance advice ${p.number} from ${access.org.name}`,
      intro: `We have paid you ${formatAmount(p.amount, c)}. The details are below.`,
      lines: { head: ["Date", "Item", "Amount"], body: d.lines.map((l) => [dateLabel(l.date), l.description, formatAmount(l.amount, c)]) },
      items: [
        ["Received", formatAmount(d.received, c)],
        ["Commission and expenses", formatAmount(d.deducted, c)],
        ["Paid to you", formatAmount(p.amount, c)],
        ["Method", d.method],
        ...(d.reference ? ([["Reference", d.reference]] as Array<[string, string]>) : []),
        ["Date", dateLabel(p.date)],
      ],
      kind: "finance_remittance",
      relatedType: "finPayout",
      relatedId: p._id,
    }),
    remittanceDocument(d),
    access.user._id
  );
  await ctx.db.patch(p._id, { emailedAt: Date.now() });
}

export const emailRemittance = mutation({
  args: { payoutId: v.id("finPayouts") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.orgId !== access.orgId || p.status !== "paid") throw new ConvexError("Paid payout not found");
    await sendRemittance(ctx, access, p._id);
  },
});
