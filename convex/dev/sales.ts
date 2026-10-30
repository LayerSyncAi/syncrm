/**
 * Developments and stand sales on payment plans (Finance BRD 5.10).
 *
 * A development says who holds the money: the developer (our client, or the
 * agency is the developer) or the agency, in trust, for a developer it sells
 * for. A sale carries the buyer's plan. Payments are allocated oldest
 * instalment first, and the sale keeps paid to date, balance, overdue and
 * next due up to date for lists and reminders.
 *
 * Works with SyncDev, SyncFinance or both:
 *  - With Finance, a payment is a ledger receipt (trust, commission, payouts).
 *  - Without it, SyncDev records the payment itself (devPayments). Finance
 *    can bring those in later (finance/posting:bringInDevPayments).
 *
 * Interest is optional per development and only charged when staff run it.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { agencyOf, allocateReceiptNumber, todayForOrg } from "../stay/shared";
import { dateLabel, formatAmount, isValidDate, isValidPeriod } from "../stay/ledger";
import { getSettings, nextNumber } from "../finance/core";
import { buildPlan, monthlyInterest, pickReminder, planState, round2, standRemindersDue } from "../finance/lib";
import { finCurrency, finMethod } from "../schemas/finance";
import { documentEmail, queueDocumentEmail } from "../finance/emails";
import { standStatementDocument } from "../finance/documents";
import { postFullyPaidCommission, postStandReceipt, postStandRefund } from "../finance/posting";
import { queueMessage } from "../notify/send";
import { orgModules } from "../lib/modules";
import { SalesAccess, devAudit, getDevelopment, requireManage, requireSales } from "./access";
import { effectiveStatus } from "./lib";

type Ctx = QueryCtx | MutationCtx;

async function getSale(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finStands">) {
  const s = await ctx.db.get(id);
  if (!s || s.orgId !== orgId) throw new ConvexError("Sale not found");
  return s;
}

/**
 * Every payment and refund on a sale, from both places a payment can live:
 * Finance receipts and SyncDev's own records. A Dev payment brought into
 * Finance is counted once, as the Finance receipt.
 */
