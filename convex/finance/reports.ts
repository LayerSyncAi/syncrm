/**
 * Finance dashboard (BRD §6) and reports. Every figure is summed from ledger
 * lines, so the dashboard, statements and reports always agree.
 *
 * Reports return rows; the app shows them and exports them to Excel, which
 * is also how the year-end auditor pack and the accounting export are built.
 */
import { ConvexError, v } from "convex/values";
import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserOptional, getEffectiveOrgId } from "../helpers";
import { HubFigure, userCanUseModule } from "../lib/modules";
import { ageBucket, addDays, daysBetween, formatTotals, isValidDate, outstanding, periodRange } from "../stay/ledger";
import { METHOD_LABELS } from "../stay/validators";
import {
  accountBalance,
  ledgerBalances,
  listAccounts,
  listCategories,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
  userLabel,
} from "./core";
import { CLIENT_LEDGERS, FinCurrency, LEDGER_LABELS, round2 } from "./lib";
import { nameMaps } from "../stay/shared";

const INCOME_KEYS = ["management_fee", "sales_commission", "stand_commission", "lease_admin_fee"];

function addC(t: Partial<Record<FinCurrency, number>>, c: FinCurrency, n: number) {
  t[c] = round2((t[c] ?? 0) + n);
}

async function txMap(ctx: QueryCtx, ids: Id<"finTransactions">[]) {
  const uniq = [...new Set(ids)];
  const docs = await Promise.all(uniq.map((id) => ctx.db.get(id)));
  return new Map(uniq.map((id, i) => [id as string, docs[i]]));
}

/** Lines in a date range for one ledger. */
async function ledgerLinesIn(ctx: QueryCtx, orgId: Id<"organizations">, ledger: Doc<"finLines">["ledger"], from: string, to: string) {
  return ctx.db
    .query("finLines")
    .withIndex("by_org_ledger_date", (q) => q.eq("orgId", orgId).eq("ledger", ledger).gte("date", from).lte("date", to))
    .collect();
}

// ── Dashboard ────────────────────────────────────────────────────────

export const dashboard = query({
  args: { range: v.union(v.literal("week"), v.literal("month")) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const today = await todayForOrg(ctx, access.orgId);
    // Weeks start on Monday.
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const from = args.range === "week" ? addDays(today, -dow) : periodRange(today.slice(0, 7)).from;
    const accounts = (await listAccounts(ctx, access.orgId)).filter((a) => a.isActive);
    const perAccount = [];
    for (const a of accounts) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_account_date", (q) => q.eq("accountId", a._id).gte("date", from).lte("date", today))
        .collect();
      const txs = await txMap(ctx, lines.map((l) => l.txId));
      let moneyIn = 0;
      let moneyOut = 0;
      for (const l of lines) {
        if (l.date < from || l.date > today) continue;
        const kind = txs.get(l.txId)?.kind;
        if (kind === "transfer" || kind === "opening") continue;
        if (l.amount > 0) moneyIn = round2(moneyIn + l.amount);
        else moneyOut = round2(moneyOut - l.amount);
      }
      perAccount.push({ _id: a._id, name: a.name, type: a.type, currency: a.currency, moneyIn, moneyOut, balance: await accountBalance(ctx, a._id) });
    }

    const held: Partial<Record<FinCurrency, number>> = {};
    for (const l of CLIENT_LEDGERS) {
      for (const t of (await ledgerBalances(ctx, access.orgId, l)).values()) for (const c of ["USD", "ZiG"] as const) if (t[c]) addC(held, c, t[c]!);
    }
    const payoutsDue: Partial<Record<FinCurrency, number>> = {};
    for (const t of (await ledgerBalances(ctx, access.orgId, "landlord")).values()) for (const c of ["USD", "ZiG"] as const) if ((t[c] ?? 0) > 0) addC(payoutsDue, c, t[c]!);

    const cats = await listCategories(ctx, access.orgId);
    const earningIds = new Set(cats.filter((c) => c.key && INCOME_KEYS.includes(c.key)).map((c) => c._id as string));
    const commission: Partial<Record<FinCurrency, number>> = {};
    for (const l of await ledgerLinesIn(ctx, access.orgId, "agency", from, today)) {
      if (l.categoryId && earningIds.has(l.categoryId)) addC(commission, l.currency, l.amount);
    }

    const invoices = (
      await Promise.all(
        (["unpaid", "part_paid"] as const).map((s) =>
          ctx.db
            .query("finInvoices")
            .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", s))
            .collect()
        )
      )
    ).flat();
    const unpaid: Partial<Record<FinCurrency, number>> = {};
    for (const i of invoices) addC(unpaid, i.currency, i.total - i.amountPaid);

    const arrears: Partial<Record<FinCurrency, number>> = {};
    for (const s of ["unpaid", "part_paid"] as const) {
      const charges = await ctx.db
        .query("stayCharges")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", s))
        .collect();
      for (const c of charges) if (c.dueDate <= today) addC(arrears, c.currency, outstanding(c));
    }

    const prepared = await ctx.db
      .query("finPayouts")
      .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", "prepared"))
      .collect();

    return {
      from,
      to: today,
      accounts: perAccount,
      totals: {
        moneyIn: formatTotals(perAccount.reduce((t, a) => (addC(t, a.currency, a.moneyIn), t), {} as Partial<Record<FinCurrency, number>>)),
        moneyOut: formatTotals(perAccount.reduce((t, a) => (addC(t, a.currency, a.moneyOut), t), {} as Partial<Record<FinCurrency, number>>)),
        balance: formatTotals(perAccount.reduce((t, a) => (addC(t, a.currency, a.balance), t), {} as Partial<Record<FinCurrency, number>>)),
      },
      heldInTrust: formatTotals(held),
      commissionEarned: formatTotals(commission),
      payoutsDue: formatTotals(payoutsDue),
      payoutsAwaitingApproval: prepared.length,
      unpaidInvoices: { count: invoices.length, total: formatTotals(unpaid) },
      tenantArrears: formatTotals(arrears),
    };
  },
});

