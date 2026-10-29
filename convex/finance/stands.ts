/**
 * Instalments: stands (or anything else) sold on a payment plan (BRD 5.10).
 *
 * A development says who holds the money: the developer itself (our client,
 * its own income) or the agency, in trust, for a developer it sells for. A
 * stand carries the buyer's plan. Receipts are allocated oldest instalment
 * first, and the stand keeps paid to date, balance, overdue and next due up
 * to date for lists, reminders and (later) Sync Dev.
 *
 * Interest is optional per development and only charged when staff run it.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { agencyOf } from "../stay/shared";
import { dateLabel, formatAmount, isValidDate, isValidPeriod, todayIn, DEFAULT_TIMEZONE } from "../stay/ledger";
import { getSettings as getStaySettings } from "../stay/shared";
import {
  FinanceAccess,
  NewLine,
  categoryByKey,
  ensureAccount,
  financeAudit,
  financeOn,
  getAccount,
  getSettings,
  nextNumber,
  postTransaction,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
} from "./core";
import { buildPlan, feeOn, monthlyInterest, pickReminder, planState, round2, standRemindersDue } from "./lib";
import { finCurrency, finMethod } from "../schemas/finance";
import { documentEmail, queueDocumentEmail } from "./emails";
import { standStatementDocument } from "./documents";
import { queueMessage } from "../notify/send";
import { moveFee } from "./posting";

type Ctx = QueryCtx | MutationCtx;

async function getDevelopment(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finDevelopments">) {
  const d = await ctx.db.get(id);
  if (!d || d.orgId !== orgId) throw new ConvexError("Development not found");
  return d;
}

async function getStand(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finStands">) {
  const s = await ctx.db.get(id);
  if (!s || s.orgId !== orgId) throw new ConvexError("Stand not found");
  return s;
}

/** Money received for a stand since go-live (live receipts, net of reversals). */
async function receivedFor(ctx: Ctx, standId: Id<"finStands">): Promise<number> {
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_stand", (q) => q.eq("standId", standId))
    .collect();
  let total = 0;
  for (const t of txs) {
    if (t.kind !== "receipt") continue;
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    total = round2(total + lines.filter((l) => l.accountId).reduce((s, l) => s + l.amount, 0));
  }
  return total;
}

/** A cancelled sale owes nothing: no balance, nothing overdue, nothing next. */
function cancelledState<T extends { balance: number; overdue: number; nextDueDate?: string; nextDueAmount?: number }>(status: string, st: T): T {
  return status === "cancelled" ? { ...st, balance: 0, overdue: 0, nextDueDate: undefined, nextDueAmount: undefined } : st;
}

/** FN-91: re-allocate everything paid and store the result on the stand. */
export async function recomputeStand(ctx: MutationCtx, standId: Id<"finStands">) {
  const s = await ctx.db.get(standId);
  if (!s) return null;
  const today = await todayForOrg(ctx, s.orgId);
  const paid = round2(s.openingPaid + (await receivedFor(ctx, s._id)));
  const st = cancelledState(s.status, planState(s.schedule, paid, today));
  await ctx.db.patch(s._id, {
    paidToDate: st.paidToDate,
    balance: st.balance,
    overdue: st.overdue,
    nextDueDate: st.nextDueDate,
    nextDueAmount: st.nextDueAmount,
    status: s.status === "cancelled" ? "cancelled" : st.balance <= 0 ? "paid" : "active",
    updatedAt: Date.now(),
  });
  return st;
}

// ── Developments ─────────────────────────────────────────────────────

const developmentArgs = {
  name: v.string(),
  developerContactId: v.optional(v.id("contacts")),
  developerName: v.string(),
  developerEmail: v.optional(v.string()),
  moneyHeldBy: v.union(v.literal("developer"), v.literal("agency_trust")),
  commissionPct: v.number(),
  commissionTiming: v.union(v.literal("each_payment"), v.literal("fully_paid")),
  interestPctPerMonth: v.optional(v.number()),
  currency: finCurrency,
};