async function moneyOn(ctx: Ctx, standId: Id<"finStands">) {
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_stand", (q) => q.eq("standId", standId))
    .collect();
  const payments: Array<{ _id: string; source: "finance" | "dev"; date: string; number: string; method: string; reference: string; amount: number; reversed: boolean; isReversal: boolean }> = [];
  const refunds: Array<{ _id: string; source: "finance" | "dev"; date: string; number: string; amount: number }> = [];
  for (const t of txs) {
    if (t.kind !== "receipt" && t.kind !== "payment") continue;
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    const moved = round2(lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0));
    if (t.kind === "receipt") {
      payments.push({ _id: t._id, source: "finance", date: t.date, number: t.number ?? "", method: t.method ?? "", reference: t.reference ?? "", amount: moved, reversed: !!t.reversedAt, isReversal: !!t.reversalOfId });
    } else {
      refunds.push({ _id: t._id, source: "finance", date: t.date, number: t.number ?? "", amount: -moved });
    }
  }
  const devPays = await ctx.db
    .query("devPayments")
    .withIndex("by_stand", (q) => q.eq("standId", standId))
    .collect();
  for (const p of devPays) {
    if (p.finTxId) continue;
    if (p.kind === "receipt") {
      payments.push({ _id: p._id, source: "dev", date: p.date, number: p.number, method: p.method, reference: p.reference ?? "", amount: p.reversedAt ? 0 : p.amount, reversed: !!p.reversedAt, isReversal: false });
    } else if (!p.reversedAt) {
      refunds.push({ _id: p._id, source: "dev", date: p.date, number: p.number, amount: p.amount });
    }
  }
  // By date, then receipt number, so a day's payments read in the order taken.
  const byDate = (a: { date: string; number: string }, b: { date: string; number: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.number.localeCompare(b.number, undefined, { numeric: true });
  payments.sort(byDate);
  refunds.sort(byDate);
  const received = round2(payments.reduce((a, p) => a + p.amount, 0));
  const refunded = round2(refunds.reduce((a, r) => a + r.amount, 0));
  return { payments, refunds, received, refunded };
}

/** A cancelled sale owes nothing: no balance, nothing overdue, nothing next. */
function cancelledState<T extends { balance: number; overdue: number; nextDueDate?: string; nextDueAmount?: number }>(status: string, st: T): T {
  return status === "cancelled" ? { ...st, balance: 0, overdue: 0, nextDueDate: undefined, nextDueAmount: undefined } : st;
}

/** FN-91: re-allocate everything paid and store the result on the sale. */
export async function recomputeStand(ctx: MutationCtx, standId: Id<"finStands">) {
  const s = await ctx.db.get(standId);
  if (!s) return null;
  const today = await todayForOrg(ctx, s.orgId);
  const paid = round2(s.openingPaid + (await moneyOn(ctx, s._id)).received);
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
  location: v.optional(v.string()),
  notes: v.optional(v.string()),
  developerContactId: v.optional(v.id("contacts")),
  // Blank when the agency is the developer: its own name is used.
  developerName: v.optional(v.string()),
  developerEmail: v.optional(v.string()),
  moneyHeldBy: v.union(v.literal("developer"), v.literal("agency_trust")),
  commissionPct: v.optional(v.number()),
  commissionTiming: v.optional(v.union(v.literal("each_payment"), v.literal("fully_paid"))),
  interestPctPerMonth: v.optional(v.number()),
  currency: finCurrency,
};

type DevelopmentInput = {
  name: string;
  location?: string;
  notes?: string;
  developerContactId?: Id<"contacts">;
  developerName?: string;
  developerEmail?: string;
  moneyHeldBy: "developer" | "agency_trust";
  commissionPct?: number;
  commissionTiming?: "each_payment" | "fully_paid";
  interestPctPerMonth?: number;
  currency: "USD" | "ZiG";
};

function cleanDevelopment(a: DevelopmentInput, org: Doc<"organizations">) {
  const name = a.name.trim();
  if (!name) throw new ConvexError("Name the development");
  const commissionPct = a.commissionPct ?? 0;
  if (!(commissionPct >= 0 && commissionPct <= 100)) throw new ConvexError("Commission must be between 0 and 100%");
  if (a.interestPctPerMonth !== undefined && !(a.interestPctPerMonth >= 0 && a.interestPctPerMonth <= 20)) {
    throw new ConvexError("Interest must be between 0 and 20% a month");
  }
  return {
    name,
    location: a.location?.trim() || undefined,
    notes: a.notes?.trim() || undefined,
    developerContactId: a.developerContactId,
    developerName: a.developerName?.trim() || org.name,
    developerEmail: a.developerEmail?.trim() || undefined,
    moneyHeldBy: a.moneyHeldBy,
    commissionPct,
    commissionTiming: a.commissionTiming ?? ("each_payment" as const),
    interestPctPerMonth: a.interestPctPerMonth || undefined,
    currency: a.currency,
  };
}

export const createDevelopment = mutation({
  args: developmentArgs,
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const fields = cleanDevelopment(args, access.org);
    const now = Date.now();
    const id = await ctx.db.insert("finDevelopments", { ...fields, isActive: true, orgId: access.orgId, createdAt: now, updatedAt: now });
    await devAudit(ctx, access, { action: "dev.development_create", description: `Added development ${fields.name}`, targetType: "finDevelopment", targetId: id });
    return id;
  },
});

export const updateDevelopment = mutation({
  args: { developmentId: v.id("finDevelopments"), isActive: v.boolean(), ...developmentArgs },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const d = await getDevelopment(ctx, access.orgId, args.developmentId);
    const { developmentId, isActive, ...rest } = args;
    void developmentId;
    const fields = cleanDevelopment(rest, access.org);
    // Currency and who holds the money decide where past payments went.
    const sold = await ctx.db
      .query("finStands")
      .withIndex("by_development", (q) => q.eq("developmentId", d._id))
      .first();
    if (sold && (fields.currency !== d.currency || fields.moneyHeldBy !== d.moneyHeldBy)) {
      throw new ConvexError("This development has sales. Its currency and who holds the money can no longer change.");
    }
    await ctx.db.patch(d._id, { ...fields, isActive, updatedAt: Date.now() });
    await devAudit(ctx, access, { action: "dev.development_update", description: `Updated development ${fields.name}`, targetType: "finDevelopment", targetId: d._id });
  },
});

