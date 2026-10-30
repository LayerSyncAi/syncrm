/**
 * SyncFinance set-up (BRD 5.1): agency settings (FN-05), bank accounts and
 * cash floats (FN-01), income and expense categories (FN-03) and closing a
 * month (period lock). Agency details for documents (FN-04) are the Hub's
 * agency settings and brand kit, shared by every module.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  accountBalance,
  ensureCategories,
  ensureSettings,
  financeAudit,
  getAccount,
  getCategory,
  getSettings,
  listAccounts,
  listCategories,
  requireDirector,
  requireFinance,
  requireFinanceStaff,
  todayForOrg,
} from "./core";
import { isValidPeriod } from "../stay/ledger";
import { finAccountType, finCurrency } from "../schemas/finance";

/** Seed defaults on first open. Safe to call every time. */
export const init = mutation({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    if (!access.isStaff) return;
    await ensureSettings(ctx, access.orgId);
    await ensureCategories(ctx, access.orgId);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireFinance(ctx);
    const settings = await getSettings(ctx, access.orgId);
    const accounts = await listAccounts(ctx, access.orgId);
    const categories = await listCategories(ctx, access.orgId);
    return {
      settings,
      accounts: await Promise.all(
        accounts.map(async (a) => ({
          ...a,
          balance: access.isStaff ? await accountBalance(ctx, a._id) : 0,
          // Type and currency are fixed once an account has transactions.
          used: !!(await ctx.db
            .query("finLines")
            .withIndex("by_account_date", (q) => q.eq("accountId", a._id))
            .first()),
        }))
      ),
      categories: categories.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "income" ? -1 : 1)),
      today: await todayForOrg(ctx, access.orgId),
      role: { isDirector: access.isDirector, isStaff: access.isStaff, canApprove: access.canApprove },
    };
  },
});

export const update = mutation({
  args: {
    commissionTiming: v.union(v.literal("on_receipt"), v.literal("month_end")),
    landlordPayouts: v.union(v.literal("per_receipt"), v.literal("monthly")),
    depositHeldIn: v.union(v.literal("trust"), v.literal("business"), v.literal("landlord")),
    vatEnabled: v.boolean(),
    vatRate: v.number(),
    approvers: v.union(v.literal("one"), v.literal("two")),
    invoicePrefix: v.string(),
    payoutPrefix: v.string(),
    paymentPrefix: v.string(),
    standReminderDays: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    if (!(args.vatRate >= 0 && args.vatRate <= 50)) throw new ConvexError("VAT rate must be between 0 and 50%");
    const days = Math.round(args.standReminderDays);
    if (days < 1 || days > 30) throw new ConvexError("Reminder days must be between 1 and 30");
    for (const p of [args.invoicePrefix, args.payoutPrefix, args.paymentPrefix]) {
      if (p.trim().length > 12) throw new ConvexError("Number prefixes are at most 12 characters");
    }
    const row = await ensureSettings(ctx, access.orgId);
    await ctx.db.patch(row._id, {
      ...args,
      invoicePrefix: args.invoicePrefix.trim(),
      payoutPrefix: args.payoutPrefix.trim(),
      paymentPrefix: args.paymentPrefix.trim(),
      standReminderDays: days,
      updatedAt: Date.now(),
    });
    await financeAudit(ctx, access, {
      action: "finance.settings_update",
      description: "Updated SyncFinance settings",
      targetType: "finSettings",
      targetId: row._id,
      metadata: args,
    });
  },
});

// ── Accounts ─────────────────────────────────────────────────────────

const accountArgs = {
  name: v.string(),
  type: finAccountType,
  currency: finCurrency,
  bankName: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  branch: v.optional(v.string()),
};

const clean = (s?: string) => s?.trim() || undefined;

export const createAccount = mutation({
  args: accountArgs,
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Name the account");
    const now = Date.now();
    const id = await ctx.db.insert("finAccounts", {
      orgId: access.orgId,
      name,
      type: args.type,
      currency: args.currency,
      bankName: clean(args.bankName),
      accountNumber: clean(args.accountNumber),
      branch: clean(args.branch),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await financeAudit(ctx, access, { action: "finance.account_create", description: `Added ${args.type} account ${name} (${args.currency})`, targetType: "finAccount", targetId: id });
    return id;
  },
});

/** Rename, change bank details or switch off. Type and currency are fixed once used. */
export const updateAccount = mutation({
  args: { accountId: v.id("finAccounts"), isActive: v.boolean(), ...accountArgs },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    const a = await getAccount(ctx, access.orgId, args.accountId);
    const used = await ctx.db
      .query("finLines")
      .withIndex("by_account_date", (q) => q.eq("accountId", a._id))
      .first();
    if (used && (args.type !== a.type || args.currency !== a.currency)) {
      throw new ConvexError("This account has transactions. Its type and currency can no longer change.");
    }
    if (!args.isActive && a.isActive && (await accountBalance(ctx, a._id)) !== 0) {
      throw new ConvexError("Move the balance out before switching this account off");
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError("Name the account");
    await ctx.db.patch(a._id, {
      name,
      type: args.type,
      currency: args.currency,
      bankName: clean(args.bankName),
      accountNumber: clean(args.accountNumber),
      branch: clean(args.branch),
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    await financeAudit(ctx, access, { action: "finance.account_update", description: `Updated account ${name}`, targetType: "finAccount", targetId: a._id });
  },
});

// ── Categories ───────────────────────────────────────────────────────

export const createCategory = mutation({
  args: { name: v.string(), kind: v.union(v.literal("income"), v.literal("expense")) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Name the category");
    const all = await ensureCategories(ctx, access.orgId);
    if (all.some((c) => c.kind === args.kind && c.name.toLowerCase() === name.toLowerCase())) throw new ConvexError("That category already exists");
    return ctx.db.insert("finCategories", { orgId: access.orgId, name, kind: args.kind, isActive: true, createdAt: Date.now() });
  },
});

/** Rename or hide. Categories the system posts to stay on. */
export const updateCategory = mutation({
  args: { categoryId: v.id("finCategories"), name: v.string(), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireFinanceStaff(access);
    const c = await getCategory(ctx, access.orgId, args.categoryId);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Name the category");
    if (c.key && !args.isActive) throw new ConvexError("This category is used by the system and stays on");
    await ctx.db.patch(c._id, { name, isActive: args.isActive });
  },
});

// ── Period lock ──────────────────────────────────────────────────────

/** Close every month up to and including `month`. Reopening needs a director too. */
export const setLockedThrough = mutation({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireFinance(ctx);
    requireDirector(access);
    if (args.month !== undefined && !isValidPeriod(args.month)) throw new ConvexError("Pick a month");
    const today = await todayForOrg(ctx, access.orgId);
    if (args.month && args.month >= today.slice(0, 7)) throw new ConvexError("Only past months can be closed");
    const row = await ensureSettings(ctx, access.orgId);
    await ctx.db.patch(row._id, { lockedThrough: args.month, updatedAt: Date.now() });
    await financeAudit(ctx, access, {
      action: "finance.period_lock",
      description: args.month ? `Closed months up to ${args.month}` : "Reopened all months",
      targetType: "finSettings",
      targetId: row._id,
      metadata: { from: row.lockedThrough ?? null, to: args.month ?? null },
    });
  },
});