function checkDevelopment(a: { name: string; developerName: string; commissionPct: number; interestPctPerMonth?: number }) {
  if (!a.name.trim()) throw new ConvexError("Name the development");
  if (!a.developerName.trim()) throw new ConvexError("Name the developer");
  if (!(a.commissionPct >= 0 && a.commissionPct <= 100)) throw new ConvexError("Commission must be between 0 and 100%");
  if (a.interestPctPerMonth !== undefined && !(a.interestPctPerMonth >= 0 && a.interestPctPerMonth <= 20)) {
    throw new ConvexError("Interest must be between 0 and 20% a month");
  }
}

export const createDevelopment = mutation({
  args: developmentArgs,
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    checkDevelopment(args);
    const now = Date.now();
    const id = await ctx.db.insert("finDevelopments", {
      ...args,
      name: args.name.trim(),
      developerName: args.developerName.trim(),
      developerEmail: args.developerEmail?.trim() || undefined,
      interestPctPerMonth: args.interestPctPerMonth || undefined,
      isActive: true,
      orgId: access.orgId,
      createdAt: now,
      updatedAt: now,
    });
    await financeAudit(ctx, access, { action: "finance.development_create", description: `Added development ${args.name.trim()}`, targetType: "finDevelopment", targetId: id });
    return id;
  },
});

export const updateDevelopment = mutation({
  args: { developmentId: v.id("finDevelopments"), isActive: v.boolean(), ...developmentArgs },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const d = await getDevelopment(ctx, access.orgId, args.developmentId);
    checkDevelopment(args);
    const { developmentId, ...rest } = args;
    void developmentId;
    // Currency and who holds the money decide where past receipts went.
    const stands = await ctx.db
      .query("finStands")
      .withIndex("by_development", (q) => q.eq("developmentId", d._id))
      .take(1);
    if (stands.length && (rest.currency !== d.currency || rest.moneyHeldBy !== d.moneyHeldBy)) {
      throw new ConvexError("This development has stands. Its currency and who holds the money can no longer change.");
    }
    await ctx.db.patch(d._id, {
      ...rest,
      name: rest.name.trim(),
      developerName: rest.developerName.trim(),
      developerEmail: rest.developerEmail?.trim() || undefined,
      interestPctPerMonth: rest.interestPctPerMonth || undefined,
      updatedAt: Date.now(),
    });
    await financeAudit(ctx, access, { action: "finance.development_update", description: `Updated development ${rest.name.trim()}`, targetType: "finDevelopment", targetId: d._id });
  },
});