/** Developments with their inventory and money at a glance. */
export const listDevelopments = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireSales(ctx);
    const devs = await ctx.db
      .query("finDevelopments")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    const today = await todayForOrg(ctx, access.orgId);
    const out = [];
    for (const d of devs) {
      const [sales, stands] = await Promise.all([
        ctx.db.query("finStands").withIndex("by_development", (q) => q.eq("developmentId", d._id)).collect(),
        ctx.db.query("devStands").withIndex("by_development", (q) => q.eq("developmentId", d._id)).collect(),
      ]);
      const live = sales.filter((s) => s.status !== "cancelled");
      out.push({
        ...d,
        stands: stands.length,
        // A reservation past its date counts as available, as on the grid.
        available: stands.filter((s) => effectiveStatus(s, today) === "available").length,
        reserved: stands.filter((s) => effectiveStatus(s, today) === "reserved").length,
        sold: live.length,
        contracted: round2(live.reduce((s, x) => s + x.price, 0)),
        collected: round2(live.reduce((s, x) => s + x.paidToDate, 0)),
        outstanding: round2(live.reduce((s, x) => s + x.balance, 0)),
        overdue: round2(live.reduce((s, x) => s + x.overdue, 0)),
        overdueBuyers: live.filter((s) => s.overdue > 0).length,
      });
    }
    return out.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  },
});

// ── Sales (buyer plans) ──────────────────────────────────────────────

/**
 * Create a sale. Keeps the inventory in step whichever screen it came from:
 * the stand is marked sold, and added to the inventory if it was not there.
 */
export async function insertStand(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
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
  const sales = await ctx.db
    .query("finStands")
    .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
    .collect();
  if (sales.some((s) => s.status !== "cancelled" && s.standNumber.toLowerCase() === standNumber.toLowerCase())) {
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
  // The inventory stand: sold, linked both ways.
  const inventory = (
    await ctx.db
      .query("devStands")
      .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
      .collect()
  ).find((s) => s.number.toLowerCase() === standNumber.toLowerCase());
  let devStandId = inventory?._id;
  if (inventory) {
    await ctx.db.patch(inventory._id, { status: "sold", saleId: id, reservedFor: undefined, updatedAt: now });
  } else {
    devStandId = await ctx.db.insert("devStands", { orgId: access.orgId, developmentId: dev._id, number: standNumber, price, status: "sold", saleId: id, createdAt: now, updatedAt: now });
  }
  await ctx.db.patch(id, { devStandId });
  await recomputeStand(ctx, id);
  return id;
}

/**
 * A buyer as a Hub contact, so the CRM, Notify and statements all know them.
 * Matches an existing contact by phone or email before creating one.
 */
export async function upsertBuyer(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
  b: { contactId?: Id<"contacts">; name: string; email?: string; phone?: string }
): Promise<Id<"contacts"> | undefined> {
  if (b.contactId) return b.contactId;
  const name = b.name.trim();
  if (!name) return undefined;
  const email = b.email?.trim().toLowerCase();
  const phoneDigits = b.phone?.replace(/\D/g, "") ?? "";
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
    .collect();
  const match = contacts.find(
    (c) => (email && c.email?.trim().toLowerCase() === email) || (phoneDigits.length >= 9 && (c.normalizedPhone ?? c.phone?.replace(/\D/g, "") ?? "").endsWith(phoneDigits.slice(-9)))
  );
  if (match) return match._id;
  const now = Date.now();
  return ctx.db.insert("contacts", {
    name,
    email: b.email?.trim() || undefined,
    phone: b.phone?.trim() || undefined,
    normalizedPhone: phoneDigits || undefined,
    isBuyerTenant: false,
    entityKind: "individual",
    ownerUserIds: [access.user._id],
    createdByUserId: access.user._id,
    orgId: access.orgId,
    createdAt: now,
    updatedAt: now,
  });
}

const planArg = v.optional(v.object({ deposit: v.number(), depositDue: v.string(), count: v.number(), firstDue: v.string() }));
const scheduleArg = v.optional(v.array(v.object({ dueDate: v.string(), amount: v.number(), label: v.string() })));

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
    plan: planArg,
    // ...or rows typed in.
    schedule: scheduleArg,
  },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const { plan, schedule, ...rest } = args;
    const rows = schedule ?? (plan ? buildPlan(args.price, plan.deposit, plan.depositDue, plan.count, plan.firstDue) : []);
    const buyerContactId = await upsertBuyer(ctx, access, { contactId: args.buyerContactId, name: args.buyerName, email: args.buyerEmail, phone: args.buyerPhone });
    const id = await insertStand(ctx, access, { ...rest, buyerContactId, schedule: rows });
    await devAudit(ctx, access, { action: "dev.sale_create", description: `Stand ${args.standNumber.trim()} sold to ${args.buyerName.trim()}`, targetType: "finStand", targetId: id });
    return id;
  },
});

