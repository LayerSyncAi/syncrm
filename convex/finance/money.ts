/**
 * Money in and money out recorded directly in Sync Finance (FN-11, FN-40,
 * FN-70), transfers between accounts (including banking cash, FN-14),
 * reversals (FN-13), the transaction list and the daily cash-up.
 *
 * Rent and deposits are recorded in Sync Stay and arrive through posting.ts.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { agencyOf, nameMaps } from "../stay/shared";
import { dateLabel, formatAmount, isValidDate } from "../stay/ledger";
import { METHOD_LABELS } from "../stay/validators";
import {
  FinanceAccess,
  NewLine,
  financeAudit,
  accountBalance,
  getAccount,
  getCategory,
  linesOf,
  listAccounts,
  listCategories,
  nextNumber,
  postTransaction,
  requireDirector,
  requireFinance,
  requireFinanceStaff,
  userLabel,
} from "./core";
import { LEDGER_LABELS, round2 } from "./lib";
import { finMethod } from "../schemas/finance";
import { reverseWithFee } from "./posting";
import { recomputeInvoice } from "./invoices";
import { recomputeStand } from "./stands";
import { documentEmail, queueDocumentEmail } from "./emails";
import { receiptDocument } from "./documents";

function cleanText(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function positive(amount: number): number {
  const a = round2(amount);
  if (!(a > 0)) throw new ConvexError("Amount must be more than zero");
  return a;
}

// ── Money in ─────────────────────────────────────────────────────────

/**
 * FN-11: money in that did not come through Sync Stay.
 *  - income: agency income in a category (fees from clients, other income).
 *  - sale_deposit: a buyer's deposit held in trust for a deal (FN-22).
 *  - landlord: money a landlord pays in (e.g. towards repairs).
 */
export const recordIn = mutation({
  args: {
    purpose: v.union(v.literal("income"), v.literal("sale_deposit"), v.literal("landlord")),
    date: v.string(),
    accountId: v.id("finAccounts"),
    amount: v.number(),
    method: finMethod,
    reference: v.optional(v.string()),
    description: v.string(),
    categoryId: v.optional(v.id("finCategories")),
    leadId: v.optional(v.id("leads")),
    landlordContactId: v.optional(v.id("contacts")),
    contactId: v.optional(v.id("contacts")),
    counterparty: v.optional(v.string()),
    emailTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const account = await getAccount(ctx, access.orgId, args.accountId);
    const amount = positive(args.amount);
    const currency = account.currency;
    const description = cleanText(args.description) ?? "Money in";
    let ledgerLine: NewLine;
    let contactId = args.contactId;
    if (args.purpose === "income") {
      if (!args.categoryId) throw new ConvexError("Pick an income category");
      const cat = await getCategory(ctx, access.orgId, args.categoryId);
      if (cat.kind !== "income") throw new ConvexError("Pick an income category");
      ledgerLine = { currency, amount, ledger: "agency", categoryId: cat._id };
    } else if (args.purpose === "sale_deposit") {
      if (!args.leadId) throw new ConvexError("Pick the deal this deposit is for");
      const lead = await ctx.db.get(args.leadId);
      if (!lead || lead.orgId !== access.orgId) throw new ConvexError("Deal not found");
      contactId = contactId ?? lead.contactId;
      ledgerLine = { currency, amount, ledger: "sale", key: lead._id };
    } else {
      if (!args.landlordContactId) throw new ConvexError("Pick the landlord");
      const c = await ctx.db.get(args.landlordContactId);
      if (!c || c.orgId !== access.orgId) throw new ConvexError("Landlord not found");
      contactId = c._id;
      ledgerLine = { currency, amount, ledger: "landlord", key: c._id };
    }
    const contact = contactId ? await ctx.db.get(contactId) : null;
    const number = await nextNumber(ctx, access.orgId, "receipt");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "receipt",
        number,
        description,
        method: args.method,
        reference: cleanText(args.reference),
        contactId,
        counterparty: cleanText(args.counterparty) ?? contact?.name,
      },
      [{ currency, amount, accountId: account._id }, ledgerLine]
    );
    await financeAudit(ctx, access, {
      action: "finance.receipt",
      description: `Receipt ${number}: ${formatAmount(amount, currency)} ${description}`,
      targetType: "finTransaction",
      targetId: txId,
      targetLabel: number,
    });
    const to = cleanText(args.emailTo) ?? contact?.email;
    if (to) await emailReceiptFor(ctx, access, txId, to);
    return { txId, number };
  },
});

