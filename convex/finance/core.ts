/**
 * SyncFinance server core: who may do what (BRD §4), settings, accounts and
 * categories, and the one place money is posted or reversed.
 *
 * Every write that moves money goes through postTransaction, which checks
 * the posting balances, the date is in an open month and no client ledger
 * goes below zero (FN-24). Reversals go through reverseTransaction.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireModuleUser } from "../lib/moduleAccess";
import { hasEstateRole, orgModules } from "../lib/modules";
import { recordAudit } from "../logs";
import { allocateReceiptNumber, todayForOrg, userLabel } from "../stay/shared";
import { formatAmount, formatReceiptNumber } from "../stay/ledger";
import {
  CLIENT_LEDGERS,
  DEFAULT_CATEGORIES,
  FinCurrency,
  FinLedger,
  checkDate,
  checkPosting,
  round2,
} from "./lib";

type Ctx = QueryCtx | MutationCtx;

// ── Access ───────────────────────────────────────────────────────────

export type FinanceAccess = Awaited<ReturnType<typeof requireFinance>>;

export async function requireFinance(ctx: Ctx) {
  const { user, org } = await requireModuleUser(ctx, "finance");
  const isDirector = user.role === "admin" && !user.agentMode;
  const isAccounts = hasEstateRole(user, "accounts");
  return {
    user,
    org,
    orgId: user.orgId,
    isDirector,
    /** Director or accounts: every finance record. */
    isStaff: isDirector || isAccounts,
    /** Approves payouts and transfers, closes months, reverses. */
    canApprove: isDirector,
  };
}

/** Director or accounts clerk. Property managers only see their landlords. */
export function requireFinanceStaff(access: FinanceAccess) {
  if (!access.isStaff) throw new ConvexError("Your role cannot see this part of SyncFinance");
}

export function requireDirector(access: FinanceAccess) {
  if (!access.canApprove) throw new ConvexError("Director access required");
}

export function financeOn(org: Doc<"organizations"> | null): boolean {
  return !!org && orgModules(org).includes("finance");
}

/**
 * Landlord contact ids a user may see: every landlord for staff, otherwise
 * the landlords of the Stay properties the user manages.
 */
export async function visibleLandlordIds(ctx: Ctx, access: FinanceAccess): Promise<Set<string> | "all"> {
  if (access.isStaff) return "all";
  const sps = await ctx.db
    .query("stayProperties")
    .withIndex("by_org_manager", (q) => q.eq("orgId", access.orgId).eq("managerUserId", access.user._id))
    .collect();
  return new Set(sps.map((sp) => sp.landlordContactId as string));
}

export async function financeAudit(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
  args: { action: string; description: string; targetType: string; targetId: string; targetLabel?: string; metadata?: Record<string, unknown> }
) {
  await recordAudit(ctx, { actorUserId: access.user._id, actorLabel: userLabel(access.user), category: "finance", orgId: access.orgId, ...args });
}

// ── Settings ─────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
  // iProperties' way is the default (BRD §10).
  commissionTiming: "on_receipt" as const,
  landlordPayouts: "per_receipt" as const,
  depositHeldIn: "trust" as const,
  vatEnabled: false,
  vatRate: 15,
  approvers: "one" as const,
  invoicePrefix: "INV-",
  nextInvoiceSeq: 1,
  payoutPrefix: "PO-",
  nextPayoutSeq: 1,
  paymentPrefix: "PV-",
  nextPaymentSeq: 1,
  standReminderDays: 7,
};

export type FinSettingsView = Omit<Doc<"finSettings">, "_id" | "_creationTime" | "orgId" | "updatedAt">;