/** Mark a sale cancelled and put its stand back on the market. */
export async function cancelSale(ctx: MutationCtx, s: Doc<"finStands">) {
  await ctx.db.patch(s._id, { status: "cancelled", updatedAt: Date.now() });
  await recomputeStand(ctx, s._id);
  if (s.devStandId) {
    const stand = await ctx.db.get(s.devStandId);
    if (stand && stand.saleId === s._id) await ctx.db.patch(stand._id, { status: "available", saleId: undefined, updatedAt: Date.now() });
  }
}

/** Cancel a sale. The stand goes back on the market; what was paid can be refunded. */
export const cancelStand = mutation({
  args: { standId: v.id("finStands"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getSale(ctx, access.orgId, args.standId);
    if (s.status === "cancelled") throw new ConvexError("This sale is already cancelled");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    await cancelSale(ctx, s);
    await devAudit(ctx, access, { action: "dev.sale_cancel", description: `Cancelled stand ${s.standNumber} (${s.buyerName}): ${reason}`, targetType: "finStand", targetId: s._id });
  },
});

const methodArgs = {
  date: v.string(),
  amount: v.number(),
  method: finMethod,
  // Only with SyncFinance: the bank or cash account.
  accountId: v.optional(v.id("finAccounts")),
  reference: v.optional(v.string()),
};

/**
 * FN-97: pay back what a buyer paid on a cancelled sale. With Finance it
 * comes out of the ledger the money went into; without, it is recorded here.
 */
export const refundStand = mutation({
  args: { standId: v.id("finStands"), ...methodArgs },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getSale(ctx, access.orgId, args.standId);
    if (s.status !== "cancelled") throw new ConvexError("Cancel the sale before refunding the buyer");
    const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    if (!isValidDate(args.date)) throw new ConvexError("Enter a valid date");
    const money = await moneyOn(ctx, s._id);
    const available = round2(money.received - money.refunded);
    if (amount > available) throw new ConvexError(`Only ${formatAmount(available, s.currency)} received since go-live can be refunded`);
    const number = await nextNumber(ctx, access.orgId, "payment");
    if (access.financeOn) {
      await postStandRefund(ctx, access, s, dev, { ...args, amount, number });
    } else {
      await ctx.db.insert("devPayments", {
        orgId: access.orgId,
        standId: s._id,
        kind: "refund",
        number,
        date: args.date,
        amount,
        currency: s.currency,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        createdByUserId: access.user._id,
        createdAt: Date.now(),
      });
    }
    await devAudit(ctx, access, {
      action: "dev.sale_refund",
      description: `${number}: refunded ${formatAmount(amount, s.currency)} to ${s.buyerName} (stand ${s.standNumber})`,
      targetType: "finStand",
      targetId: s._id,
      targetLabel: number,
    });
    return { number };
  },
});

/**
 * FN-90: take a payment on a sale. With SyncFinance it is a ledger receipt
 * (trust, commission); without, SyncDev records it. Either way it gets the
 * agency's next receipt number and the buyer an updated statement.
 */
export const receivePayment = mutation({
  args: { standId: v.id("finStands"), ...methodArgs, emailStatement: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getSale(ctx, access.orgId, args.standId);
    if (s.status === "cancelled") throw new ConvexError("This sale is cancelled");
    const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    if (!isValidDate(args.date)) throw new ConvexError("Enter a valid date");
    if (args.date > (await todayForOrg(ctx, access.orgId))) throw new ConvexError("The date cannot be in the future");
    const number = await allocateReceiptNumber(ctx, access.orgId);
    let txId: Id<"finTransactions"> | undefined;
    if (access.financeOn) {
      txId = (await postStandReceipt(ctx, access, s, dev, { ...args, amount, number })).txId;
    } else {
      await ctx.db.insert("devPayments", {
        orgId: access.orgId,
        standId: s._id,
        kind: "receipt",
        number,
        date: args.date,
        amount,
        currency: s.currency,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        createdByUserId: access.user._id,
        createdAt: Date.now(),
      });
    }
    const st = await recomputeStand(ctx, s._id);
    // Commission earned once the stand is fully paid: on the full price.
    if (access.financeOn && dev.moneyHeldBy === "agency_trust" && dev.commissionTiming === "fully_paid" && st && st.balance <= 0 && !s.commissionMoved) {
      await postFullyPaidCommission(ctx, access, s, dev, args.date);
      await ctx.db.patch(s._id, { commissionMoved: true });
    }
    await devAudit(ctx, access, {
      action: "dev.payment",
      description: `Receipt ${number}: ${formatAmount(amount, s.currency)} for stand ${s.standNumber} from ${s.buyerName}`,
      targetType: "finStand",
      targetId: s._id,
      targetLabel: number,
    });
    if (args.emailStatement !== false) await emailStatement(ctx, access, s._id);
    // The ledger receipt, when SyncFinance posted it.
    return { number, txId };
  },
});