// ── Money out ────────────────────────────────────────────────────────

/**
 * Money out that is not a payout.
 *  - expense: the agency's own costs (FN-70), with supplier and slip photo.
 *  - landlord_expense: paid from trust for a landlord (FN-40), e.g. repairs,
 *    rates or levies. Also written to Sync Stay's expenses so both modules
 *    show it, unless it pays an expense already recorded there.
 */
export const recordOut = mutation({
  args: {
    purpose: v.union(v.literal("expense"), v.literal("landlord_expense")),
    date: v.string(),
    accountId: v.id("finAccounts"),
    amount: v.number(),
    method: finMethod,
    reference: v.optional(v.string()),
    description: v.string(),
    supplier: v.optional(v.string()),
    categoryId: v.optional(v.id("finCategories")),
    stayPropertyId: v.optional(v.id("stayProperties")),
    stayExpenseId: v.optional(v.id("stayExpenses")),
    attachmentId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const account = await getAccount(ctx, access.orgId, args.accountId);
    const amount = positive(args.amount);
    const currency = account.currency;
    const description = cleanText(args.description);
    if (!description) throw new ConvexError("Describe the payment");
    const number = await nextNumber(ctx, access.orgId, "payment");
    const header = {
      date: args.date,
      kind: "payment" as const,
      number,
      description,
      method: args.method,
      reference: cleanText(args.reference),
      supplier: cleanText(args.supplier),
      counterparty: cleanText(args.supplier),
      attachmentId: args.attachmentId,
    };
    let txId: Id<"finTransactions">;
    if (args.purpose === "expense") {
      if (!args.categoryId) throw new ConvexError("Pick an expense category");
      const cat = await getCategory(ctx, access.orgId, args.categoryId);
      if (cat.kind !== "expense") throw new ConvexError("Pick an expense category");
      txId = await postTransaction(ctx, access, header, [
        { currency, amount: -amount, accountId: account._id },
        { currency, amount: -amount, ledger: "agency", categoryId: cat._id },
      ]);
    } else {
      if (!args.stayPropertyId) throw new ConvexError("Pick the property");
      const sp = await ctx.db.get(args.stayPropertyId);
      if (!sp || sp.orgId !== access.orgId) throw new ConvexError("Property not found");
      let stayExpenseId = args.stayExpenseId;
      if (stayExpenseId) {
        const e = await ctx.db.get(stayExpenseId);
        if (!e || e.stayPropertyId !== sp._id) throw new ConvexError("Expense not found");
        if (e.currency !== currency) throw new ConvexError(`That expense is in ${e.currency}`);
      } else {
        stayExpenseId = await ctx.db.insert("stayExpenses", {
          orgId: access.orgId,
          stayPropertyId: sp._id,
          date: args.date,
          description,
          amount,
          currency,
          supplier: cleanText(args.supplier),
          rechargeToLandlord: true,
          createdByUserId: access.user._id,
          createdAt: Date.now(),
        });
      }
      txId = await postTransaction(ctx, access, { ...header, stayPropertyId: sp._id, stayExpenseId, contactId: sp.landlordContactId }, [
        { currency, amount: -amount, accountId: account._id },
        { currency, amount: -amount, ledger: "landlord", key: sp.landlordContactId, stayPropertyId: sp._id },
      ]);
    }
    await financeAudit(ctx, access, {
      action: "finance.payment",
      description: `Payment ${number}: ${formatAmount(amount, currency)} ${description}`,
      targetType: "finTransaction",
      targetId: txId,
      targetLabel: number,
    });
    return { txId, number };
  },
});