export const listDevelopments = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const devs = await ctx.db
      .query("finDevelopments")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    const out = [];
    for (const d of devs) {
      const stands = (
        await ctx.db
          .query("finStands")
          .withIndex("by_development", (q) => q.eq("developmentId", d._id))
          .collect()
      ).filter((s) => s.status !== "cancelled");
      out.push({
        ...d,
        stands: stands.length,
        contracted: round2(stands.reduce((s, x) => s + x.price, 0)),
        collected: round2(stands.reduce((s, x) => s + x.paidToDate, 0)),
        outstanding: round2(stands.reduce((s, x) => s + x.balance, 0)),
        overdue: round2(stands.reduce((s, x) => s + x.overdue, 0)),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ── Stands (client plans) ────────────────────────────────────────────

export async function insertStand(
  ctx: MutationCtx,
  access: Pick<FinanceAccess, "user" | "orgId">,
  args: {
    developmentId: Id<"finDevelopments">;
    standNumber: string;
    buyerContactId?: Id<"contacts">;
    buyerName: string;
    buyerEmail?: string;
    buyerPhone?: string;
    price: number;
    schedule: Array<{ dueDate: string; amount: number; label: string }>;
    openingPaid?: number;
    importId?: Id<"finImports">;
  }
): Promise<Id<"finStands">> {
  const dev = await getDevelopment(ctx, access.orgId, args.developmentId);
  const standNumber = args.standNumber.trim();
  if (!standNumber) throw new ConvexError("Enter the stand number");
  const price = round2(args.price);
  if (!(price > 0)) throw new ConvexError("Price must be more than zero");
  if (!args.schedule.length) throw new ConvexError("Add the payment plan");
  for (const r of args.schedule) {
    if (!isValidDate(r.dueDate)) throw new ConvexError("Each instalment needs a valid due date");
    if (!(r.amount > 0)) throw new ConvexError("Each instalment needs an amount");
  }
  const planTotal = round2(args.schedule.reduce((s, r) => s + r.amount, 0));
  if (planTotal !== price) throw new ConvexError(`The plan adds up to ${formatAmount(planTotal, dev.currency)}, not the price ${formatAmount(price, dev.currency)}`);
  const existing = await ctx.db
    .query("finStands")
    .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
    .collect();
  if (existing.some((s) => s.status !== "cancelled" && s.standNumber.toLowerCase() === standNumber.toLowerCase())) {
    throw new ConvexError(`Stand ${standNumber} is already sold in ${dev.name}`);
  }
  let buyerName = args.buyerName.trim();
  let buyerEmail = args.buyerEmail?.trim() || undefined;
  let buyerPhone = args.buyerPhone?.trim() || undefined;
  if (args.buyerContactId) {
    const c = await ctx.db.get(args.buyerContactId);
    if (!c || c.orgId !== access.orgId) throw new ConvexError("Buyer not found");
    buyerName = buyerName || c.name;
    buyerEmail = buyerEmail ?? c.email ?? undefined;
    buyerPhone = buyerPhone ?? c.phone ?? undefined;
  }
  if (!buyerName) throw new ConvexError("Enter the buyer's name");
  const now = Date.now();
  const id = await ctx.db.insert("finStands", {
    orgId: access.orgId,
    developmentId: dev._id,
    standNumber,
    buyerContactId: args.buyerContactId,
    buyerName,
    buyerEmail,
    buyerPhone,
    currency: dev.currency,
    price,
    schedule: args.schedule.map((r) => ({ dueDate: r.dueDate, amount: round2(r.amount), label: r.label.trim() || "Instalment", kind: "plan" as const })),
    openingPaid: round2(args.openingPaid ?? 0),
    paidToDate: 0,
    balance: price,
    overdue: 0,
    status: "active",
    remindersSent: [],
    importId: args.importId,
    createdByUserId: access.user._id,
    createdAt: now,
    updatedAt: now,
  });
  await recomputeStand(ctx, id);
  return id;
}

export const createStand = mutation({
  args: {
    developmentId: v.id("finDevelopments"),
    standNumber: v.string(),
    buyerContactId: v.optional(v.id("contacts")),
    buyerName: v.string(),
    buyerEmail: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    price: v.number(),
    // Either an even plan...
    plan: v.optional(v.object({ deposit: v.number(), depositDue: v.string(), count: v.number(), firstDue: v.string() })),
    // ...or rows typed in.
    schedule: v.optional(v.array(v.object({ dueDate: v.string(), amount: v.number(), label: v.string() }))),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const { plan, schedule, ...rest } = args;
    const rows = schedule ?? (plan ? buildPlan(args.price, plan.deposit, plan.depositDue, plan.count, plan.firstDue) : []);
    const id = await insertStand(ctx, access, { ...rest, schedule: rows });
    await financeAudit(ctx, access, { action: "finance.stand_create", description: `Stand ${args.standNumber.trim()} sold to ${args.buyerName.trim()}`, targetType: "finStand", targetId: id });
    return id;
  },
});

/** Cancel a sale. What was paid is refunded or moved with a normal payment. */
export const cancelStand = mutation({
  args: { standId: v.id("finStands"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const s = await getStand(ctx, access.orgId, args.standId);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    await ctx.db.patch(s._id, { status: "cancelled", updatedAt: Date.now() });
    await recomputeStand(ctx, s._id);
    await financeAudit(ctx, access, { action: "finance.stand_cancel", description: `Cancelled stand ${s.standNumber} (${s.buyerName}): ${reason}`, targetType: "finStand", targetId: s._id });
  },
});

/**
 * FN-97: pay back what a buyer paid on a cancelled sale. Comes out of the
 * developer's trust money, or the agency's stand sales when the developer is
 * our client. Moving the money to another stand is a refund plus a receipt.
 */
export const refundStand = mutation({
  args: {
    standId: v.id("finStands"),
    date: v.string(),
    amount: v.number(),
    method: finMethod,
    accountId: v.optional(v.id("finAccounts")),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const s = await getStand(ctx, access.orgId, args.standId);
    if (s.status !== "cancelled") throw new ConvexError("Cancel the sale before refunding the buyer");
    const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_stand", (q) => q.eq("standId", s._id))
      .collect();
    let refunded = 0;
    for (const t of txs.filter((x) => x.kind === "payment")) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_tx", (q) => q.eq("txId", t._id))
        .collect();
      refunded = round2(refunded - lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0));
    }
    const available = round2((await receivedFor(ctx, s._id)) - refunded);
    if (amount > available) throw new ConvexError(`Only ${formatAmount(available, s.currency)} received since go-live can be refunded`);
    const inTrust = dev.moneyHeldBy === "agency_trust";
    const account = args.accountId
      ? await getAccount(ctx, access.orgId, args.accountId)
      : await ensureAccount(ctx, access.orgId, args.method === "cash" ? "cash" : inTrust ? "trust" : "business", s.currency);
    if (account.currency !== s.currency) throw new ConvexError(`This stand is in ${s.currency}`);
    const number = await nextNumber(ctx, access.orgId, "payment");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "payment",
        number,
        description: `Refund on cancelled stand ${s.standNumber}, ${dev.name}`,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        contactId: s.buyerContactId,
        counterparty: s.buyerName,
        standId: s._id,
        developmentId: dev._id,
      },
      [
        { currency: s.currency, amount: -amount, accountId: account._id },
        inTrust
          ? { currency: s.currency, amount: -amount, ledger: "developer", key: dev._id }
          : { currency: s.currency, amount: -amount, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "stand_sales") },
      ]
    );
    await financeAudit(ctx, access, {
      action: "finance.stand_refund",
      description: `Payment ${number}: refunded ${formatAmount(amount, s.currency)} to ${s.buyerName} (stand ${s.standNumber})`,
      targetType: "finStand",
      targetId: s._id,
      targetLabel: number,
    });
    return { txId, number };
  },
});