/** Reverse a payment SyncDev recorded (Finance receipts are reversed in Finance). */
export const reverseDevPayment = mutation({
  args: { paymentId: v.id("devPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    if (!access.canReverse) throw new ConvexError("Only a director or accounts can reverse a payment");
    const p = await ctx.db.get(args.paymentId);
    if (!p || p.orgId !== access.orgId) throw new ConvexError("Payment not found");
    if (p.reversedAt) throw new ConvexError("Already reversed");
    if (p.finTxId) throw new ConvexError("This payment is now in SyncFinance. Reverse it there.");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    await ctx.db.patch(p._id, { reversedAt: Date.now(), reversedByUserId: access.user._id, reverseReason: reason });
    await recomputeStand(ctx, p.standId);
    await devAudit(ctx, access, { action: "dev.payment_reverse", description: `Reversed ${p.number}: ${reason}`, targetType: "devPayment", targetId: p._id, targetLabel: p.number });
  },
});

/** Every buyer on a plan, with what they paid and owe. */
export const listStands = query({
  args: { developmentId: v.optional(v.id("finDevelopments")), overdueOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
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
async function statementData(ctx: Ctx, access: { orgId: Id<"organizations">; org: Doc<"organizations"> }, s: Doc<"finStands">) {
  const dev = await getDevelopment(ctx, access.orgId, s.developmentId);
  const today = await todayForOrg(ctx, access.orgId);
  const money = await moneyOn(ctx, s._id);
  const paid = round2(s.openingPaid + money.received);
  const st = cancelledState(s.status, planState(s.schedule, paid, today));
  const deposit = s.schedule.find((r) => r.label.toLowerCase() === "deposit")?.amount ?? 0;
  return {
    agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
    stand: { _id: s._id, standNumber: s.standNumber, status: s.status, currency: s.currency, price: s.price, deposit, openingPaid: s.openingPaid, devStandId: s.devStandId ?? null },
    development: { _id: dev._id, name: dev.name, developerName: dev.developerName, moneyHeldBy: dev.moneyHeldBy, interestPctPerMonth: dev.interestPctPerMonth ?? 0 },
    buyer: { name: s.buyerName, email: s.buyerEmail ?? "", phone: s.buyerPhone ?? "", contactId: s.buyerContactId ?? null },
    interest: round2(s.schedule.filter((r) => r.kind === "interest").reduce((a, r) => a + r.amount, 0)),
    today,
    ...st,
    payments: money.payments,
    refunds: money.refunds,
    // Received since go-live and not yet paid back (FN-97).
    refundable: round2(Math.max(0, money.received - money.refunded)),
  };
}

export const getStandStatement = query({
  args: { standId: v.id("finStands") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    const s = await ctx.db.get(args.standId);
    if (!s || s.orgId !== access.orgId) return null;
    return {
      ...(await statementData(ctx, access, s)),
      role: { canManage: access.canManage, canReverse: access.canReverse, financeOn: access.financeOn, devOn: access.devOn },
    };
  },
});

async function emailStatement(ctx: MutationCtx, access: Pick<SalesAccess, "orgId" | "org" | "user">, standId: Id<"finStands">) {
  const s = await getSale(ctx, access.orgId, standId);
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
        body: d.payments.filter((p) => !p.reversed).map((p) => [dateLabel(p.date), p.number, formatAmount(p.amount, c)]),
      },
      items: [
        ["Price", formatAmount(s.price, c)],
        ...(d.interest > 0 ? ([["Interest charged", formatAmount(d.interest, c)]] as Array<[string, string]>) : []),
        ["Paid to date", formatAmount(d.paidToDate, c)],
        ["Balance", formatAmount(d.balance, c)],
        ["Overdue", formatAmount(d.overdue, c)],
        ...(d.nextDueDate ? ([["Next payment", `${formatAmount(d.nextDueAmount ?? 0, c)} on ${dateLabel(d.nextDueDate)}`]] as Array<[string, string]>) : []),
      ],
      kind: "dev_stand_statement",
      relatedType: "finStand",
      relatedId: s._id,
    }),
    standStatementDocument({ ...d, payments: d.payments.filter((p) => !p.reversed) }),
    access.user._id
  );
}

