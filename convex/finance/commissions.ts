/**
 * Sales commission from SynCRM deals (FN-33, FN-50, FN-51, FN-63).
 *
 * The CRM records each closed deal's commission and the agent split when the
 * deal is won (`dealCommissions`). Finance records the money: commission
 * received (directly, on an invoice, or taken from a sale deposit held in
 * trust) and each agent's share paid out. Nothing is retyped.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserWithOrg } from "../helpers";
import { nameMaps } from "../stay/shared";
import { addDays, formatAmount } from "../stay/ledger";
import {
  categoryByKey,
  ensureAccount,
  financeAudit,
  financeOn,
  getAccount,
  ledgerBalance,
  nextNumber,
  postTransaction,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
  userLabel,
} from "./core";
import { round2 } from "./lib";
import { finMethod } from "../schemas/finance";
import { createInvoice } from "./invoices";

type Ctx = QueryCtx | MutationCtx;

function currencyOf(dc: Doc<"dealCommissions">): "USD" | "ZiG" {
  return dc.dealCurrency === "ZiG" ? "ZiG" : "USD";
}

export function commissionTotal(dc: Doc<"dealCommissions">): number {
  return round2(dc.commissionAmount ?? dc.propertyAgentAmount + dc.leadAgentAmount + dc.companyAmount);
}

/** Each agent's share of a deal; one row per person even if they hold both roles. */
export function agentShares(dc: Doc<"dealCommissions">): Array<{ userId: Id<"users">; pct: number; amount: number }> {
  const by = new Map<string, { userId: Id<"users">; pct: number; amount: number }>();
  const add = (userId: Id<"users"> | undefined, pct: number, amount: number) => {
    if (!userId || !(amount > 0)) return;
    const row = by.get(userId) ?? { userId, pct: 0, amount: 0 };
    row.pct = round2(row.pct + pct);
    row.amount = round2(row.amount + amount);
    by.set(userId, row);
  };
  add(dc.propertyAgentUserId, dc.propertyAgentPercent, dc.propertyAgentAmount);
  add(dc.leadAgentUserId, dc.leadAgentPercent, dc.leadAgentAmount);
  return [...by.values()];
}

/** Commission received and paid to each agent, from Finance's own records. */
async function moneyFor(ctx: Ctx, dcId: Id<"dealCommissions">) {
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_deal_commission", (q) => q.eq("dealCommissionId", dcId))
    .collect();
  let received = 0;
  const paid = new Map<string, number>();
  for (const t of txs) {
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    const agency = round2(lines.filter((l) => l.ledger === "agency").reduce((s, l) => s + l.amount, 0));
    if (t.agentUserId) paid.set(t.agentUserId, round2((paid.get(t.agentUserId) ?? 0) - agency));
    else received = round2(received + agency);
  }
  return { received, paid };
}

async function getDeal(ctx: Ctx, orgId: Id<"organizations">, id: Id<"dealCommissions">) {
  const dc = await ctx.db.get(id);
  if (!dc || dc.orgId !== orgId) throw new ConvexError("Deal commission not found");
  return dc;
}

/**
 * Sales deals a buyer's deposit can be held for (FN-22): buying leads that
 * are not archived, open or won, newest first.
 */
export const saleDeals = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(1000);
    const stages = new Map(
      (await ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).map((s) => [s._id as string, s])
    );
    return leads
      .filter((l) => l.interestType === "buy" && !l.isArchived && stages.get(l.stageId)?.terminalOutcome !== "lost")
      .map((l) => {
        const c = l.dealCurrency ?? l.budgetCurrency;
        return { leadId: l._id, client: l.fullName, stage: stages.get(l.stageId)?.name ?? "", currency: c === "USD" || c === "ZiG" ? c : undefined };
      });
  },
});