/** Upload URL for a slip photo. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Move money between two accounts in the same currency: banking cash
 * (FN-14) or moving funds out of trust. Moving out of a trust account is a
 * director's call; banking cash is anyone in finance.
 */
export const transfer = mutation({
  args: {
    date: v.string(),
    fromAccountId: v.id("finAccounts"),
    toAccountId: v.id("finAccounts"),
    amount: v.number(),
    reference: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const from = await getAccount(ctx, access.orgId, args.fromAccountId);
    const to = await getAccount(ctx, access.orgId, args.toAccountId);
    if (from._id === to._id) throw new ConvexError("Pick two different accounts");
    if (from.currency !== to.currency) throw new ConvexError("Both accounts must be in the same currency");
    if (from.type === "trust") requireDirector(access);
    const amount = positive(args.amount);
    const description = cleanText(args.description) ?? (from.type === "cash" ? `Cash banked into ${to.name}` : `Transfer to ${to.name}`);
    const txId = await postTransaction(
      ctx,
      access,
      { date: args.date, kind: "transfer", description, reference: cleanText(args.reference) },
      [
        { currency: from.currency, amount: -amount, accountId: from._id },
        { currency: from.currency, amount, accountId: to._id },
      ]
    );
    await financeAudit(ctx, access, {
      action: "finance.transfer",
      description: `${description}: ${formatAmount(amount, from.currency)} from ${from.name}`,
      targetType: "finTransaction",
      targetId: txId,
    });
    return txId;
  },
});

// ── Reversal ─────────────────────────────────────────────────────────

/** FN-13: reverse with a reason. Directors only; Stay receipts are reversed in Stay. */
export const reverse = mutation({
  args: { txId: v.id("finTransactions"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const tx = await ctx.db.get(args.txId);
    if (!tx || tx.orgId !== access.orgId) throw new ConvexError("Transaction not found");
    if (tx.stayPaymentId) throw new ConvexError("This receipt came from Sync Stay. Reverse it there and Finance follows.");
    if (tx.payoutId) throw new ConvexError("Reverse a payout from the payouts screen");
    if (tx.feeOfTxId) throw new ConvexError("Reverse the receipt this commission came from");
    await reverseWithFee(ctx, access, tx._id, args.reason);
    await afterReverse(ctx, tx);
    await financeAudit(ctx, access, {
      action: "finance.reverse",
      description: `Reversed ${tx.number ?? tx.description}: ${args.reason.trim()}`,
      targetType: "finTransaction",
      targetId: tx._id,
      targetLabel: tx.number,
    });
  },
});

/** Records that summarise money keep up after a reversal. */
export async function afterReverse(ctx: MutationCtx, tx: Doc<"finTransactions">) {
  if (tx.invoiceId) await recomputeInvoice(ctx, tx.invoiceId);
  if (tx.standId) await recomputeStand(ctx, tx.standId);
}

// ── Lists ────────────────────────────────────────────────────────────

/** Labels for the lines of many transactions, loaded once. */
async function lineLabeller(ctx: QueryCtx, orgId: Id<"organizations">) {
  const [accounts, categories] = await Promise.all([listAccounts(ctx, orgId), listCategories(ctx, orgId)]);
  const acc = new Map(accounts.map((a) => [a._id as string, a]));
  const cat = new Map(categories.map((c) => [c._id as string, c]));
  return { acc, cat };
}

/**
 * Transactions by date, newest first. Each row says where the money moved
 * (accounts) and whose it is (ledgers), in plain words.
 */
export const list = query({
  args: {
    from: v.string(),
    to: v.string(),
    accountId: v.optional(v.id("finAccounts")),
    kind: v.optional(v.union(v.literal("receipt"), v.literal("payment"), v.literal("transfer"), v.literal("opening"))),
    q: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!isValidDate(args.from) || !isValidDate(args.to)) throw new ConvexError("Enter a valid date range");
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", args.from).lte("date", args.to))
      .order("desc")
      .take(2000);
    const { acc, cat } = await lineLabeller(ctx, access.orgId);
    const users = await nameMaps(ctx, { users: txs.map((t) => t.createdByUserId) });
    const q = args.q?.trim().toLowerCase();
    const out = [];
    for (const t of txs) {
      if (args.kind && t.kind !== args.kind) continue;
      const lines = await linesOf(ctx, t._id);
      if (args.accountId && !lines.some((l) => l.accountId === args.accountId)) continue;
      const accountLines = lines.filter((l) => l.accountId);
      const moved = round2(accountLines.reduce((s, l) => s + l.amount, 0));
      const currency = lines[0]?.currency ?? "USD";
      const row = {
        _id: t._id,
        date: t.date,
        kind: t.kind,
        number: t.number ?? "",
        description: t.description,
        counterparty: t.counterparty ?? t.supplier ?? "",
        reference: t.reference ?? "",
        method: t.method ? METHOD_LABELS[t.method] : "",
        currency,
        // Net effect on the agency's accounts: + money in, - money out.
        amount: moved,
        gross: round2(lines.filter((l) => l.amount > 0 && l.accountId).reduce((s, l) => s + l.amount, 0)) || Math.abs(moved),
        accounts: [...new Set(accountLines.map((l) => acc.get(l.accountId!)?.name ?? "Account"))].join(", "),
        allocation: lines
          .filter((l) => l.ledger)
          .map((l) => (l.categoryId ? cat.get(l.categoryId)?.name : LEDGER_LABELS[l.ledger!]) ?? "")
          .filter(Boolean)
          .join(", "),
        fromStay: !!t.stayPaymentId,
        isFee: !!t.feeOfTxId,
        isPayout: !!t.payoutId,
        hasSlip: !!t.attachmentId,
        reversed: !!t.reversedAt,
        isReversal: !!t.reversalOfId,
        reverseReason: t.reverseReason ?? null,
        createdBy: userLabel(users.user(t.createdByUserId)),
      };
      if (q && ![row.number, row.description, row.counterparty, row.reference].some((s) => s.toLowerCase().includes(q))) continue;
      out.push(row);
    }
    return out;
  },
});