/** Every client on a plan, with what they paid and owe. */
export const listStands = query({
  args: { developmentId: v.optional(v.id("finDevelopments")), overdueOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const rows = args.developmentId
      ? await ctx.db
          .query("finStands")
          .withIndex("by_development", (q) => q.eq("developmentId", args.developmentId!))
          .collect()
      : await ctx.db
          .query("finStands")
          .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
          .collect();
    const devs = new Map((await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).map((d) => [d._id as string, d]));
    return rows
      .filter((s) => s.orgId === access.orgId && (!args.overdueOnly || s.overdue > 0))
      .map((s) => ({
        _id: s._id,
        developmentId: s.developmentId,
        development: devs.get(s.developmentId)?.name ?? "",
        standNumber: s.standNumber,
        buyerName: s.buyerName,
        buyerEmail: s.buyerEmail ?? "",
        buyerPhone: s.buyerPhone ?? "",
        currency: s.currency,
        price: s.price,
        interest: round2(s.schedule.filter((r) => r.kind === "interest").reduce((t, r) => t + r.amount, 0)),
        paidToDate: s.paidToDate,
        balance: s.balance,
        overdue: s.overdue,
        nextDueDate: s.nextDueDate ?? null,
        nextDueAmount: s.nextDueAmount ?? null,
        status: s.status,
      }))
      .sort((a, b) => b.overdue - a.overdue || a.buyerName.localeCompare(b.buyerName));
  },
});

/** FN-94: the buyer statement, plan and payment history. */
async function statementData(ctx: Ctx, access: Pick<FinanceAccess, "orgId" | "org">, s: Doc<"finStands">) {
  const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
  const today = await todayForOrg(ctx, access.orgId);
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_stand", (q) => q.eq("standId", s._id))
    .collect();
  const payments = [];
  const refunds = [];
  for (const t of txs.filter((x) => x.kind === "payment").sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    refunds.push({ _id: t._id, date: t.date, number: t.number ?? "", amount: round2(-lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0)) });
  }
  for (const t of txs.filter((x) => x.kind === "receipt").sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    payments.push({
      _id: t._id,
      date: t.date,
      number: t.number ?? "",
      method: t.method ?? "",
      reference: t.reference ?? "",
      amount: round2(lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0)),
      reversed: !!t.reversedAt,
      isReversal: !!t.reversalOfId,
    });
  }
  const paid = round2(s.openingPaid + payments.reduce((a, p) => a + p.amount, 0));
  const st = cancelledState(s.status, planState(s.schedule, paid, today));
  const deposit = s.schedule.find((r) => r.label.toLowerCase() === "deposit")?.amount ?? 0;
  return {
    agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
    stand: { _id: s._id, standNumber: s.standNumber, status: s.status, currency: s.currency, price: s.price, deposit, openingPaid: s.openingPaid },
    development: { _id: dev._id, name: dev.name, developerName: dev.developerName, moneyHeldBy: dev.moneyHeldBy, interestPctPerMonth: dev.interestPctPerMonth ?? 0 },
    buyer: { name: s.buyerName, email: s.buyerEmail ?? "", phone: s.buyerPhone ?? "", contactId: s.buyerContactId ?? null },
    interest: round2(s.schedule.filter((r) => r.kind === "interest").reduce((a, r) => a + r.amount, 0)),
    today,
    ...st,
    payments,
    refunds,
    // Received since go-live and not yet paid back (FN-97).
    refundable: round2(Math.max(0, payments.reduce((a, p) => a + p.amount, 0) - refunds.reduce((a, r) => a + r.amount, 0))),
  };
}