/** Closed deals with commission received and what each agent is owed. */
export const deals = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const rows = await ctx.db
      .query("dealCommissions")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(500);
    const leads = await Promise.all(rows.map((r) => ctx.db.get(r.leadId)));
    const names = await nameMaps(ctx, {
      users: rows.flatMap((r) => agentShares(r).map((s) => s.userId)),
      properties: rows.map((r) => r.propertyId).filter((x): x is Id<"properties"> => !!x),
    });
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const dc = rows[i];
      const lead = leads[i];
      const money = await moneyFor(ctx, dc._id);
      const saleHeld = (await ledgerBalance(ctx, access.orgId, "sale", dc.leadId))[currencyOf(dc)] ?? 0;
      const total = commissionTotal(dc);
      out.push({
        _id: dc._id,
        leadId: dc.leadId,
        client: lead?.fullName ?? "Deal",
        property: dc.propertyId ? names.property(dc.propertyId)?.title ?? "" : "",
        closedOn: lead?.closedAt ?? dc.createdAt,
        currency: currencyOf(dc),
        dealValue: dc.dealValue,
        commission: total,
        received: money.received,
        outstanding: round2(total - money.received),
        saleDepositHeld: saleHeld,
        agents: agentShares(dc).map((s) => ({
          userId: s.userId,
          name: userLabel(names.user(s.userId)),
          pct: s.pct,
          amount: s.amount,
          paid: money.paid.get(s.userId) ?? 0,
        })),
        crmStatus: dc.status,
      });
    }
    return out;
  },
});

/** FN-33: commission received for a deal, into the business account. */
export const receive = mutation({
  args: {
    dealCommissionId: v.id("dealCommissions"),
    date: v.string(),
    amount: v.number(),
    accountId: v.optional(v.id("finAccounts")),
    method: finMethod,
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const dc = await getDeal(ctx, access.orgId, args.dealCommissionId);
    const currency = currencyOf(dc);
    const account = args.accountId ? await getAccount(ctx, access.orgId, args.accountId) : await ensureAccount(ctx, access.orgId, args.method === "cash" ? "cash" : "business", currency);
    if (account.currency !== currency) throw new ConvexError(`This deal is in ${currency}`);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    const lead = await ctx.db.get(dc.leadId);
    const number = await nextNumber(ctx, access.orgId, "receipt");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "receipt",
        number,
        description: `Sales commission: ${lead?.fullName ?? "deal"}`,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        contactId: lead?.contactId,
        counterparty: lead?.fullName,
        dealCommissionId: dc._id,
      },
      [
        { currency, amount, accountId: account._id },
        { currency, amount, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "sales_commission") },
      ]
    );
    await financeAudit(ctx, access, { action: "finance.commission_receive", description: `Receipt ${number}: ${formatAmount(amount, currency)} sales commission`, targetType: "dealCommission", targetId: dc._id });
    return txId;
  },
});

/** Take commission out of the buyer's sale deposit held in trust. */
export const takeFromDeposit = mutation({
  args: { dealCommissionId: v.id("dealCommissions"), date: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const dc = await getDeal(ctx, access.orgId, args.dealCommissionId);
    const currency = currencyOf(dc);
    const amount = round2(args.amount);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    const trust = await ensureAccount(ctx, access.orgId, "trust", currency);
    const business = await ensureAccount(ctx, access.orgId, "business", currency);
    const lead = await ctx.db.get(dc.leadId);
    const txId = await postTransaction(
      ctx,
      access,
      { date: args.date, kind: "transfer", description: `Sales commission from deposit: ${lead?.fullName ?? "deal"}`, dealCommissionId: dc._id },
      [
        { currency, amount: -amount, ledger: "sale", key: dc.leadId },
        { currency, amount, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "sales_commission") },
        { currency, amount: -amount, accountId: trust._id },
        { currency, amount, accountId: business._id },
      ]
    );
    await financeAudit(ctx, access, { action: "finance.commission_from_deposit", description: `${formatAmount(amount, currency)} commission taken from sale deposit`, targetType: "dealCommission", targetId: dc._id });
    return txId;
  },
});