/** Everything a printed receipt or payment voucher shows. */
export const get = query({
  args: { txId: v.id("finTransactions") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const t = await ctx.db.get(args.txId);
    if (!t || t.orgId !== access.orgId) return null;
    return documentData(ctx, access, t);
  },
});

async function documentData(ctx: QueryCtx | MutationCtx, access: FinanceAccess, t: Doc<"finTransactions">) {
  const lines = await linesOf(ctx, t._id);
  const [accounts, categories] = await Promise.all([listAccounts(ctx, access.orgId), listCategories(ctx, access.orgId)]);
  const acc = new Map(accounts.map((a) => [a._id as string, a]));
  const cat = new Map(categories.map((c) => [c._id as string, c]));
  const recorder = await ctx.db.get(t.createdByUserId);
  const contact = t.contactId ? await ctx.db.get(t.contactId) : null;
  const slipUrl = t.attachmentId ? await ctx.storage.getUrl(t.attachmentId) : null;
  const moved = round2(lines.filter((l) => l.accountId).reduce((s, l) => s + l.amount, 0));
  return {
    agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
    _id: t._id,
    kind: t.kind,
    number: t.number ?? "",
    date: t.date,
    description: t.description,
    counterparty: t.counterparty ?? contact?.name ?? t.supplier ?? "",
    contactEmail: contact?.email ?? null,
    method: t.method ? METHOD_LABELS[t.method] : "",
    reference: t.reference ?? "",
    currency: lines[0]?.currency ?? "USD",
    amount: Math.abs(moved) || round2(lines.filter((l) => l.amount > 0 && l.ledger).reduce((s, l) => s + l.amount, 0)),
    lines: lines.map((l) => ({
      label: l.accountId
        ? acc.get(l.accountId)?.name ?? "Account"
        : (l.categoryId ? cat.get(l.categoryId)?.name : undefined) ?? LEDGER_LABELS[l.ledger!],
      side: l.accountId ? ("account" as const) : ("ledger" as const),
      amount: l.amount,
    })),
    fee: t.fee ? { pct: t.fee.pct, amount: t.fee.amount, moved: !!t.fee.movedTxId } : null,
    slipUrl,
    recordedBy: userLabel(recorder),
    reversed: !!t.reversedAt,
    reverseReason: t.reverseReason ?? null,
    fromStay: !!t.stayPaymentId,
  };
}

