/**
 * Invoices to landlords, buyers, sellers and other clients (FN-60 to FN-63).
 * Payments against an invoice are receipts into agency income, split across
 * the invoice's categories. Rent invoices stay in Sync Stay; list() shows
 * them alongside so there is one place to see what clients owe (FN-61).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { agencyOf, leaseLabels } from "../stay/shared";
import { daysBetween, dateLabel, formatAmount, isValidDate, outstanding } from "../stay/ledger";
import {
  NewLine,
  categoryByKey,
  financeAudit,
  getAccount,
  getCategory,
  getSettings,
  nextNumber,
  postTransaction,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
} from "./core";
import { invoiceStatus, invoiceTotals, round2 } from "./lib";
import { finCurrency, finMethod } from "../schemas/finance";
import { documentEmail, queueDocumentEmail } from "./emails";
import { invoiceDocument } from "./documents";

const lineArg = v.object({
  description: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  categoryId: v.optional(v.id("finCategories")),
});

/** Paid so far: every live receipt against the invoice. */
export async function recomputeInvoice(ctx: MutationCtx, invoiceId: Id<"finInvoices">) {
  const inv = await ctx.db.get(invoiceId);
  if (!inv) return;
  const txs = await ctx.db
    .query("finTransactions")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
    .collect();
  let paid = 0;
  for (const t of txs) {
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_tx", (q) => q.eq("txId", t._id))
      .collect();
    paid = round2(paid + lines.filter((l) => l.accountId).reduce((s, l) => s + l.amount, 0));
  }
  await ctx.db.patch(inv._id, {
    amountPaid: paid,
    status: inv.status === "cancelled" ? "cancelled" : invoiceStatus(inv.total, paid),
    updatedAt: Date.now(),
  });
}

export async function createInvoice(
  ctx: MutationCtx,
  access: Awaited<ReturnType<typeof requireFinance>>,
  args: {
    contactId?: Id<"contacts">;
    clientName: string;
    clientEmail?: string;
    date: string;
    dueDate: string;
    currency: "USD" | "ZiG";
    lines: Array<{ description: string; quantity: number; unitPrice: number; categoryId?: Id<"finCategories"> }>;
    notes?: string;
    dealCommissionId?: Id<"dealCommissions">;
  }
) {
  if (!isValidDate(args.date) || !isValidDate(args.dueDate)) throw new ConvexError("Enter valid dates");
  if (args.dueDate < args.date) throw new ConvexError("The due date is before the invoice date");
  const lines = args.lines
    .map((l) => ({ ...l, description: l.description.trim(), quantity: round2(l.quantity), unitPrice: round2(l.unitPrice) }))
    .filter((l) => l.description && l.quantity > 0);
  if (!lines.length) throw new ConvexError("Add at least one line");
  for (const l of lines) {
    if (l.categoryId && (await getCategory(ctx, access.orgId, l.categoryId)).kind !== "income") throw new ConvexError("Invoice lines use income categories");
  }
  let clientName = args.clientName.trim();
  let clientEmail = args.clientEmail?.trim() || undefined;
  if (args.contactId) {
    const c = await ctx.db.get(args.contactId);
    if (!c || c.orgId !== access.orgId) throw new ConvexError("Client not found");
    clientName = clientName || c.name;
    clientEmail = clientEmail ?? c.email ?? undefined;
  }
  if (!clientName) throw new ConvexError("Who is the invoice to?");
  const settings = await getSettings(ctx, access.orgId);
  // FN-34: VAT only when the agency is VAT-registered.
  const vatRate = settings.vatEnabled ? settings.vatRate : 0;
  const totals = invoiceTotals(lines, vatRate);
  if (!(totals.total > 0)) throw new ConvexError("The invoice total must be more than zero");
  const number = await nextNumber(ctx, access.orgId, "invoice");
  const now = Date.now();
  const id = await ctx.db.insert("finInvoices", {
    orgId: access.orgId,
    number,
    contactId: args.contactId,
    clientName,
    clientEmail,
    date: args.date,
    dueDate: args.dueDate,
    currency: args.currency,
    lines,
    vatRate,
    ...totals,
    amountPaid: 0,
    status: "unpaid",
    notes: args.notes?.trim() || undefined,
    dealCommissionId: args.dealCommissionId,
    createdByUserId: access.user._id,
    createdAt: now,
    updatedAt: now,
  });
  await financeAudit(ctx, access, {
    action: "finance.invoice_create",
    description: `Invoice ${number} to ${clientName}: ${formatAmount(totals.total, args.currency)}`,
    targetType: "finInvoice",
    targetId: id,
    targetLabel: number,
  });
  return { invoiceId: id, number };
}