export const getStandStatement = query({
  args: { standId: v.id("finStands") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const s = await ctx.db.get(args.standId);
    if (!s || s.orgId !== access.orgId) return null;
    return statementData(ctx, access, s);
  },
});

async function emailStatement(ctx: MutationCtx, access: Pick<FinanceAccess, "orgId" | "org" | "user">, standId: Id<"finStands">) {
  const s = await getStand(ctx, access.orgId, standId);
  if (!s.buyerEmail) return false;
  const d = await statementData(ctx, access, s);
  const c = s.currency;
  return queueDocumentEmail(
    ctx,
    access.orgId,
    documentEmail({
      agency: agencyOf(access.org),
      to: s.buyerEmail,
      name: s.buyerName,
      subject: `Statement for stand ${s.standNumber}, ${d.development.name}`,
      intro: `Here is the latest statement for stand ${s.standNumber} in ${d.development.name}.`,
      lines: {
        head: ["Date", "Receipt", "Amount"],
        body: d.payments.map((p) => [dateLabel(p.date), p.number, formatAmount(p.amount, c)]),
      },
      items: [
        ["Price", formatAmount(s.price, c)],
        ...(d.interest > 0 ? ([["Interest charged", formatAmount(d.interest, c)]] as Array<[string, string]>) : []),
        ["Paid to date", formatAmount(d.paidToDate, c)],
        ["Balance", formatAmount(d.balance, c)],
        ["Overdue", formatAmount(d.overdue, c)],
        ...(d.nextDueDate ? ([["Next payment", `${formatAmount(d.nextDueAmount ?? 0, c)} on ${dateLabel(d.nextDueDate)}`]] as Array<[string, string]>) : []),
      ],
      kind: "finance_stand_statement",
      relatedType: "finStand",
      relatedId: s._id,
    }),
    standStatementDocument({ ...d, development: d.development }),
    access.user._id
  );
}

export const emailStandStatement = mutation({
  args: { standId: v.id("finStands") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!(await emailStatement(ctx, access, args.standId))) throw new ConvexError("The buyer has no email address");
  },
});

/**
 * FN-90: receipt a payment on a stand. The account defaults from the
 * development: the developer's money goes to the business account, money we
 * hold for a developer to trust (cash to the float either way).
 */