export async function getSettings(ctx: Ctx, orgId: Id<"organizations">): Promise<FinSettingsView> {
  const row = await ctx.db
    .query("finSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return { ...SETTINGS_DEFAULTS };
  const { _id, _creationTime, orgId: _o, updatedAt, ...rest } = row;
  void _id;
  void _creationTime;
  void _o;
  void updatedAt;
  return rest;
}

export async function ensureSettings(ctx: MutationCtx, orgId: Id<"organizations">): Promise<Doc<"finSettings">> {
  const row = await ctx.db
    .query("finSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (row) return row;
  const id = await ctx.db.insert("finSettings", { orgId, ...SETTINGS_DEFAULTS, updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}

/** Next number in one of the finance sequences, allocated in the caller's transaction. */
export async function nextNumber(ctx: MutationCtx, orgId: Id<"organizations">, kind: "receipt" | "invoice" | "payout" | "payment"): Promise<string> {
  // One receipt sequence per agency across Stay and Finance (FN-12).
  if (kind === "receipt") return allocateReceiptNumber(ctx, orgId);
  const s = await ensureSettings(ctx, orgId);
  const field = kind === "invoice" ? "nextInvoiceSeq" : kind === "payout" ? "nextPayoutSeq" : "nextPaymentSeq";
  const prefix = kind === "invoice" ? s.invoicePrefix : kind === "payout" ? s.payoutPrefix : s.paymentPrefix;
  const seq = s[field];
  await ctx.db.patch(s._id, { [field]: seq + 1, updatedAt: Date.now() });
  return formatReceiptNumber(prefix, seq);
}

// ── Categories ───────────────────────────────────────────────────────

export async function listCategories(ctx: Ctx, orgId: Id<"organizations">): Promise<Doc<"finCategories">[]> {
  return ctx.db
    .query("finCategories")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

/** Seed the default categories once per org. */
export async function ensureCategories(ctx: MutationCtx, orgId: Id<"organizations">): Promise<Doc<"finCategories">[]> {
  const existing = await listCategories(ctx, orgId);
  const keys = new Set(existing.map((c) => c.key).filter(Boolean));
  const names = new Set(existing.map((c) => c.name.toLowerCase()));
  const now = Date.now();
  let added = false;
  for (const c of DEFAULT_CATEGORIES) {
    if (c.key ? keys.has(c.key) : names.has(c.name.toLowerCase())) continue;
    // Without a key, a category is only seeded on the very first run.
    if (!c.key && existing.length) continue;
    await ctx.db.insert("finCategories", { orgId, name: c.name, kind: c.kind, key: c.key, isActive: true, createdAt: now });
    added = true;
  }
  return added ? listCategories(ctx, orgId) : existing;
}

export async function categoryByKey(ctx: MutationCtx, orgId: Id<"organizations">, key: string): Promise<Id<"finCategories">> {
  const all = await ensureCategories(ctx, orgId);
  const c = all.find((x) => x.key === key);
  if (!c) throw new ConvexError(`Missing category ${key}`);
  return c._id;
}

export async function getCategory(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finCategories">): Promise<Doc<"finCategories">> {
  const c = await ctx.db.get(id);
  if (!c || c.orgId !== orgId) throw new ConvexError("Category not found");
  return c;
}

// ── Accounts ─────────────────────────────────────────────────────────

export async function listAccounts(ctx: Ctx, orgId: Id<"organizations">): Promise<Doc<"finAccounts">[]> {
  return ctx.db
    .query("finAccounts")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

export async function getAccount(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finAccounts">): Promise<Doc<"finAccounts">> {
  const a = await ctx.db.get(id);
  if (!a || a.orgId !== orgId) throw new ConvexError("Account not found");
  return a;
}

const DEFAULT_ACCOUNT_NAMES = { trust: "Trust account", business: "Business account", cash: "Cash float" } as const;

/**
 * The first active account of a type and currency, created on first use so
 * posting from SyncStay never fails for want of set-up. The agency renames
 * it and adds bank details in settings.
 */
export async function ensureAccount(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  type: Doc<"finAccounts">["type"],
  currency: FinCurrency
): Promise<Doc<"finAccounts">> {
  const all = await listAccounts(ctx, orgId);
  const found = all.find((a) => a.isActive && a.type === type && a.currency === currency);
  if (found) return found;
  const now = Date.now();
  const id = await ctx.db.insert("finAccounts", {
    orgId,
    name: `${DEFAULT_ACCOUNT_NAMES[type]} (${currency})`,
    type,
    currency,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

/** Where money paid by a method lands by default: cash in the float, the rest in trust. */
export async function receivingAccount(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  method: string,
  currency: FinCurrency,
  clientMoney: boolean
): Promise<Doc<"finAccounts">> {
  if (method === "cash") return ensureAccount(ctx, orgId, "cash", currency);
  return ensureAccount(ctx, orgId, clientMoney ? "trust" : "business", currency);
}

// ── Balances ─────────────────────────────────────────────────────────

export type Totals = Partial<Record<FinCurrency, number>>;

function addLine(t: Totals, currency: FinCurrency, amount: number) {
  t[currency] = round2((t[currency] ?? 0) + amount);
}

/** What one ledger owner holds, per currency. */
export async function ledgerBalance(ctx: Ctx, orgId: Id<"organizations">, ledger: FinLedger, key: string): Promise<Totals> {
  const lines = await ctx.db
    .query("finLines")
    .withIndex("by_org_ledger_key", (q) => q.eq("orgId", orgId).eq("ledger", ledger).eq("key", key))
    .collect();
  const t: Totals = {};
  for (const l of lines) addLine(t, l.currency, l.amount);
  return t;
}

/** Balance of every owner in a ledger: key -> currency -> amount. */
export async function ledgerBalances(ctx: Ctx, orgId: Id<"organizations">, ledger: FinLedger, upTo?: string) {
  const lines = await ctx.db
    .query("finLines")
    .withIndex("by_org_ledger_date", (q) => (upTo ? q.eq("orgId", orgId).eq("ledger", ledger).lte("date", upTo) : q.eq("orgId", orgId).eq("ledger", ledger)))
    .collect();
  const by = new Map<string, Totals>();
  for (const l of lines) {
    const k = l.key ?? "";
    const t = by.get(k) ?? {};
    addLine(t, l.currency, l.amount);
    by.set(k, t);
  }
  return by;
}

/**
 * Account balance in its currency, optionally up to and including a date:
 * the monthly totals before that month plus that month's lines up to the date.
 */
export async function accountBalance(ctx: Ctx, accountId: Id<"finAccounts">, upTo?: string): Promise<number> {
  const months = await ctx.db
    .query("finAccountMonths")
    .withIndex("by_account_month", (q) => (upTo ? q.eq("accountId", accountId).lt("month", upTo.slice(0, 7)) : q.eq("accountId", accountId)))
    .collect();
  let total = months.reduce((s, m) => s + m.net, 0);
  if (upTo) {
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_account_date", (q) => q.eq("accountId", accountId).gte("date", `${upTo.slice(0, 7)}-01`).lte("date", upTo))
      .collect();
    total += lines.reduce((s, l) => s + l.amount, 0);
  }
  return round2(total);
}

/** Keep the monthly total in step with a posted account line. */
export async function addToAccountMonth(ctx: MutationCtx, orgId: Id<"organizations">, accountId: Id<"finAccounts">, date: string, amount: number) {
  const month = date.slice(0, 7);
  const row = await ctx.db
    .query("finAccountMonths")
    .withIndex("by_account_month", (q) => q.eq("accountId", accountId).eq("month", month))
    .unique();
  if (row) await ctx.db.patch(row._id, { net: round2(row.net + amount) });
  else await ctx.db.insert("finAccountMonths", { orgId, accountId, month, net: round2(amount) });
}

// ── Posting ──────────────────────────────────────────────────────────

export type NewLine = {
  currency: FinCurrency;
  amount: number;
  accountId?: Id<"finAccounts">;
  ledger?: FinLedger;
  key?: string;
  categoryId?: Id<"finCategories">;
  stayPropertyId?: Id<"stayProperties">;
};

export type NewTransaction = Omit<
  Doc<"finTransactions">,
  "_id" | "_creationTime" | "orgId" | "createdByUserId" | "createdAt" | "reversedById" | "reversedAt" | "reverseReason"
>;

/**
 * Post one transaction and its lines. `allowNegative` is only for reversals
 * and imports: everything else may not take a client ledger below zero.
 */
export async function postTransaction(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
  tx: NewTransaction,
  lines: NewLine[],
  opts: { allowNegative?: boolean; skipDateCheck?: boolean } = {}
): Promise<Id<"finTransactions">> {
  const clean = lines.map((l) => ({ ...l, amount: round2(l.amount) })).filter((l) => l.amount !== 0);
  const err = checkPosting(clean.map((l) => ({ currency: l.currency, amount: l.amount, accountId: l.accountId, ledger: l.ledger })));
  if (err) throw new ConvexError(err);
  if (!opts.skipDateCheck) {
    const settings = await getSettings(ctx, access.orgId);
    const dateErr = checkDate(tx.date, await todayForOrg(ctx, access.orgId), settings.lockedThrough);
    if (dateErr) throw new ConvexError(dateErr);
  }
  for (const l of clean) {
    if (l.accountId) {
      const acc = await getAccount(ctx, access.orgId, l.accountId);
      if (acc.currency !== l.currency) throw new ConvexError(`${acc.name} is in ${acc.currency}; amounts are never converted`);
    }
  }
  if (!opts.allowNegative) {
    // FN-24: a payment out of a client ledger cannot exceed what is held.
    for (const l of clean) {
      if (!l.ledger || l.amount >= 0 || !CLIENT_LEDGERS.includes(l.ledger)) continue;
      const held = (await ledgerBalance(ctx, access.orgId, l.ledger, l.key ?? ""))[l.currency] ?? 0;
      const out = round2(clean.filter((x) => x.ledger === l.ledger && x.key === l.key && x.currency === l.currency).reduce((s, x) => s + x.amount, 0));
      if (round2(held + out) < 0) {
        throw new ConvexError(`Only ${formatAmount(held, l.currency)} is held for this ${l.ledger}. Payments from trust cannot go below zero.`);
      }
    }
  }
  const txId = await ctx.db.insert("finTransactions", { ...tx, orgId: access.orgId, createdByUserId: access.user._id, createdAt: Date.now() });
  for (const l of clean) {
    await ctx.db.insert("finLines", { ...l, orgId: access.orgId, txId, date: tx.date });
    if (l.accountId) await addToAccountMonth(ctx, access.orgId, l.accountId, tx.date, l.amount);
  }
  return txId;
}

/**
 * Reverse a transaction with a reason (FN-13). The reversal is dated today
 * so a closed month is never changed. Returns the reversal's id.
 */
export async function reverseTransaction(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
  txId: Id<"finTransactions">,
  reason: string
): Promise<Id<"finTransactions">> {
  const tx = await ctx.db.get(txId);
  if (!tx || tx.orgId !== access.orgId) throw new ConvexError("Transaction not found");
  if (tx.reversedAt) throw new ConvexError("This transaction is already reversed");
  if (tx.reversalOfId) throw new ConvexError("A reversal cannot itself be reversed");
  const why = reason.trim();
  if (!why) throw new ConvexError("Give a reason for the reversal");
  const lines = await ctx.db
    .query("finLines")
    .withIndex("by_tx", (q) => q.eq("txId", txId))
    .collect();
  const today = await todayForOrg(ctx, access.orgId);
  const revId = await postTransaction(
    ctx,
    access,
    {
      date: today,
      kind: tx.kind,
      description: `Reversal of ${tx.number ?? tx.description}: ${why}`,
      method: tx.method,
      contactId: tx.contactId,
      counterparty: tx.counterparty,
      stayPaymentId: tx.stayPaymentId,
      leaseId: tx.leaseId,
      stayPropertyId: tx.stayPropertyId,
      invoiceId: tx.invoiceId,
      payoutId: tx.payoutId,
      // A reversed commission is still commission (statements net it off).
      feeOfTxId: tx.feeOfTxId,
      dealCommissionId: tx.dealCommissionId,
      agentUserId: tx.agentUserId,
      standId: tx.standId,
      developmentId: tx.developmentId,
      importId: tx.importId,
      reversalOfId: tx._id,
    },
    lines.map((l) => ({
      currency: l.currency,
      amount: -l.amount,
      accountId: l.accountId,
      ledger: l.ledger,
      key: l.key,
      categoryId: l.categoryId,
      stayPropertyId: l.stayPropertyId,
    })),
    { allowNegative: true, skipDateCheck: true }
  );
  await ctx.db.patch(tx._id, { reversedById: revId, reversedAt: Date.now(), reverseReason: why });
  return revId;
}

/** Live lines of a transaction (for display). */
export async function linesOf(ctx: Ctx, txId: Id<"finTransactions">) {
  return ctx.db
    .query("finLines")
    .withIndex("by_tx", (q) => q.eq("txId", txId))
    .collect();
}

export { todayForOrg, userLabel };