/** Headline figures for the Hub director dashboard. Null when not available. */
export const hubSummary = query({
  args: {},
  handler: async (ctx): Promise<HubFigure[] | null> => {
    const me = await getCurrentUserOptional(ctx);
    if (!me) return null;
    const orgId = getEffectiveOrgId(me);
    if (!orgId) return null;
    const org = await ctx.db.get(orgId);
    const viewer = me.orgId ? me : { ...me, role: "admin" as const };
    if (!org || !userCanUseModule(viewer, org, "finance")) return null;
    if (viewer.role !== "admin" && !(viewer.estateRoles ?? []).includes("accounts")) return null;
    const today = await todayForOrg(ctx, orgId);
    const { from } = periodRange(today.slice(0, 7));
    const accounts = await listAccounts(ctx, orgId);
    const moneyIn: Partial<Record<FinCurrency, number>> = {};
    const moneyOut: Partial<Record<FinCurrency, number>> = {};
    for (const a of accounts) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_account_date", (q) => q.eq("accountId", a._id).gte("date", from))
        .collect();
      const txs = await txMap(ctx, lines.map((l) => l.txId));
      for (const l of lines) {
        const kind = txs.get(l.txId)?.kind;
        if (kind === "transfer" || kind === "opening") continue;
        if (l.amount > 0) addC(moneyIn, l.currency, l.amount);
        else addC(moneyOut, l.currency, -l.amount);
      }
    }
    const held: Partial<Record<FinCurrency, number>> = {};
    for (const l of CLIENT_LEDGERS) {
      for (const t of (await ledgerBalances(ctx, orgId, l)).values()) for (const c of ["USD", "ZiG"] as const) if (t[c]) addC(held, c, t[c]!);
    }
    return [
      { label: "Money in this month", value: formatTotals(moneyIn), tone: "good", href: "/app/finance" },
      { label: "Money out this month", value: formatTotals(moneyOut), href: "/app/finance" },
      { label: "Held in trust", value: formatTotals(held), href: "/app/finance/trust" },
    ];
  },
});

// ── Receipts and payments schedule (FN-81) ───────────────────────────

/** Every receipt and payment in a range, by account and category. What auditors ask for. */
export const schedule = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!isValidDate(args.from) || !isValidDate(args.to)) throw new ConvexError("Enter a valid date range");
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", args.from).lte("date", args.to))
      .collect();
    const accounts = new Map((await listAccounts(ctx, access.orgId)).map((a) => [a._id as string, a]));
    const cats = new Map((await listCategories(ctx, access.orgId)).map((c) => [c._id as string, c]));
    const rows = [];
    for (const t of txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_tx", (q) => q.eq("txId", t._id))
        .collect();
      const allocation = lines
        .filter((l) => l.ledger)
        .map((l) => (l.categoryId ? cats.get(l.categoryId)?.name : undefined) ?? LEDGER_LABELS[l.ledger!])
        .filter((x, i, arr) => arr.indexOf(x) === i)
        .join(", ");
      for (const l of lines.filter((x) => x.accountId)) {
        rows.push({
          date: t.date,
          number: t.number ?? "",
          type: t.reversalOfId ? "Reversal" : t.kind === "receipt" ? "Receipt" : t.kind === "payment" ? "Payment" : t.kind === "transfer" ? "Transfer" : "Opening balance",
          description: t.description,
          party: t.counterparty ?? t.supplier ?? "",
          account: accounts.get(l.accountId!)?.name ?? "",
          category: allocation,
          method: t.method ? METHOD_LABELS[t.method] : "",
          reference: t.reference ?? "",
          currency: l.currency,
          moneyIn: l.amount > 0 ? l.amount : 0,
          moneyOut: l.amount < 0 ? -l.amount : 0,
        });
      }
    }
    return rows;
  },
});