export const create = mutation({
  args: {
    contactId: v.optional(v.id("contacts")),
    clientName: v.string(),
    clientEmail: v.optional(v.string()),
    date: v.string(),
    dueDate: v.string(),
    currency: finCurrency,
    lines: v.array(lineArg),
    notes: v.optional(v.string()),
    email: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const { email, ...rest } = args;
    const res = await createInvoice(ctx, access, rest);
    if (email) await sendInvoice(ctx, access, res.invoiceId);
    return res;
  },
});

export const cancel = mutation({
  args: { invoiceId: v.id("finInvoices"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv || inv.orgId !== access.orgId) throw new ConvexError("Invoice not found");
    if (inv.amountPaid > 0) throw new ConvexError("Reverse the payments on this invoice first");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    await ctx.db.patch(inv._id, { status: "cancelled", cancelReason: reason, updatedAt: Date.now() });
    await financeAudit(ctx, access, {
      action: "finance.invoice_cancel",
      description: `Cancelled invoice ${inv.number}: ${reason}`,
      targetType: "finInvoice",
      targetId: inv._id,
      targetLabel: inv.number,
    });
  },
});

/** FN-62: record a payment against an invoice. */
export const recordPayment = mutation({
  args: {
    invoiceId: v.id("finInvoices"),
    date: v.string(),
    accountId: v.id("finAccounts"),
    amount: v.number(),
    method: finMethod,
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv || inv.orgId !== access.orgId) throw new ConvexError("Invoice not found");
    if (inv.status === "cancelled") throw new ConvexError("This invoice is cancelled");
    const account = await getAccount(ctx, access.orgId, args.accountId);
    if (account.currency !== inv.currency) throw new ConvexError(`This invoice is in ${inv.currency}`);
    const amount = round2(args.amount);
    const open = round2(inv.total - inv.amountPaid);
    if (!(amount > 0)) throw new ConvexError("Amount must be more than zero");
    if (amount > open) throw new ConvexError(`Only ${formatAmount(open, inv.currency)} is unpaid`);
    // Split the payment across categories in proportion to the lines.
    const fallback = await categoryByKey(ctx, access.orgId, inv.dealCommissionId ? "sales_commission" : "other_income");
    const shares = new Map<string, number>();
    for (const l of inv.lines) {
      const k = (l.categoryId ?? fallback) as string;
      shares.set(k, round2((shares.get(k) ?? 0) + l.quantity * l.unitPrice));
    }
    const ledgerLines: NewLine[] = [];
    let left = amount;
    const keys = [...shares.keys()];
    keys.forEach((k, i) => {
      const part = i === keys.length - 1 ? left : round2((amount * shares.get(k)!) / inv.subtotal);
      left = round2(left - part);
      ledgerLines.push({ currency: inv.currency, amount: part, ledger: "agency", categoryId: k as Id<"finCategories"> });
    });
    const number = await nextNumber(ctx, access.orgId, "receipt");
    const txId = await postTransaction(
      ctx,
      access,
      {
        date: args.date,
        kind: "receipt",
        number,
        description: `Payment on invoice ${inv.number}`,
        method: args.method,
        reference: args.reference?.trim() || undefined,
        contactId: inv.contactId,
        counterparty: inv.clientName,
        invoiceId: inv._id,
        dealCommissionId: inv.dealCommissionId,
      },
      [{ currency: inv.currency, amount, accountId: account._id }, ...ledgerLines]
    );
    await recomputeInvoice(ctx, inv._id);
    await financeAudit(ctx, access, {
      action: "finance.invoice_payment",
      description: `Receipt ${number}: ${formatAmount(amount, inv.currency)} on invoice ${inv.number}`,
      targetType: "finInvoice",
      targetId: inv._id,
      targetLabel: inv.number,
    });
    return { txId, number };
  },
});

