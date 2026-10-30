/**
 * Client money: the trust summary (FN-23), landlord balances and statements
 * (FN-20, §6), tenant deposits held (FN-21), client account statements and
 * the monthly trust reconciliation (FN-25).
 *
 * Property managers see only the landlords of the properties they manage;
 * everything else here is for the director and accounts.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { agencyOf, leaseLabels, nameMaps } from "../stay/shared";
import { dateLabel, formatAmount, isValidPeriod, outstanding, periodLabel, periodRange } from "../stay/ledger";
import {
  FinanceAccess,
  accountBalance,
  financeAudit,
  getAccount,
  ledgerBalances,
  listAccounts,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
  visibleLandlordIds,
  userLabel,
} from "./core";
import { CLIENT_LEDGERS, FinCurrency, round2 } from "./lib";
import { documentEmail, queueDocumentEmail } from "./emails";
import { landlordStatementDocument } from "./documents";

type Ctx = QueryCtx | MutationCtx;
const CURRENCIES: FinCurrency[] = ["USD", "ZiG"];

// ── Trust summary ────────────────────────────────────────────────────

/** FN-23: money held for clients, split by ledger, and every account's balance. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const byCurrency = [];
    const ledgers = await Promise.all([...CLIENT_LEDGERS, "unallocated" as const].map(async (l) => [l, await ledgerBalances(ctx, access.orgId, l)] as const));
    for (const c of CURRENCIES) {
      const row: Record<string, number> = {};
      for (const [l, balances] of ledgers) {
        row[l] = round2([...balances.values()].reduce((s, t) => s + (t[c] ?? 0), 0));
      }
      const held = round2(CLIENT_LEDGERS.reduce((s, l) => s + row[l], 0));
      byCurrency.push({
        currency: c,
        landlords: row.landlord,
        deposits: row.deposit,
        sales: row.sale,
        developers: row.developer,
        unallocated: row.unallocated,
        held,
      });
    }
    const accounts = await listAccounts(ctx, access.orgId);
    const balances = await Promise.all(accounts.map(async (a) => ({ _id: a._id, name: a.name, type: a.type, currency: a.currency, isActive: a.isActive, balance: await accountBalance(ctx, a._id) })));
    return {
      currencies: byCurrency.filter((r) => r.held !== 0 || r.unallocated !== 0 || balances.some((b) => b.currency === r.currency)),
      accounts: balances,
    };
  },
});

// ── Landlords ────────────────────────────────────────────────────────

/** Managed properties with their landlord, for paying expenses from trust (FN-40). */
export const properties = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const sps = (
      await ctx.db
        .query("stayProperties")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .collect()
    ).filter((sp) => sp.isActive);
    const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId), contacts: sps.map((sp) => sp.landlordContactId) });
    return sps
      .map((sp) => ({
        _id: sp._id,
        name: names.property(sp.propertyId)?.title ?? "Property",
        landlordContactId: sp.landlordContactId,
        landlordName: names.contact(sp.landlordContactId)?.name ?? "Landlord",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** FN-20: every landlord the caller may see, with what we hold for them. */
export const landlords = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    const visible = await visibleLandlordIds(ctx, access);
    const sps = await ctx.db
      .query("stayProperties")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    const balances = await ledgerBalances(ctx, access.orgId, "landlord");
    const ids = new Set<string>([...sps.map((sp) => sp.landlordContactId as string), ...balances.keys()]);
    const names = await nameMaps(ctx, { contacts: [...ids] as Id<"contacts">[] });
    return [...ids]
      .filter((id) => visible === "all" || visible.has(id))
      .map((id) => {
        const c = names.contact(id as Id<"contacts">);
        const t = balances.get(id) ?? {};
        return {
          _id: id as Id<"contacts">,
          name: c?.name ?? "Unknown landlord",
          email: c?.email ?? "",
          properties: sps.filter((sp) => sp.landlordContactId === id).length,
          USD: t.USD ?? 0,
          ZiG: t.ZiG ?? 0,
        };
      })
      .filter((l) => l.name !== "Unknown landlord" || l.USD || l.ZiG)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

function lineKind(t: Doc<"finTransactions"> | null, amount: number): "opening" | "received" | "commission" | "expense" | "payout" | "deposit" | "other" {
  if (!t) return "other";
  if (t.kind === "opening") return "opening";
  if (t.feeOfTxId) return "commission";
  if (t.payoutId) return "payout";
  if (t.kind === "receipt") return "received";
  if (t.kind === "payment") return "expense";
  if (t.description.startsWith("Deposit applied")) return "deposit";
  return amount >= 0 ? "received" : "other";
}

/**
 * The landlord statement for a month (BRD §6): per currency, the balance
 * brought forward, every movement, and the balance held; per property, rent
 * charged, received, arrears, commission, expenses and payouts.
 */
async function landlordStatementData(ctx: Ctx, access: FinanceAccess, landlordId: Id<"contacts">, month: string) {
  const visible = await visibleLandlordIds(ctx, access);
  if (visible !== "all" && !visible.has(landlordId)) throw new ConvexError("Landlord not found");
  return landlordStatementFor(ctx, access.org, landlordId, month);
}

/**
 * The statement itself, for a landlord the caller is already allowed to
 * see. Shared with the landlord portal, which shows it read-only.
 */
export async function landlordStatementFor(ctx: Ctx, org: Doc<"organizations">, landlordId: Id<"contacts">, month: string) {
  if (!isValidPeriod(month)) throw new ConvexError("Pick a month");
  const access = { orgId: org._id, org };
  const landlord = await ctx.db.get(landlordId);
  if (!landlord || landlord.orgId !== access.orgId) throw new ConvexError("Landlord not found");
  const { from, to } = periodRange(month);
  const lines = await ctx.db
    .query("finLines")
    .withIndex("by_org_ledger_key", (q) => q.eq("orgId", access.orgId).eq("ledger", "landlord").eq("key", landlordId))
    .collect();
  const sps = await ctx.db
    .query("stayProperties")
    .withIndex("by_landlord", (q) => q.eq("landlordContactId", landlordId))
    .collect();
  const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId) });
  const propName = (id?: Id<"stayProperties">) => (id ? names.property(sps.find((sp) => sp._id === id)?.propertyId)?.title ?? "Property" : "General");

  const txCache = new Map<string, Doc<"finTransactions"> | null>();
  const txOf = async (id: Id<"finTransactions">) => {
    if (!txCache.has(id)) txCache.set(id, await ctx.db.get(id));
    return txCache.get(id)!;
  };

  const leases = sps.length
    ? (
        await Promise.all(
          sps.map((sp) =>
            ctx.db
              .query("stayLeases")
              .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
              .collect()
          )
        )
      ).flat()
    : [];
  const chargeLists = await Promise.all(
    leases.map((l) =>
      ctx.db
        .query("stayCharges")
        .withIndex("by_lease", (q) => q.eq("leaseId", l._id))
        .collect()
    )
  );
  const leaseCharges = chargeLists.flat().filter((ch) => ch.dueDate <= to);

  const sections = [];
  for (const currency of CURRENCIES) {
    const mine = lines.filter((l) => l.currency === currency);
    const opening = round2(mine.filter((l) => l.date < from).reduce((s, l) => s + l.amount, 0));
    const inMonth = mine.filter((l) => l.date >= from && l.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
    const perProperty = new Map<string, { name: string; charged: number; received: number; arrears: number; commission: number; expenses: number; payouts: number; deposit: number }>();
    const prop = (id?: Id<"stayProperties">) => {
      const k = id ?? "general";
      if (!perProperty.has(k)) perProperty.set(k, { name: propName(id), charged: 0, received: 0, arrears: 0, commission: 0, expenses: 0, payouts: 0, deposit: 0 });
      return perProperty.get(k)!;
    };
    const movements = [];
    for (const l of inMonth) {
      const t = await txOf(l.txId);
      const kind = lineKind(t, l.amount);
      const p = prop(l.stayPropertyId);
      if (kind === "received" || kind === "opening") p.received = round2(p.received + l.amount);
      else if (kind === "commission") p.commission = round2(p.commission - l.amount);
      else if (kind === "payout") p.payouts = round2(p.payouts - l.amount);
      else if (kind === "deposit") p.deposit = round2(p.deposit + l.amount);
      else p.expenses = round2(p.expenses - l.amount);
      movements.push({ date: l.date, number: t?.number ?? "", description: t?.description ?? "", property: p.name, kind, amount: l.amount });
    }
    // Rent charged and arrears from SyncStay, for the properties we manage.
    for (const sp of sps) {
      for (const ch of leaseCharges) {
        if (ch.stayPropertyId !== sp._id || ch.currency !== currency || ch.status === "cancelled" || ch.kind === "admin_fee") continue;
        const p = prop(sp._id);
        if (ch.dueDate >= from) p.charged = round2(p.charged + ch.amount);
        p.arrears = round2(p.arrears + outstanding(ch));
      }
    }
    const closing = round2(opening + inMonth.reduce((s, l) => s + l.amount, 0));
    if (!movements.length && opening === 0 && ![...perProperty.values()].some((p) => p.charged || p.arrears)) continue;
    sections.push({
      currency,
      opening,
      closing,
      movements,
      properties: [...perProperty.values()],
      totals: {
        received: round2(movements.filter((m) => m.kind === "received").reduce((s, m) => s + m.amount, 0)),
        commission: round2(-movements.filter((m) => m.kind === "commission").reduce((s, m) => s + m.amount, 0)),
        expenses: round2(-movements.filter((m) => m.kind === "expense" || m.kind === "other").reduce((s, m) => s + m.amount, 0)),
        payouts: round2(-movements.filter((m) => m.kind === "payout").reduce((s, m) => s + m.amount, 0)),
      },
    });
  }
  return {
    agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
    landlord: { _id: landlord._id, name: landlord.name, email: landlord.email ?? "" },
    month,
    monthLabel: periodLabel(month, true),
    sections,
  };
}

export const landlordStatement = query({
  args: { landlordId: v.id("contacts"), month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    return landlordStatementData(ctx, access, args.landlordId, args.month);
  },
});

async function sendLandlordStatement(ctx: MutationCtx, access: FinanceAccess, landlordId: Id<"contacts">, month: string): Promise<boolean> {
  const st = await landlordStatementData(ctx, access, landlordId, month);
  if (!st.landlord.email) return false;
  const lines: string[][] = [];
  const items: Array<[string, string]> = [];
  for (const s of st.sections) {
    for (const m of s.movements) lines.push([`${dateLabel(m.date)} ${m.description}`, m.property, formatAmount(m.amount, s.currency)]);
    items.push(
      [`${s.currency} brought forward`, formatAmount(s.opening, s.currency)],
      [`${s.currency} received`, formatAmount(s.totals.received, s.currency)],
      [`${s.currency} commission`, formatAmount(s.totals.commission, s.currency)],
      [`${s.currency} expenses`, formatAmount(s.totals.expenses, s.currency)],
      [`${s.currency} paid to you`, formatAmount(s.totals.payouts, s.currency)],
      [`${s.currency} balance held`, formatAmount(s.closing, s.currency)]
    );
  }
  return queueDocumentEmail(
    ctx,
    access.orgId,
    documentEmail({
      agency: agencyOf(access.org),
      to: st.landlord.email,
      name: st.landlord.name,
      subject: `Your statement for ${st.monthLabel} from ${access.org.name}`,
      intro: st.sections.length ? `Here is your statement for ${st.monthLabel}.` : `There was no activity on your account in ${st.monthLabel}.`,
      lines: { head: ["Item", "Property", "Amount"], body: lines },
      items,
      outro: "Please contact us with any questions.",
      kind: "finance_landlord_statement",
      relatedType: "contact",
      relatedId: landlordId,
    }),
    landlordStatementDocument(st),
    access.user._id
  );
}

/** Email one landlord's statement, or every landlord's in one action (bulk send). */
export const sendLandlordStatements = mutation({
  args: { month: v.string(), landlordIds: v.array(v.id("contacts")) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (args.landlordIds.length > 200) throw new ConvexError("Send at most 200 statements at a time");
    let sent = 0;
    const skipped: string[] = [];
    for (const id of args.landlordIds) {
      if (await sendLandlordStatement(ctx, access, id, args.month)) sent++;
      else skipped.push((await ctx.db.get(id))?.name ?? "Unknown");
    }
    await financeAudit(ctx, access, {
      action: "finance.landlord_statements",
      description: `Emailed ${sent} landlord statements for ${args.month}`,
      targetType: "organization",
      targetId: access.orgId,
      metadata: { skipped },
    });
    return { sent, skipped };
  },
});

// ── Tenant deposits ──────────────────────────────────────────────────

/** FN-21: each tenant deposit held, wherever it is held. */
export const deposits = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const balances = await ledgerBalances(ctx, access.orgId, "deposit");
    const out = [];
    const deps = await Promise.all([...balances.keys()].map((k) => ctx.db.get(k as Id<"stayDeposits">)));
    const leases = (await Promise.all(deps.map((d) => (d ? ctx.db.get(d.leaseId) : null)))).filter((l): l is Doc<"stayLeases"> => !!l);
    const label = await leaseLabels(ctx, leases);
    const leaseMap = new Map(leases.map((l) => [l._id as string, l]));
    for (const d of deps) {
      if (!d) continue;
      const t = balances.get(d._id) ?? {};
      const l = leaseMap.get(d.leaseId);
      const lab = l ? label(l) : null;
      out.push({
        _id: d._id,
        tenantName: lab?.tenantName ?? "Tenant",
        property: lab ? `${lab.propertyName}, ${lab.unitLabel}` : "",
        heldIn: d.heldIn,
        currency: d.currency,
        held: t[d.currency] ?? 0,
        stayHeld: round2(d.amountReceived - d.amountApplied - d.amountRefunded),
      });
    }
    return out.sort((a, b) => a.tenantName.localeCompare(b.tenantName));
  },
});