/** FN-51: pay an agent their share. */
export const payAgent = mutation({
  args: {
    dealCommissionId: v.id("dealCommissions"),
    agentUserId: v.id("users"),
    date: v.string(),
    amount: v.number(),
    accountId: v.optional(v.id("finAccounts")),
    method: finMethod,
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const dc = await getDeal(ctx, access.orgId, args.dealCommissionId);
    const share = agentShares(dc).find((s) => s.userId === args.agentUserId);
    if (!share) throw new ConvexError("That agent has no share in this deal");
    const currency = currencyOf(dc);
    const amount = round2(args.amount);
    const money = await moneyFor(ctx, dc._id);
    const owed = round2(share.amount - (money.paid.get(share.userId) ?? 0));
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    if (amount > owed) throw new ConvexError(`Only ${formatAmount(owed, currency)} is owed to this agent`);
    const account = args.accountId ? await getAccount(ctx, access.orgId, args.accountId) : await ensureAccount(ctx, access.orgId, args.method === "cash" ? "cash" : "business", currency);
    if (account.currency !== currency) throw new ConvexError(`This deal is in ${currency}`);
    const agent = await ctx.db.get(share.userId);
    const number = await nextNumber(ctx, access.orgId, "payment");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "payment",
        number,
        description: `Commission share to ${userLabel(agent)}`,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        counterparty: userLabel(agent),
        dealCommissionId: dc._id,
        agentUserId: share.userId,
      },
      [
        { currency, amount: -amount, accountId: account._id },
        { currency, amount: -amount, ledger: "agency", categoryId: await categoryByKey(ctx, access.orgId, "agent_commission") },
      ]
    );
    // Keep the CRM's status in step once every agent is paid in full.
    const after = await moneyFor(ctx, dc._id);
    if (agentShares(dc).every((s) => (after.paid.get(s.userId) ?? 0) >= s.amount)) await ctx.db.patch(dc._id, { status: "paid" });
    await financeAudit(ctx, access, { action: "finance.agent_paid", description: `Payment ${number}: ${formatAmount(amount, currency)} to ${userLabel(agent)}`, targetType: "dealCommission", targetId: dc._id });
    return txId;
  },
});

/** FN-63: a commission invoice for a deal in one click, to the deal's client. */
export const invoiceDeal = mutation({
  args: { dealCommissionId: v.id("dealCommissions") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const dc = await getDeal(ctx, access.orgId, args.dealCommissionId);
    const lead = await ctx.db.get(dc.leadId);
    const property = dc.propertyId ? await ctx.db.get(dc.propertyId) : null;
    const today = await todayForOrg(ctx, access.orgId);
    return createInvoice(ctx, access, {
      contactId: lead?.contactId,
      clientName: lead?.fullName ?? "",
      date: today,
      dueDate: addDays(today, 7),
      currency: currencyOf(dc),
      lines: [
        {
          description: `Sales commission${property ? ` on ${property.title}` : ""}`,
          quantity: 1,
          unitPrice: commissionTotal(dc),
          categoryId: await categoryByKey(ctx, access.orgId, "sales_commission"),
        },
      ],
      dealCommissionId: dc._id,
    });
  },
});

/**
 * An agent's own commission statement (BRD §4, §6): deals closed, commission
 * earned, their split, paid and unpaid. Any staff user, for themselves only.
 * Without Sync Finance "paid" follows the CRM's status.
 */
export const myStatement = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUserWithOrg(ctx);
    const org = await ctx.db.get(me.orgId);
    const withFinance = financeOn(org);
    const [asProperty, asLead] = await Promise.all([
      ctx.db.query("dealCommissions").withIndex("by_property_agent", (q) => q.eq("propertyAgentUserId", me._id)).collect(),
      ctx.db.query("dealCommissions").withIndex("by_lead_agent", (q) => q.eq("leadAgentUserId", me._id)).collect(),
    ]);
    const all = new Map([...asProperty, ...asLead].filter((d) => d.orgId === me.orgId).map((d) => [d._id as string, d]));
    const names = await nameMaps(ctx, { properties: [...all.values()].map((d) => d.propertyId).filter((x): x is Id<"properties"> => !!x) });
    const rows = [];
    for (const dc of all.values()) {
      const share = agentShares(dc).find((s) => s.userId === me._id);
      if (!share) continue;
      const lead = await ctx.db.get(dc.leadId);
      const paid = withFinance ? (await moneyFor(ctx, dc._id)).paid.get(me._id) ?? 0 : dc.status === "paid" ? share.amount : 0;
      rows.push({
        _id: dc._id,
        client: lead?.fullName ?? "Deal",
        property: dc.propertyId ? names.property(dc.propertyId)?.title ?? "" : "",
        closedOn: lead?.closedAt ?? dc.createdAt,
        currency: currencyOf(dc),
        dealValue: dc.dealValue,
        commission: commissionTotal(dc),
        pct: share.pct,
        amount: share.amount,
        paid,
        unpaid: round2(share.amount - paid),
      });
    }
    return { name: userLabel(me), withFinance, rows: rows.sort((a, b) => b.closedOn - a.closedOn) };
  },
});