/** Cash book: one account's transactions with a running balance. */
export const cashBook = query({
  args: { accountId: v.id("finAccounts"), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const a = await ctx.db.get(args.accountId);
    if (!a || a.orgId !== access.orgId) throw new ConvexError("Account not found");
    const opening = await accountBalance(ctx, a._id, addDays(args.from, -1));
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_account_date", (q) => q.eq("accountId", a._id).gte("date", args.from).lte("date", args.to))
      .collect();
    const txs = await txMap(ctx, lines.map((l) => l.txId));
    let running = opening;
    const rows = lines
      .map((l) => ({ l, t: txs.get(l.txId) }))
      .sort((x, y) => (x.l.date < y.l.date ? -1 : x.l.date > y.l.date ? 1 : (x.t?.createdAt ?? 0) - (y.t?.createdAt ?? 0)))
      .map(({ l, t }) => {
        running = round2(running + l.amount);
        return {
          date: l.date,
          number: t?.number ?? "",
          description: t?.description ?? "",
          party: t?.counterparty ?? t?.supplier ?? "",
          moneyIn: l.amount > 0 ? l.amount : 0,
          moneyOut: l.amount < 0 ? -l.amount : 0,
          balance: running,
        };
      });
    return { account: { name: a.name, type: a.type, currency: a.currency }, opening, closing: running, rows };
  },
});

/** Agency income and expense by month and category. */
export const incomeExpense = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const lines = await ledgerLinesIn(ctx, access.orgId, "agency", args.from, args.to);
    const cats = new Map((await listCategories(ctx, access.orgId)).map((c) => [c._id as string, c]));
    const by = new Map<string, { month: string; category: string; kind: "income" | "expense"; currency: FinCurrency; amount: number }>();
    for (const l of lines) {
      // Agency lines without a category are opening balances, not income;
      // VAT collected is owed to the tax authority.
      if (!l.categoryId) continue;
      const c = cats.get(l.categoryId);
      if (c?.key === "vat_collected") continue;
      const kind = c?.kind ?? (l.amount >= 0 ? "income" : "expense");
      const k = `${l.date.slice(0, 7)}|${c?._id ?? "none"}|${l.currency}`;
      const row = by.get(k) ?? { month: l.date.slice(0, 7), category: c?.name ?? "Uncategorised", kind, currency: l.currency, amount: 0 };
      // Expenses are posted negative; show them as positive spend.
      row.amount = round2(row.amount + (kind === "expense" ? -l.amount : l.amount));
      by.set(k, row);
    }
    return [...by.values()].sort((a, b) => (a.month === b.month ? (a.kind === b.kind ? a.category.localeCompare(b.category) : a.kind === "income" ? -1 : 1) : a.month < b.month ? -1 : 1));
  },
});

/** Trust report: balance per landlord, deposits held, sale deposits, developers. */
export const trustReport = query({
  args: { asAt: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const rows = [];
    for (const ledger of [...CLIENT_LEDGERS, "unallocated" as const]) {
      const balances = await ledgerBalances(ctx, access.orgId, ledger, args.asAt);
      for (const [key, t] of balances) {
        let name = LEDGER_LABELS[ledger];
        if (ledger === "landlord") name = (await ctx.db.get(key as Id<"contacts">))?.name ?? "Landlord";
        if (ledger === "developer") name = (await ctx.db.get(key as Id<"finDevelopments">))?.developerName ?? "Developer";
        if (ledger === "sale") name = (await ctx.db.get(key as Id<"leads">))?.fullName ?? "Sale";
        if (ledger === "deposit") {
          const d = await ctx.db.get(key as Id<"stayDeposits">);
          const lease = d ? await ctx.db.get(d.leaseId) : null;
          name = lease ? (await ctx.db.get(lease.tenantContactId))?.name ?? "Tenant" : "Tenant";
        }
        for (const c of ["USD", "ZiG"] as const) if (t[c]) rows.push({ type: LEDGER_LABELS[ledger], name, currency: c, balance: t[c]! });
      }
    }
    return rows.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));
  },
});