async function sendInvoice(ctx: MutationCtx, access: Awaited<ReturnType<typeof requireFinance>>, invoiceId: Id<"finInvoices">) {
  const inv = (await ctx.db.get(invoiceId))!;
  if (!inv.clientEmail) throw new ConvexError("The client has no email address");
  await queueDocumentEmail(
    ctx,
    access.orgId,
    documentEmail({
      agency: agencyOf(access.org),
      to: inv.clientEmail,
      name: inv.clientName,
      subject: `Invoice ${inv.number} from ${access.org.name}`,
      intro: `Please find invoice ${inv.number} below.`,
      lines: {
        head: ["Description", "Qty", "Price", "Amount"],
        body: inv.lines.map((l) => [l.description, String(l.quantity), formatAmount(l.unitPrice, inv.currency), formatAmount(l.quantity * l.unitPrice, inv.currency)]),
      },
      items: [
        ["Invoice date", dateLabel(inv.date)],
        ["Due date", dateLabel(inv.dueDate)],
        ...(inv.vat > 0 ? ([["Subtotal", formatAmount(inv.subtotal, inv.currency)], [`VAT ${inv.vatRate}%`, formatAmount(inv.vat, inv.currency)]] as Array<[string, string]>) : []),
        ["Total", formatAmount(inv.total, inv.currency)],
        ...(inv.amountPaid > 0 ? ([["Still to pay", formatAmount(inv.total - inv.amountPaid, inv.currency)]] as Array<[string, string]>) : []),
      ],
      outro: inv.notes,
      kind: "finance_invoice",
      relatedType: "finInvoice",
      relatedId: inv._id,
    }),
    invoiceDocument({ ...inv, clientEmail: inv.clientEmail, notes: inv.notes, agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" } }),
    access.user._id
  );
  await ctx.db.patch(inv._id, { emailedAt: Date.now() });
}

export const email = mutation({
  args: { invoiceId: v.id("finInvoices") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv || inv.orgId !== access.orgId) throw new ConvexError("Invoice not found");
    await sendInvoice(ctx, access, inv._id);
  },
});

/**
 * Agency invoices and Sync Stay rent invoices in one list, with age. `open`
 * limits it to what is still unpaid (FN-62).
 */
export const list = query({
  args: { open: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const today = await todayForOrg(ctx, access.orgId);
    const invs = await ctx.db
      .query("finInvoices")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(1000);
    type Row = {
      _id: string;
      source: "finance" | "stay";
      number: string;
      clientName: string;
      date: string;
      dueDate: string;
      currency: "USD" | "ZiG";
      total: number;
      paid: number;
      open: number;
      status: string;
      daysOverdue: number;
      description: string;
    };
    const rows: Row[] = invs
      .filter((i) => !args.open || i.status === "unpaid" || i.status === "part_paid")
      .map((i) => ({
        _id: i._id as string,
        source: "finance",
        number: i.number,
        clientName: i.clientName,
        date: i.date,
        dueDate: i.dueDate,
        currency: i.currency,
        total: i.total,
        paid: i.amountPaid,
        open: round2(i.total - i.amountPaid),
        status: i.status,
        daysOverdue: i.status === "paid" || i.status === "cancelled" || i.dueDate >= today ? 0 : daysBetween(i.dueDate, today),
        description: i.lines.map((l) => l.description).join(", "),
      }));
    const charges = await ctx.db
      .query("stayCharges")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(2000);
    const shown = charges.filter((c) => c.status !== "cancelled" && (!args.open || outstanding(c) > 0));
    const leases = (await Promise.all([...new Set(shown.map((c) => c.leaseId))].map((id) => ctx.db.get(id)))).filter((l) => !!l);
    const label = await leaseLabels(ctx, leases);
    const leaseMap = new Map(leases.map((l) => [l._id as string, l]));
    for (const c of shown) {
      const l = leaseMap.get(c.leaseId);
      const lab = l ? label(l) : null;
      rows.push({
        _id: c._id as string,
        source: "stay",
        number: c.period ? `Rent ${c.period}` : c.kind.replace("_", " "),
        clientName: lab ? `${lab.tenantName} (${lab.propertyName}, ${lab.unitLabel})` : "Tenant",
        date: c.dueDate,
        dueDate: c.dueDate,
        currency: c.currency,
        total: c.amount,
        paid: c.amountPaid,
        open: outstanding(c),
        status: c.status,
        daysOverdue: outstanding(c) > 0 && c.dueDate < today ? daysBetween(c.dueDate, today) : 0,
        description: c.description,
      });
    }
    return rows.sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  },
});

export const get = query({
  args: { invoiceId: v.id("finInvoices") },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv || inv.orgId !== access.orgId) return null;
    const payments = await ctx.db
      .query("finTransactions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", inv._id))
      .collect();
    return {
      ...inv,
      agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" },
      payments: payments.map((p) => ({ _id: p._id, date: p.date, number: p.number ?? "", reversed: !!p.reversedAt, isReversal: !!p.reversalOfId })),
    };
  },
});