async function emailReceiptFor(ctx: MutationCtx, access: FinanceAccess, txId: Id<"finTransactions">, to: string) {
  const t = (await ctx.db.get(txId))!;
  const d = await documentData(ctx, access, t);
  await queueDocumentEmail(
    ctx,
    access.orgId,
    documentEmail({
      agency: agencyOf(access.org),
      to,
      name: d.counterparty || "client",
      subject: `Receipt ${d.number} from ${access.org.name}`,
      intro: "Thank you. We have received your payment.",
      items: [
        ["Receipt number", d.number],
        ["Date", dateLabel(d.date)],
        ["Amount received", formatAmount(d.amount, d.currency)],
        ["For", d.description],
        ...(d.method ? ([["Method", d.method]] as Array<[string, string]>) : []),
        ...(d.reference ? ([["Reference", d.reference]] as Array<[string, string]>) : []),
      ],
      outro: "Please keep this email as your receipt.",
      kind: "finance_receipt",
      relatedType: "finTransaction",
      relatedId: txId,
    }),
    receiptDocument({ ...d, agency: d.agency }),
    access.user._id
  );
}

/** Email a receipt (FN-12) to its contact or a given address. */
export const emailReceipt = mutation({
  args: { txId: v.id("finTransactions"), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const t = await ctx.db.get(args.txId);
    if (!t || t.orgId !== access.orgId || t.kind !== "receipt") throw new ConvexError("Receipt not found");
    const contact = t.contactId ? await ctx.db.get(t.contactId) : null;
    const to = cleanText(args.to) ?? contact?.email;
    if (!to) throw new ConvexError("No email address for this receipt");
    await emailReceiptFor(ctx, access, t._id, to);
  },
});

// ── Cash-up ──────────────────────────────────────────────────────────

/**
 * FN-14: per person for one day, cash received into a cash float, cash
 * banked out of it, and what that leaves on hand. Plus each float's balance.
 */
export const cashUp = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    if (!isValidDate(args.date)) throw new ConvexError("Pick a date");
    const floats = (await listAccounts(ctx, access.orgId)).filter((a) => a.type === "cash");
    const people = new Map<string, { userId: Id<"users">; currency: string; received: number; banked: number; paidOut: number; receipts: number }>();
    const balances = [];
    for (const f of floats) {
      const lines = await ctx.db
        .query("finLines")
        .withIndex("by_account_date", (q) => q.eq("accountId", f._id).eq("date", args.date))
        .collect();
      balances.push({ accountId: f._id, name: f.name, currency: f.currency, balance: await accountBalance(ctx, f._id, args.date) });
      for (const l of lines) {
        const t = await ctx.db.get(l.txId);
        if (!t) continue;
        const k = `${t.createdByUserId}:${f.currency}`;
        const row = people.get(k) ?? { userId: t.createdByUserId, currency: f.currency, received: 0, banked: 0, paidOut: 0, receipts: 0 };
        if (l.amount > 0) {
          row.received = round2(row.received + l.amount);
          if (t.kind === "receipt") row.receipts++;
        } else if (t.kind === "transfer") row.banked = round2(row.banked - l.amount);
        else row.paidOut = round2(row.paidOut - l.amount);
        people.set(k, row);
      }
    }
    const names = await nameMaps(ctx, { users: [...people.values()].map((p) => p.userId) });
    return {
      floats: balances,
      people: [...people.values()].map((p) => ({
        ...p,
        name: userLabel(names.user(p.userId)),
        onHand: round2(p.received - p.banked - p.paidOut),
      })),
    };
  },
});