/** Debtors: unpaid invoices, tenant arrears and overdue instalments, by age. */
export const debtors = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const today = await todayForOrg(ctx, access.orgId);
    const rows: Array<{ type: string; name: string; reference: string; dueDate: string; days: number; bucket: string; currency: FinCurrency; amount: number }> = [];
    for (const s of ["unpaid", "part_paid"] as const) {
      const invs = await ctx.db
        .query("finInvoices")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", s))
        .collect();
      for (const i of invs) {
        const days = i.dueDate < today ? daysBetween(i.dueDate, today) : 0;
        rows.push({ type: "Invoice", name: i.clientName, reference: i.number, dueDate: i.dueDate, days, bucket: days ? ageBucket(days) : "current", currency: i.currency, amount: round2(i.total - i.amountPaid) });
      }
      const charges = await ctx.db
        .query("stayCharges")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", s))
        .collect();
      const names = await nameMaps(ctx, { contacts: charges.map((c) => c.tenantContactId) });
      for (const c of charges) {
        if (c.dueDate > today) continue;
        const days = daysBetween(c.dueDate, today);
        rows.push({ type: "Tenant arrears", name: names.contact(c.tenantContactId)?.name ?? "Tenant", reference: c.description, dueDate: c.dueDate, days, bucket: days ? ageBucket(days) : "current", currency: c.currency, amount: outstanding(c) });
      }
    }
    const stands = await ctx.db
      .query("finStands")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    for (const s of stands) {
      if (s.status !== "active" || s.overdue <= 0) continue;
      rows.push({ type: "Instalments overdue", name: s.buyerName, reference: `Stand ${s.standNumber}`, dueDate: "", days: 0, bucket: "overdue", currency: s.currency, amount: s.overdue });
    }
    return rows.sort((a, b) => b.days - a.days);
  },
});

/** Commission by agent and by month: earned on deals closed, and paid. */
export const commissionReport = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const fromMs = Date.parse(`${args.from}T00:00:00Z`);
    const toMs = Date.parse(`${args.to}T23:59:59Z`);
    const deals = (
      await ctx.db
        .query("dealCommissions")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .collect()
    );
    // Date each deal by when the CRM closed it.
    const closedAt = new Map<string, number>();
    for (const d of deals) closedAt.set(d._id, (await ctx.db.get(d.leadId))?.closedAt ?? d.createdAt);
    const inRange = deals.filter((d) => closedAt.get(d._id)! >= fromMs && closedAt.get(d._id)! <= toMs);
    const by = new Map<string, { userId: Id<"users">; month: string; currency: FinCurrency; earned: number; paid: number }>();
    const row = (userId: Id<"users">, month: string, currency: FinCurrency) => {
      const k = `${userId}|${month}|${currency}`;
      if (!by.has(k)) by.set(k, { userId, month, currency, earned: 0, paid: 0 });
      return by.get(k)!;
    };
    for (const d of inRange) {
      const month = new Date(closedAt.get(d._id)!).toISOString().slice(0, 7);
      const c: FinCurrency = d.dealCurrency === "ZiG" ? "ZiG" : "USD";
      if (d.propertyAgentUserId) row(d.propertyAgentUserId, month, c).earned += d.propertyAgentAmount;
      row(d.leadAgentUserId, month, c).earned += d.leadAgentAmount;
    }
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", args.from).lte("date", args.to))
      .collect();
    for (const t of txs) {
      if (!t.agentUserId) continue;
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_tx", (q) => q.eq("txId", t._id))
        .collect();
      for (const l of lines.filter((x) => x.ledger === "agency")) row(t.agentUserId, t.date.slice(0, 7), l.currency).paid -= l.amount;
    }
    const names = await nameMaps(ctx, { users: [...by.values()].map((r) => r.userId) });
    return [...by.values()]
      .map((r) => ({ ...r, agent: userLabel(names.user(r.userId)), earned: round2(r.earned), paid: round2(r.paid) }))
      .sort((a, b) => (a.month === b.month ? a.agent.localeCompare(b.agent) : a.month < b.month ? -1 : 1));
  },
});

/** Stand sales: per development, collected in a month, outstanding and overdue buyers. */
export const standSales = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const { from, to } = periodRange(args.month);
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
      let collected = 0;
      for (const s of stands) {
        const txs = await ctx.db
          .query("finTransactions")
          .withIndex("by_stand", (q) => q.eq("standId", s._id))
          .collect();
        for (const t of txs) {
          if (t.kind !== "receipt" || t.date < from || t.date > to) continue;
          const lines = await ctx.db
            .query("finLines")
            .withIndex("by_tx", (q) => q.eq("txId", t._id))
            .collect();
          collected = round2(collected + lines.filter((l) => l.accountId).reduce((a, l) => a + l.amount, 0));
        }
      }
      out.push({
        development: d.name,
        currency: d.currency,
        stands: stands.length,
        collected,
        outstanding: round2(stands.reduce((a, s) => a + s.balance, 0)),
        overdue: round2(stands.reduce((a, s) => a + s.overdue, 0)),
        overdueBuyers: stands.filter((s) => s.overdue > 0).map((s) => ({ standNumber: s.standNumber, buyerName: s.buyerName, overdue: s.overdue, phone: s.buyerPhone ?? "" })),
      });
    }
    return out;
  },
});