export const receivePayment = mutation({
  args: {
    standId: v.id("finStands"),
    date: v.string(),
    amount: v.number(),
    method: finMethod,
    accountId: v.optional(v.id("finAccounts")),
    reference: v.optional(v.string()),
    emailStatement: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const s = await getStand(ctx, access.orgId, args.standId);
    if (s.status === "cancelled") throw new ConvexError("This sale is cancelled");
    const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    const inTrust = dev.moneyHeldBy === "agency_trust";
    const account = args.accountId
      ? await getAccount(ctx, access.orgId, args.accountId)
      : args.method === "cash"
        ? await ensureAccount(ctx, access.orgId, "cash", s.currency)
        : await ensureAccount(ctx, access.orgId, inTrust ? "trust" : "business", s.currency);
    if (account.currency !== s.currency) throw new ConvexError(`This stand is in ${s.currency}`);
    const lines: NewLine[] = [{ currency: s.currency, amount, accountId: account._id }];
    if (inTrust) lines.push({ currency: s.currency, amount, ledger: "developer", key: dev._id });
    else lines.push({ currency: s.currency, amount, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "stand_sales") });
    const fee = inTrust && dev.commissionTiming === "each_payment" ? feeOn(amount, dev.commissionPct) : 0;
    const number = await nextNumber(ctx, access.orgId, "receipt");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "receipt",
        number,
        description: `Stand ${s.standNumber}, ${dev.name}`,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        contactId: s.buyerContactId,
        counterparty: s.buyerName,
        standId: s._id,
        developmentId: dev._id,
        fee:
          fee > 0
            ? { ledger: "developer", key: dev._id, currency: s.currency, accountId: account._id, base: amount, pct: dev.commissionPct, amount: fee, categoryKey: "stand_commission" }
            : undefined,
      },
      lines
    );
    const settings = await getSettings(ctx, access.orgId);
    if (fee > 0 && settings.commissionTiming === "on_receipt") await moveFee(ctx, access, txId);
    const st = await recomputeStand(ctx, s._id);
    // Commission earned once the stand is fully paid: on the full price.
    if (inTrust && dev.commissionTiming === "fully_paid" && st && st.balance <= 0 && !s.commissionMoved) {
      const full = feeOn(s.price, dev.commissionPct);
      if (full > 0) {
        const business = await ensureAccount(ctx, access.orgId, "business", s.currency);
        const trust = account.type === "trust" ? account : await ensureAccount(ctx, access.orgId, "trust", s.currency);
        await postTransaction(
          ctx,
          access,
          { date: args.date, kind: "transfer", description: `Commission ${dev.commissionPct}% on stand ${s.standNumber} (fully paid)`, standId: s._id, developmentId: dev._id },
          [
            { currency: s.currency, amount: -full, ledger: "developer", key: dev._id },
            { currency: s.currency, amount: full, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "stand_commission") },
            { currency: s.currency, amount: -full, accountId: trust._id },
            { currency: s.currency, amount: full, accountId: business._id },
          ],
          { allowNegative: true }
        );
      }
      await ctx.db.patch(s._id, { commissionMoved: true });
    }
    await financeAudit(ctx, access, {
      action: "finance.stand_payment",
      description: `Receipt ${number}: ${formatAmount(amount, s.currency)} for stand ${s.standNumber} from ${s.buyerName}`,
      targetType: "finStand",
      targetId: s._id,
      targetLabel: number,
    });
    if (args.emailStatement !== false) await emailStatement(ctx, access, s._id);
    return { txId, number };
  },
});

/**
 * Charge one month's interest on every overdue plan in developments that
 * charge interest. Once per stand per month; dated today.
 */
export const chargeInterest = mutation({
  args: { month: v.string(), developmentId: v.optional(v.id("finDevelopments")) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!isValidPeriod(args.month)) throw new ConvexError("Pick a month");
    const today = await todayForOrg(ctx, access.orgId);
    const devs = (await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).filter(
      (d) => (d.interestPctPerMonth ?? 0) > 0 && (!args.developmentId || d._id === args.developmentId)
    );
    let charged = 0;
    let total = 0;
    for (const d of devs) {
      const stands = await ctx.db
        .query("finStands")
        .withIndex("by_development", (q) => q.eq("developmentId", d._id))
        .collect();
      for (const s of stands) {
        if (s.status !== "active" || (s.interestMonths ?? []).includes(args.month)) continue;
        const st = await recomputeStand(ctx, s._id);
        const amount = monthlyInterest(st?.overdue ?? 0, d.interestPctPerMonth);
        if (!(amount > 0)) continue;
        await ctx.db.patch(s._id, {
          schedule: [...s.schedule, { dueDate: today, amount, label: `Interest ${args.month} (${d.interestPctPerMonth}% on overdue)`, kind: "interest" as const }],
          interestMonths: [...(s.interestMonths ?? []), args.month],
        });
        await recomputeStand(ctx, s._id);
        charged++;
        total = round2(total + amount);
      }
    }
    await financeAudit(ctx, access, {
      action: "finance.interest",
      description: `Charged interest for ${args.month} on ${charged} overdue plans`,
      targetType: "organization",
      targetId: access.orgId,
      metadata: { charged, total },
    });
    return { charged };
  },
});

