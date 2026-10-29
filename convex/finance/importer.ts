/**
 * Moving an agency onto Sync Finance from Excel and receipt books.
 *
 *  - opening: balances at go-live per account, landlord and tenant deposit
 *    (FN-02). Trust account balances start "unallocated"; each landlord and
 *    deposit balance is taken out of unallocated, so what is left shows money
 *    in trust nobody has been matched to yet.
 *  - transactions: historical receipts and payments (a year of the receipt
 *    book), keeping their original numbers.
 *  - stands: clients already on payment plans, with what they paid so far.
 *
 * The app parses the file (src/lib/finance/import.ts) and sends rows in
 * batches. Each import is a finImports row; everything it posted carries the
 * importId, so undo() reverses a whole import in one action.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { normalizePhone } from "../contacts";
import { nameMaps } from "../stay/shared";
import {
  FinanceAccess,
  ensureCategories,
  financeAudit,
  getSettings,
  listAccounts,
  ledgerBalance,
  postTransaction,
  requireDirector,
  requireFinance,
  reverseTransaction,
  todayForOrg,
  userLabel,
} from "./core";
import { buildPlan, checkDate, round2 } from "./lib";
import { finAccountType, finCurrency } from "../schemas/finance";
import { insertStand, recomputeStand } from "./stands";

type RowResult = { row: number; ok: boolean; message?: string };

async function getImport(ctx: MutationCtx, access: FinanceAccess, id: Id<"finImports">) {
  const imp = await ctx.db.get(id);
  if (!imp || imp.orgId !== access.orgId) throw new ConvexError("Import not found");
  if (imp.undoneAt) throw new ConvexError("This import was undone");
  return imp;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Find an org contact by phone, email or exact name (in that order). */
async function findContact(ctx: MutationCtx, orgId: Id<"organizations">, who: { name: string; phone?: string; email?: string }, filter?: (c: Doc<"contacts">) => boolean) {
  const all = (
    await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect()
  ).filter((c) => !filter || filter(c));
  const phone = who.phone ? normalizePhone(who.phone) : "";
  if (phone.length >= 7) {
    const m = all.filter((c) => c.normalizedPhone === phone);
    if (m.length === 1) return m[0];
  }
  const email = who.email?.trim().toLowerCase();
  if (email) {
    const m = all.filter((c) => c.email?.trim().toLowerCase() === email);
    if (m.length === 1) return m[0];
  }
  const m = all.filter((c) => norm(c.name) === norm(who.name));
  if (m.length === 1) return m[0];
  if (m.length > 1) throw new ConvexError(`More than one contact is called "${who.name}". Add a phone or email to tell them apart.`);
  return null;
}

export const start = mutation({
  args: { kind: v.union(v.literal("opening"), v.literal("transactions"), v.literal("stands")), fileName: v.string(), rowCount: v.number() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    return ctx.db.insert("finImports", {
      orgId: access.orgId,
      kind: args.kind,
      fileName: args.fileName.slice(0, 200),
      rowCount: args.rowCount,
      okCount: 0,
      errors: [],
      createdByUserId: access.user._id,
      createdAt: Date.now(),
    });
  },
});

async function record(ctx: MutationCtx, imp: Doc<"finImports">, results: RowResult[]) {
  await ctx.db.patch(imp._id, {
    okCount: imp.okCount + results.filter((r) => r.ok).length,
    errors: [...imp.errors, ...results.filter((r) => !r.ok).map((r) => ({ row: r.row, message: r.message ?? "Failed" }))].slice(0, 500),
  });
}