// ── Client account statement ─────────────────────────────────────────

/** A buyer, seller or other client: invoices, payments and balance (§6). */
export const clientStatement = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const c = await ctx.db.get(args.contactId);
    if (!c || c.orgId !== access.orgId) return null;
    const invoices = (
      await ctx.db
        .query("finInvoices")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .collect()
    ).filter((i) => i.status !== "cancelled");
    const rows: Array<{ date: string; description: string; currency: FinCurrency; charged: number; paid: number }> = [];
    for (const i of invoices) {
      rows.push({ date: i.date, description: `Invoice ${i.number}`, currency: i.currency, charged: i.total, paid: 0 });
      const pays = await ctx.db
        .query("finTransactions")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", i._id))
        .collect();
      for (const p of pays) {
        const lines = await ctx.db
          .query("finLines")
          .withIndex("by_tx", (q) => q.eq("txId", p._id))
          .collect();
        const amount = round2(lines.filter((l) => l.accountId).reduce((s, l) => s + l.amount, 0));
        rows.push({ date: p.date, description: `${p.reversalOfId ? "Reversal" : "Payment"} ${p.number ?? ""}`.trim(), currency: i.currency, charged: 0, paid: amount });
      }
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));
    const balance: Partial<Record<FinCurrency, number>> = {};
    const withBalance = rows.map((r) => {
      balance[r.currency] = round2((balance[r.currency] ?? 0) + r.charged - r.paid);
      return { ...r, balance: balance[r.currency]! };
    });
    return {
      agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
      client: { _id: c._id, name: c.name, email: c.email ?? "" },
      rows: withBalance,
      balance,
    };
  },
});