export const emailStandStatement = mutation({
  args: { standId: v.id("finStands") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    if (!(await emailStatement(ctx, access, args.standId))) throw new ConvexError("The buyer has no email address");
  },
});

/**
 * Charge one month's interest on every overdue plan in developments that
 * charge interest. Once per sale per month; dated today.
 */
export const chargeInterest = mutation({
  args: { month: v.string(), developmentId: v.optional(v.id("finDevelopments")) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    if (!isValidPeriod(args.month)) throw new ConvexError("Pick a month");
    const today = await todayForOrg(ctx, access.orgId);
    const devs = (await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).filter(
      (d) => (d.interestPctPerMonth ?? 0) > 0 && (!args.developmentId || d._id === args.developmentId)
    );
    let charged = 0;
    let total = 0;
    for (const d of devs) {
      const sales = await ctx.db
        .query("finStands")
        .withIndex("by_development", (q) => q.eq("developmentId", d._id))
        .collect();
      for (const s of sales) {
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
    await devAudit(ctx, access, {
      action: "dev.interest",
      description: `Charged interest for ${args.month} on ${charged} overdue plans`,
      targetType: "organization",
      targetId: access.orgId,
      metadata: { charged, total },
    });
    return { charged };
  },
});

/**
 * FN-96: per development, stands sold, contracted, collected, outstanding,
 * overdue by buyer. Commission, payouts and money held need SyncFinance.
 */
export const developerReport = query({
  args: { developmentId: v.id("finDevelopments") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    const dev = await getDevelopment(ctx, access.orgId, args.developmentId);
    const sales = (
      await ctx.db
        .query("finStands")
        .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
        .collect()
    ).filter((s) => s.status !== "cancelled");
    let commission = 0;
    let paidOut = 0;
    let held = 0;
    if (access.financeOn) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_org_ledger_key", (q) => q.eq("orgId", access.orgId).eq("ledger", "developer").eq("key", dev._id))
        .collect();
      for (const l of lines) {
        const t = await ctx.db.get(l.txId);
        // Net of reversals: a reversed payout or commission adds back.
        if (t?.payoutId) paidOut = round2(paidOut - l.amount);
        else if (t?.kind === "transfer") commission = round2(commission - l.amount);
      }
      held = round2(lines.reduce((s, l) => s + l.amount, 0));
    }
    return {
      agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
      development: dev,
      financeOn: access.financeOn,
      sold: sales.length,
      contracted: round2(sales.reduce((s, x) => s + x.price, 0)),
      collected: round2(sales.reduce((s, x) => s + x.paidToDate, 0)),
      outstanding: round2(sales.reduce((s, x) => s + x.balance, 0)),
      overdue: round2(sales.reduce((s, x) => s + x.overdue, 0)),
      commission,
      paidOut,
      held,
      buyers: sales
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
      const mods = orgModules(org);
      if (org.deletingAt || (!mods.includes("finance") && !mods.includes("dev"))) continue;
      await ctx.scheduler.runAfter(0, internal.dev.sales.runForOrg, { orgId: org._id });
    }
  },
});

export const runForOrg = internalMutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) return;
    const settings = await getSettings(ctx, org._id);
    const today = await todayForOrg(ctx, org._id);
    const devs = new Map((await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", org._id)).collect()).map((d) => [d._id as string, d]));
    // Reservations past their date go back on the market.
    const reserved = (
      await ctx.db
        .query("devStands")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect()
    ).filter((s) => s.status === "reserved" && s.reservedFor?.until && s.reservedFor.until < today);
    for (const s of reserved) await ctx.db.patch(s._id, { status: "available", reservedFor: undefined, updatedAt: Date.now() });
    const sales = await ctx.db
      .query("finStands")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .collect();
    for (const s of sales) {
      if (s.status !== "active") continue;
      const st = await recomputeStand(ctx, s._id);
      if (!st || (!s.buyerEmail && !s.buyerPhone)) continue;
      const due = standRemindersDue(st.rows, today, settings.standReminderDays, s.remindersSent);
      if (!due.length) continue;
      // One message per sale per day: the most pressing reminder, sent on
      // the agency's preferred channel through SyncNotify.
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
        source: "dev",
        kind: pick.kind === "overdue" ? "instalment_overdue" : "instalment_reminder",
        relatedType: "finStand",
        relatedId: s._id,
      });
      await ctx.db.patch(s._id, { remindersSent: [...s.remindersSent, ...markSent] });
    }
  },
});