async function eachRow<T extends { row: number }>(rows: T[], fn: (r: T) => Promise<void>): Promise<RowResult[]> {
  if (rows.length > 100) throw new ConvexError("Send at most 100 rows per batch");
  const out: RowResult[] = [];
  for (const r of rows) {
    try {
      await fn(r);
      out.push({ row: r.row, ok: true });
    } catch (e) {
      // One bad row must not undo the rest of the batch.
      out.push({ row: r.row, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// ── Opening balances ─────────────────────────────────────────────────

export const openingBatch = mutation({
  args: {
    importId: v.id("finImports"),
    date: v.string(),
    rows: v.array(
      v.object({
        row: v.number(),
        type: v.union(v.literal("account"), v.literal("landlord"), v.literal("deposit")),
        name: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        currency: finCurrency,
        amount: v.number(),
        accountType: v.optional(finAccountType),
      })
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const imp = await getImport(ctx, access, args.importId);
    const settings = await getSettings(ctx, access.orgId);
    // Checked once up front: a row must not write Stay records and then fail.
    const dateErr = checkDate(args.date, await todayForOrg(ctx, access.orgId), settings.lockedThrough);
    if (dateErr) throw new ConvexError(`Go-live date: ${dateErr}`);
    const results = await eachRow(args.rows, async (r) => {
      const amount = round2(r.amount);
      if (amount === 0) throw new ConvexError("Amount is zero");
      const header = { date: args.date, kind: "opening" as const, importId: imp._id };
      if (r.type === "account") {
        const accounts = await listAccounts(ctx, access.orgId);
        let acc = accounts.find((a) => norm(a.name) === norm(r.name));
        if (!acc) {
          const now = Date.now();
          const id = await ctx.db.insert("finAccounts", { orgId: access.orgId, name: r.name.trim(), type: r.accountType ?? "trust", currency: r.currency, isActive: true, createdAt: now, updatedAt: now });
          acc = (await ctx.db.get(id))!;
        }
        if (acc.currency !== r.currency) throw new ConvexError(`${acc.name} is in ${acc.currency}`);
        // Trust money starts unallocated until landlords and deposits claim it;
        // business and cash balances are the agency's own.
        await postTransaction(
          ctx,
          access,
          { ...header, description: `Opening balance: ${acc.name}` },
          [
            { currency: r.currency, amount, accountId: acc._id },
            acc.type === "trust" ? { currency: r.currency, amount, ledger: "unallocated" } : { currency: r.currency, amount, ledger: "agency" },
          ],
          { allowNegative: true }
        );
      } else if (r.type === "landlord") {
        const c = await findContact(ctx, access.orgId, r, (x) => x.ownerType === "landlord" || x.ownerType === "both");
        if (!c) throw new ConvexError(`No landlord called "${r.name}". Add them in Sync Stay or Owners first.`);
        await postTransaction(
          ctx,
          access,
          { ...header, description: `Opening balance: ${c.name}`, contactId: c._id },
          [
            { currency: r.currency, amount, ledger: "landlord", key: c._id },
            { currency: r.currency, amount: -amount, ledger: "unallocated" },
          ],
          { allowNegative: true }
        );
      } else {
        const c = await findContact(ctx, access.orgId, r, (x) => !!x.isLeaseTenant);
        if (!c) throw new ConvexError(`No tenant called "${r.name}" in Sync Stay`);
        const leases = (
          await ctx.db
            .query("stayLeases")
            .withIndex("by_tenant", (q) => q.eq("tenantContactId", c._id))
            .collect()
        ).filter((l) => l.status === "active" && l.currency === r.currency);
        if (leases.length !== 1) throw new ConvexError(`${c.name} needs exactly one active ${r.currency} lease (found ${leases.length})`);
        const lease = leases[0];
        let deposit = await ctx.db
          .query("stayDeposits")
          .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
          .first();
        if (deposit && ((await ledgerBalance(ctx, access.orgId, "deposit", deposit._id))[r.currency] ?? 0) !== 0) {
          throw new ConvexError(`${c.name}'s deposit already has a balance in Finance`);
        }
        const now = Date.now();
        if (!deposit) {
          // Sync Stay has no record of this deposit yet: add it, so both modules agree.
          const id = await ctx.db.insert("stayDeposits", {
            orgId: access.orgId,
            leaseId: lease._id,
            stayPropertyId: lease.stayPropertyId,
            currency: r.currency,
            amountExpected: lease.depositAmount || amount,
            amountReceived: amount,
            amountApplied: 0,
            amountRefunded: 0,
            heldIn: settings.depositHeldIn,
            status: "held",
            movements: [{ kind: "received", amount, date: args.date, note: "Opening balance (import)", byUserId: access.user._id, at: now }],
            createdAt: now,
            updatedAt: now,
          });
          deposit = (await ctx.db.get(id))!;
        }
        await postTransaction(
          ctx,
          access,
          { ...header, description: `Opening deposit: ${c.name}`, contactId: c._id, leaseId: lease._id, stayPropertyId: lease.stayPropertyId },
          [
            { currency: r.currency, amount, ledger: "deposit", key: deposit._id, stayPropertyId: lease.stayPropertyId },
            { currency: r.currency, amount: -amount, ledger: "unallocated" },
          ],
          { allowNegative: true }
        );
      }
    });
    await record(ctx, imp, results);
    return results;
  },
});

// ── Historical transactions ──────────────────────────────────────────

export const transactionsBatch = mutation({
  args: {
    importId: v.id("finImports"),
    rows: v.array(
      v.object({
        row: v.number(),
        date: v.string(),
        account: v.string(),
        direction: v.union(v.literal("in"), v.literal("out")),
        amount: v.number(),
        description: v.string(),
        category: v.optional(v.string()),
        number: v.optional(v.string()),
        reference: v.optional(v.string()),
        party: v.optional(v.string()),
        landlord: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const imp = await getImport(ctx, access, args.importId);
    const accounts = await listAccounts(ctx, access.orgId);
    const results = await eachRow(args.rows, async (r) => {
      const acc = accounts.find((a) => norm(a.name) === norm(r.account));
      if (!acc) throw new ConvexError(`No account called "${r.account}". Add it in Finance settings first.`);
      const amount = round2(Math.abs(r.amount));
      if (!(amount > 0)) throw new ConvexError("Amount is zero");
      const sign = r.direction === "in" ? 1 : -1;
      const kind = r.direction === "in" ? ("receipt" as const) : ("payment" as const);
      let ledgerLine;
      let contactId: Id<"contacts"> | undefined;
      if (r.landlord?.trim()) {
        const c = await findContact(ctx, access.orgId, { name: r.landlord }, (x) => x.ownerType === "landlord" || x.ownerType === "both");
        if (!c) throw new ConvexError(`No landlord called "${r.landlord}"`);
        contactId = c._id;
        ledgerLine = { currency: acc.currency, amount: sign * amount, ledger: "landlord" as const, key: c._id };
      } else {
        const want = r.direction === "in" ? "income" : "expense";
        const cats = await ensureCategories(ctx, access.orgId);
        const name = r.category?.trim() || (want === "income" ? "Other income" : "Other expenses");
        let cat = cats.find((c) => c.kind === want && norm(c.name) === norm(name));
        if (!cat) {
          const id = await ctx.db.insert("finCategories", { orgId: access.orgId, name, kind: want, isActive: true, createdAt: Date.now() });
          cat = (await ctx.db.get(id))!;
        }
        ledgerLine = { currency: acc.currency, amount: sign * amount, ledger: "agency" as const, categoryId: cat._id };
      }
      await postTransaction(
        ctx,
        access,
        {
          date: r.date,
          kind,
          number: r.number?.trim() || undefined,
          description: r.description.trim() || (kind === "receipt" ? "Money in" : "Money out"),
          reference: r.reference?.trim() || undefined,
          counterparty: r.party?.trim() || undefined,
          contactId,
          importId: imp._id,
        },
        [{ currency: acc.currency, amount: sign * amount, accountId: acc._id }, ledgerLine],
        { allowNegative: true }
      );
    });
    await record(ctx, imp, results);
    return results;
  },
});

// ── Clients on payment plans ─────────────────────────────────────────

export const standsBatch = mutation({
  args: {
    importId: v.id("finImports"),
    rows: v.array(
      v.object({
        row: v.number(),
        development: v.string(),
        standNumber: v.string(),
        buyerName: v.string(),
        buyerPhone: v.optional(v.string()),
        buyerEmail: v.optional(v.string()),
        price: v.number(),
        deposit: v.number(),
        depositDue: v.string(),
        instalments: v.number(),
        firstDue: v.string(),
        paidToDate: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const imp = await getImport(ctx, access, args.importId);
    const devs = await ctx.db
      .query("finDevelopments")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
    const results = await eachRow(args.rows, async (r) => {
      const dev = devs.find((d) => norm(d.name) === norm(r.development));
      if (!dev) throw new ConvexError(`No development called "${r.development}". Add it under Instalments first.`);
      const buyer = await findContact(ctx, access.orgId, { name: r.buyerName, phone: r.buyerPhone, email: r.buyerEmail });
      await insertStand(ctx, access, {
        developmentId: dev._id,
        standNumber: r.standNumber,
        buyerContactId: buyer?._id,
        buyerName: r.buyerName,
        buyerEmail: r.buyerEmail,
        buyerPhone: r.buyerPhone,
        price: r.price,
        schedule: buildPlan(r.price, r.deposit, r.depositDue, r.instalments, r.firstDue),
        openingPaid: r.paidToDate,
        importId: imp._id,
      });
    });
    await record(ctx, imp, results);
    return results;
  },
});

// ── Review and undo ──────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const rows = await ctx.db
      .query("finImports")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(50);
    const names = await nameMaps(ctx, { users: rows.map((r) => r.createdByUserId) });
    return rows.map((r) => ({ ...r, by: userLabel(names.user(r.createdByUserId)) }));
  },
});

/** Reverse everything an import posted and cancel the plans it added. */
export const undo = mutation({
  args: { importId: v.id("finImports"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const imp = await getImport(ctx, access, args.importId);
    const reason = args.reason.trim() || "Import undone";
    const txs = await ctx.db
      .query("finTransactions")
      .withIndex("by_import", (q) => q.eq("importId", imp._id))
      .collect();
    let reversed = 0;
    let total = 0;
    for (const t of txs) {
      if (t.reversedAt || t.reversalOfId) continue;
      await reverseTransaction(ctx, access, t._id, `Undo import: ${reason}`);
      reversed++;
    }
    const stands = await ctx.db
      .query("finStands")
      .withIndex("by_import", (q) => q.eq("importId", imp._id))
      .collect();
    for (const s of stands) {
      if (s.status === "cancelled") continue;
      await ctx.db.patch(s._id, { status: "cancelled", updatedAt: Date.now() });
      await recomputeStand(ctx, s._id);
      total++;
    }
    await ctx.db.patch(imp._id, { undoneAt: Date.now(), undoneByUserId: access.user._id });
    await financeAudit(ctx, access, {
      action: "finance.import_undo",
      description: `Undid import "${imp.fileName}": ${reversed} transactions reversed, ${total} plans cancelled (${reason})`,
      targetType: "finImport",
      targetId: imp._id,
    });
    return { reversed, cancelled: total };
  },
});