/** FN-96: per development, stands sold, contracted, collected, outstanding, overdue by buyer. */
export const developerReport = query({
  args: { developmentId: v.id("finDevelopments") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const dev = await getDevelopment(ctx, access.orgId, args.developmentId);
    const stands = (
      await ctx.db
        .query("finStands")
        .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
        .collect()
    ).filter((s) => s.status !== "cancelled");
    // Commission and payouts only exist when we hold the money.
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_org_ledger_key", (q) => q.eq("orgId", access.orgId).eq("ledger", "developer").eq("key", dev._id))
      .collect();
    let commission = 0;
    let paidOut = 0;
    for (const l of lines) {
      const t = await ctx.db.get(l.txId);
      // Net of reversals: a reversed payout or commission adds back.
      if (t?.payoutId) paidOut = round2(paidOut - l.amount);
      else if (t?.kind === "transfer") commission = round2(commission - l.amount);
    }
    const held = round2(lines.reduce((s, l) => s + l.amount, 0));
    return {
      agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
      development: dev,
      sold: stands.length,
      contracted: round2(stands.reduce((s, x) => s + x.price, 0)),
      collected: round2(stands.reduce((s, x) => s + x.paidToDate, 0)),
      outstanding: round2(stands.reduce((s, x) => s + x.balance, 0)),
      overdue: round2(stands.reduce((s, x) => s + x.overdue, 0)),
      commission,
      paidOut,
      held,
      buyers: stands
        .map((s) => ({ standNumber: s.standNumber, buyerName: s.buyerName, price: s.price, paidToDate: s.paidToDate, balance: s.balance, overdue: s.overdue, nextDueDate: s.nextDueDate ?? null }))
        .sort((a, b) => b.overdue - a.overdue),
    };
  },
});

// ── Daily job ────────────────────────────────────────────────────────

/** Keep overdue figures current and send reminders (FN-95), org by org. */
export const runDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    for (const org of orgs) {
      if (!financeOn(org) || org.deletingAt) continue;
      await ctx.scheduler.runAfter(0, internal.finance.stands.runForOrg, { orgId: org._id });
    }
  },
});

export const runForOrg = internalMutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) return;
    const settings = await getSettings(ctx, org._id);
    const stay = await getStaySettings(ctx, org._id);
    const today = todayIn(stay.timezone ?? DEFAULT_TIMEZONE);
    const devs = new Map((await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", org._id)).collect()).map((d) => [d._id as string, d]));
    const stands = await ctx.db
      .query("finStands")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .collect();
    for (const s of stands) {
      if (s.status !== "active") continue;
      const st = await recomputeStand(ctx, s._id);
      if (!st || (!s.buyerEmail && !s.buyerPhone)) continue;
      const due = standRemindersDue(st.rows, today, settings.standReminderDays, s.remindersSent);
      if (!due.length) continue;
      // One message per stand per day: the most pressing reminder, sent on
      // the agency's preferred channel through Sync Notify.
      const { pick, markSent } = pickReminder(due)!;
      const dev = devs.get(s.developmentId);
      const c = s.currency;
      const item = `stand ${s.standNumber}${dev ? `, ${dev.name}` : ""}`;
      const body =
        pick.kind === "overdue"
          ? `Dear ${s.buyerName}, our records show ${formatAmount(st.overdue, c)} overdue on ${item}. Balance ${formatAmount(st.balance, c)}. Please pay or contact ${org.name} to arrange a date.`
          : `Dear ${s.buyerName}, ${formatAmount(pick.row.amount - pick.row.paid, c)} (${pick.row.label}) on ${item} is due on ${dateLabel(pick.row.dueDate)}. Paid to date ${formatAmount(st.paidToDate, c)}. ${org.name}`;
      await queueMessage(ctx, org._id, {
        channel: "preferred",
        name: s.buyerName,
        email: s.buyerEmail,
        phone: s.buyerPhone,
        subject: pick.kind === "overdue" ? `Overdue: ${item}` : `Payment due ${dateLabel(pick.row.dueDate)}: ${item}`,
        body,
        source: "finance",
        kind: pick.kind === "overdue" ? "instalment_overdue" : "instalment_reminder",
        relatedType: "finStand",
        relatedId: s._id,
      });
      await ctx.db.patch(s._id, { remindersSent: [...s.remindersSent, ...markSent] });
    }
  },
});