// ── Reconciliation ───────────────────────────────────────────────────

/** FN-25: record the bank's month-end balance against ours. */
export const reconcile = mutation({
  args: { accountId: v.id("finAccounts"), month: v.string(), bankBalance: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const account = await getAccount(ctx, access.orgId, args.accountId);
    if (!isValidPeriod(args.month)) throw new ConvexError("Pick a month");
    const { to } = periodRange(args.month);
    const systemBalance = await accountBalance(ctx, account._id, to);
    const bankBalance = round2(args.bankBalance);
    const id = await ctx.db.insert("finReconciliations", {
      orgId: access.orgId,
      accountId: account._id,
      month: args.month,
      bankBalance,
      systemBalance,
      difference: round2(bankBalance - systemBalance),
      note: args.note?.trim() || undefined,
      createdByUserId: access.user._id,
      createdAt: Date.now(),
    });
    await financeAudit(ctx, access, {
      action: "finance.reconcile",
      description: `Reconciled ${account.name} for ${args.month}: difference ${formatAmount(bankBalance - systemBalance, account.currency)}`,
      targetType: "finAccount",
      targetId: account._id,
    });
    return id;
  },
});

export const reconciliations = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const rows = await ctx.db
      .query("finReconciliations")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(200);
    const accounts = new Map((await listAccounts(ctx, access.orgId)).map((a) => [a._id as string, a]));
    const names = await nameMaps(ctx, { users: rows.map((r) => r.createdByUserId) });
    const today = await todayForOrg(ctx, access.orgId);
    return {
      today,
      rows: rows.map((r) => ({
        ...r,
        account: accounts.get(r.accountId)?.name ?? "",
        currency: accounts.get(r.accountId)?.currency ?? "USD",
        by: userLabel(names.user(r.createdByUserId)),
      })),
    };
  },
});
