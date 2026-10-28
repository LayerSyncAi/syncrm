/**
 * Sync Stay leases and charges (BRD Stay ST-11 to ST-16, ST-21).
 *
 * Leases are never deleted. A renewal is a new lease row; the old one is
 * marked "renewed" and the two point at each other. Every change is audited.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleLease, requireLeaseEditor, requireStay, StayAccess } from "./access";
import {
  addDays,
  daysBetween,
  isValidDate,
  outstanding,
  periodLabel,
  periodOf,
  round2,
} from "./ledger";
import {
  canSeeLease,
  chainAccount,
  depositForLease,
  leaseChain,
  leaseLabels,
  refreshUnitStatus,
  stayAudit,
  todayForOrg,
  upsertTenant,
  userLabel,
  visibleLeases,
} from "./shared";
import { insertCharge } from "./money";
import { chargeKindValidator, depositHeldInValidator, personRefValidator } from "./validators";

const currencyValidator = v.union(v.literal("USD"), v.literal("ZiG"));

function checkTerms(t: { startDate: string; endDate: string; rentAmount: number; dueDay: number; depositAmount?: number }) {
  if (!isValidDate(t.startDate) || !isValidDate(t.endDate)) throw new ConvexError("Enter valid start and end dates");
  if (t.endDate <= t.startDate) throw new ConvexError("The end date must be after the start date");
  if (!(t.rentAmount > 0)) throw new ConvexError("Monthly rent must be more than zero");
  if (!Number.isInteger(t.dueDay) || t.dueDay < 1 || t.dueDay > 28) throw new ConvexError("Rent due day must be between 1 and 28");
  if (t.depositAmount !== undefined && t.depositAmount < 0) throw new ConvexError("Deposit cannot be negative");
}

// ── Queries ──────────────────────────────────────────────────────────

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("ended"), v.literal("renewed"), v.literal("all"))),
    q: v.optional(v.string()),
    stayPropertyId: v.optional(v.id("stayProperties")),
    expiringWithinDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const status = args.status ?? "active";
    let leases = await visibleLeases(ctx, access, status === "all" ? undefined : status);
    if (args.stayPropertyId) leases = leases.filter((l) => l.stayPropertyId === args.stayPropertyId);
    const today = await todayForOrg(ctx, access.orgId);
    if (args.expiringWithinDays !== undefined) {
      const until = addDays(today, args.expiringWithinDays);
      leases = leases.filter((l) => l.status === "active" && l.endDate <= until);
    }
    const label = await leaseLabels(ctx, leases);
    const q = args.q?.trim().toLowerCase();
    return leases
      .map((l) => {
        const lab = label(l);
        return {
          _id: l._id,
          status: l.status,
          ...lab,
          startDate: l.startDate,
          endDate: l.endDate,
          daysToEnd: daysBetween(today, l.endDate),
          rentAmount: l.rentAmount,
          currency: l.currency,
          dueDay: l.dueDay,
          noticeGivenOn: l.noticeGivenOn ?? null,
          moveOutDate: l.moveOutDate ?? null,
        };
      })
      .filter((r) => !q || [r.tenantName, r.propertyName, r.unitLabel, r.landlordName].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0));
  },
});

/** Everything on one lease: terms, balance, statement, deposit, notes, links. */
export const get = query({
  args: { id: v.id("stayLeases") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const lease = await ctx.db.get(args.id);
    if (!lease || !canSeeLease(access, lease)) return null;
    const today = await todayForOrg(ctx, access.orgId);
    const chain = await leaseChain(ctx, lease);
    const acc = await chainAccount(ctx, chain, today);
    const [label, tenant, notes, sp] = await Promise.all([
      leaseLabels(ctx, [lease]),
      ctx.db.get(lease.tenantContactId),
      ctx.db.query("stayArrearsNotes").withIndex("by_lease", (q) => q.eq("leaseId", lease._id)).collect(),
      ctx.db.get(lease.stayPropertyId),
    ]);
    const noteAuthors = await Promise.all(notes.map((n) => ctx.db.get(n.createdByUserId)));
    const lab = label(lease);
    const deposit = await depositForLease(ctx, lease._id);
    const isHead = !lease.renewedToLeaseId;
    return {
      _id: lease._id,
      status: lease.status,
      ...lab,
      stayPropertyId: lease.stayPropertyId,
      unitId: lease.unitId,
      tenantContactId: lease.tenantContactId,
      landlordContactId: lease.landlordContactId,
      tenant: tenant
        ? { name: tenant.name, phone: tenant.phone ?? "", email: tenant.email ?? "", idNumber: tenant.idNumber ?? "", entityKind: tenant.entityKind ?? "individual" }
        : null,
      startDate: lease.startDate,
      endDate: lease.endDate,
      daysToEnd: daysBetween(today, lease.endDate),
      rentAmount: lease.rentAmount,
      currency: lease.currency,
      dueDay: lease.dueDay,
      depositAmount: lease.depositAmount,
      noticeGivenOn: lease.noticeGivenOn ?? null,
      moveOutDate: lease.moveOutDate ?? null,
      endReason: lease.endReason ?? null,
      rentIncrease: lease.rentIncrease ?? null,
      renewedFromLeaseId: lease.renewedFromLeaseId ?? null,
      renewedToLeaseId: lease.renewedToLeaseId ?? null,
      managementFeePct: sp?.managementFeePct ?? null,
      balance: acc.balance,
      overdue: acc.overdue,
      credit: acc.credit,
      oldestOverdue: acc.oldestOverdue,
      statement: acc.statement.lines,
      charges: acc.charges
        .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
        .map((c) => ({
          _id: c._id,
          kind: c.kind,
          description: c.description,
          amount: c.amount,
          amountPaid: c.amountPaid,
          outstanding: c.status === "cancelled" ? 0 : outstanding(c),
          dueDate: c.dueDate,
          status: c.status,
          cancelReason: c.cancelReason ?? null,
        })),
      payments: acc.payments
        .sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : b.createdAt - a.createdAt))
        .map((p) => ({
          _id: p._id,
          purpose: p.purpose,
          receiptNumber: p.receiptNumber,
          paidOn: p.paidOn,
          amount: p.amount,
          method: p.method,
          reference: p.reference ?? "",
          reversed: !!p.reversedAt,
          reverseReason: p.reverseReason ?? null,
        })),
      deposit: deposit
        ? {
            _id: deposit._id,
            expected: deposit.amountExpected,
            received: deposit.amountReceived,
            applied: deposit.amountApplied,
            refunded: deposit.amountRefunded,
            held: round2(deposit.amountReceived - deposit.amountApplied - deposit.amountRefunded),
            heldIn: deposit.heldIn,
            status: deposit.status,
            movements: deposit.movements.map((m) => ({ kind: m.kind, amount: m.amount, date: m.date, note: m.note ?? "" })),
          }
        : null,
      notes: notes
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((n, i) => ({
          _id: n._id,
          note: n.note,
          promiseDate: n.promiseDate ?? null,
          promiseAmount: n.promiseAmount ?? null,
          by: userLabel(noteAuthors[i]),
          createdAt: n.createdAt,
        })),
      isHead,
      canEdit: access.canEditLeases && isHead,
      canAdmin: access.canAdmin,
      today,
    };
  },
});

/**
 * Leases to pick from in "Record payment": active ones first, then recent
 * ended ones with money still owed. Searches tenant, property and unit.
 */
export const searchForPayment = query({
  args: { q: v.optional(v.string()), leaseId: v.optional(v.id("stayLeases")) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    let leases = (await visibleLeases(ctx, access)).filter((l) => !l.renewedToLeaseId);
    if (args.leaseId) {
      // A specific lease (or the current lease of its renewal chain).
      const picked = await ctx.db.get(args.leaseId);
      const chainHead = picked ? leases.find((l) => l._id === picked._id || (l.tenantContactId === picked.tenantContactId && l.unitId === picked.unitId)) : null;
      leases = chainHead ? [chainHead] : [];
    }
    const label = await leaseLabels(ctx, leases);
    const q = args.q?.trim().toLowerCase();
    const matches = leases
      .map((l) => ({ l, lab: label(l) }))
      .filter(({ lab }) => !q || [lab.tenantName, lab.propertyName, lab.unitLabel, lab.tenantPhone ?? ""].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.l.status === "active" ? 0 : 1) - (b.l.status === "active" ? 0 : 1) || a.lab.tenantName.localeCompare(b.lab.tenantName))
      .slice(0, 15);
    const today = await todayForOrg(ctx, access.orgId);
    return Promise.all(
      matches.map(async ({ l, lab }) => {
        const acc = await chainAccount(ctx, await leaseChain(ctx, l), today);
        const deposit = acc.deposit;
        return {
          leaseId: l._id,
          status: l.status,
          tenantName: lab.tenantName,
          tenantEmail: lab.tenantEmail,
          propertyName: lab.propertyName,
          unitLabel: lab.unitLabel,
          currency: l.currency,
          rentAmount: l.rentAmount,
          balance: acc.balance,
          overdue: acc.overdue,
          depositOutstanding: deposit ? Math.max(0, round2(deposit.amountExpected - deposit.amountReceived)) : 0,
        };
      })
    );
  },
});

// ── Create and change ────────────────────────────────────────────────

export const create = mutation({
  args: {
    unitId: v.id("stayUnits"),
    tenant: personRefValidator,
    startDate: v.string(),
    endDate: v.string(),
    rentAmount: v.number(),
    currency: currencyValidator,
    dueDay: v.number(),
    depositAmount: v.number(),
    depositHeldIn: v.optional(depositHeldInValidator),
    // Raise the first month's rent now, due on the start date.
    chargeFirstMonth: v.optional(v.boolean()),
    rentIncrease: v.optional(v.object({ effectiveDate: v.string(), newRent: v.number() })),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    checkTerms(args);
    return createLease(ctx, access, args);
  },
});

/** Shared by create and the Excel import. */
export async function createLease(
  ctx: MutationCtx,
  access: StayAccess,
  args: {
    unitId: Id<"stayUnits">;
    tenant: { existingContactId?: Id<"contacts">; person?: Parameters<typeof upsertTenant>[2]["person"] };
    startDate: string;
    endDate: string;
    rentAmount: number;
    currency: "USD" | "ZiG";
    dueDay: number;
    depositAmount: number;
    depositHeldIn?: "trust" | "business" | "landlord";
    chargeFirstMonth?: boolean;
    rentIncrease?: { effectiveDate: string; newRent: number };
    silent?: boolean;
  }
): Promise<Id<"stayLeases">> {
  const unit = await ctx.db.get(args.unitId);
  if (!unit || unit.orgId !== access.orgId) throw new ConvexError("Unit not found");
  const sp = await ctx.db.get(unit.stayPropertyId);
  if (!sp || sp.orgId !== access.orgId || !(access.seesAll || sp.managerUserId === access.user._id)) {
    throw new ConvexError("Unit not found");
  }
  const activeOnUnit = (
    await ctx.db.query("stayLeases").withIndex("by_unit", (q) => q.eq("unitId", unit._id)).collect()
  ).find((l) => l.status === "active");
  if (activeOnUnit) throw new ConvexError(`${unit.label} already has an active lease. End or renew it first.`);
  if (args.rentIncrease) {
    if (!isValidDate(args.rentIncrease.effectiveDate) || !(args.rentIncrease.newRent > 0)) {
      throw new ConvexError("Enter a valid date and amount for the rent increase");
    }
  }

  const tenantContactId = await upsertTenant(ctx, access, args.tenant);
  const now = Date.now();
  const leaseId = await ctx.db.insert("stayLeases", {
    orgId: access.orgId,
    unitId: unit._id,
    stayPropertyId: sp._id,
    tenantContactId,
    landlordContactId: sp.landlordContactId,
    managerUserId: sp.managerUserId,
    startDate: args.startDate,
    endDate: args.endDate,
    rentAmount: round2(args.rentAmount),
    currency: args.currency,
    dueDay: args.dueDay,
    depositAmount: round2(args.depositAmount),
    status: "active",
    rentIncrease: args.rentIncrease,
    createdByUserId: access.user._id,
    createdAt: now,
    updatedAt: now,
  });

  if (args.depositAmount > 0) {
    await ctx.db.insert("stayDeposits", {
      orgId: access.orgId,
      leaseId,
      stayPropertyId: sp._id,
      currency: args.currency,
      amountExpected: round2(args.depositAmount),
      amountReceived: 0,
      amountApplied: 0,
      amountRefunded: 0,
      heldIn: args.depositHeldIn ?? "trust",
      status: "pending",
      movements: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (args.chargeFirstMonth) {
    const lease = (await ctx.db.get(leaseId))!;
    await insertCharge(ctx, lease, {
      kind: "rent",
      description: `Rent ${periodLabel(periodOf(args.startDate))}`,
      amount: args.rentAmount,
      dueDate: args.startDate,
      period: periodOf(args.startDate),
      createdByUserId: access.user._id,
    });
  }

  await refreshUnitStatus(ctx, unit._id);
  // A let property reads as let in the CRM too.
  const prop = await ctx.db.get(sp.propertyId);
  if (prop && prop.status !== "let" && prop.status !== "sold") {
    await ctx.db.patch(prop._id, { status: "let", updatedAt: now });
  }

  const tenant = await ctx.db.get(tenantContactId);
  await stayAudit(ctx, access, {
    action: "stay.lease_create",
    description: `Created lease for ${tenant?.name ?? "tenant"} at ${prop?.title ?? "property"} ${unit.label}`,
    targetType: "stayLease",
    targetId: leaseId,
    targetLabel: tenant?.name,
    metadata: {
      startDate: args.startDate,
      endDate: args.endDate,
      rentAmount: args.rentAmount,
      currency: args.currency,
      dueDay: args.dueDay,
      depositAmount: args.depositAmount,
      ...(args.silent ? { source: "import" } : {}),
    },
  });
  return leaseId;
}

/** Correct a lease's terms. Currency is fixed once money has moved. */
export const update = mutation({
  args: {
    id: v.id("stayLeases"),
    startDate: v.string(),
    endDate: v.string(),
    rentAmount: v.number(),
    currency: currencyValidator,
    dueDay: v.number(),
    depositAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.id);
    if (lease.status !== "active") throw new ConvexError("Only an active lease can be changed");
    checkTerms(args);
    if (args.currency !== lease.currency) {
      const anyCharge = await ctx.db.query("stayCharges").withIndex("by_lease", (q) => q.eq("leaseId", lease._id)).first();
      const anyPayment = await ctx.db.query("stayPayments").withIndex("by_lease", (q) => q.eq("leaseId", lease._id)).first();
      if (anyCharge || anyPayment) throw new ConvexError("The currency cannot change once charges or payments exist");
    }
    const now = Date.now();
    const before = {
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      currency: lease.currency,
      dueDay: lease.dueDay,
      depositAmount: lease.depositAmount,
    };
    const after = { ...args, rentAmount: round2(args.rentAmount), depositAmount: round2(args.depositAmount) };
    delete (after as { id?: unknown }).id;
    await ctx.db.patch(lease._id, { ...after, updatedAt: now });

    const deposit = await depositForLease(ctx, lease._id);
    if (deposit) {
      if (deposit.amountReceived > 0 && args.currency !== deposit.currency) {
        throw new ConvexError("The currency cannot change once a deposit has been received");
      }
      await ctx.db.patch(deposit._id, {
        amountExpected: after.depositAmount,
        currency: args.currency,
        status: deposit.status === "settled" ? "settled" : deposit.amountReceived > 0 ? "held" : "pending",
        updatedAt: now,
      });
    } else if (after.depositAmount > 0) {
      await ctx.db.insert("stayDeposits", {
        orgId: access.orgId,
        leaseId: lease._id,
        stayPropertyId: lease.stayPropertyId,
        currency: args.currency,
        amountExpected: after.depositAmount,
        amountReceived: 0,
        amountApplied: 0,
        amountRefunded: 0,
        heldIn: "trust",
        status: "pending",
        movements: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const changed = Object.fromEntries(
      Object.entries(before)
        .filter(([k, val]) => (after as Record<string, unknown>)[k] !== val)
        .map(([k, val]) => [k, { from: val, to: (after as Record<string, unknown>)[k] }])
    );
    await stayAudit(ctx, access, {
      action: "stay.lease_update",
      description: `Changed lease terms: ${Object.keys(changed).join(", ") || "no changes"}`,
      targetType: "stayLease",
      targetId: lease._id,
      metadata: changed,
    });
  },
});

/** ST-14: renew with new dates and rent; the old lease keeps its history. */
export const renew = mutation({
  args: {
    id: v.id("stayLeases"),
    startDate: v.string(),
    endDate: v.string(),
    rentAmount: v.number(),
    dueDay: v.optional(v.number()),
    rentIncrease: v.optional(v.object({ effectiveDate: v.string(), newRent: v.number() })),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const old = await getVisibleLease(ctx, access, args.id);
    if (old.status !== "active") throw new ConvexError("Only an active lease can be renewed");
    const dueDay = args.dueDay ?? old.dueDay;
    checkTerms({ ...args, dueDay });
    if (args.startDate <= old.startDate) throw new ConvexError("The renewal must start after the current lease started");
    const now = Date.now();
    const newId = await ctx.db.insert("stayLeases", {
      orgId: old.orgId,
      unitId: old.unitId,
      stayPropertyId: old.stayPropertyId,
      tenantContactId: old.tenantContactId,
      landlordContactId: old.landlordContactId,
      managerUserId: old.managerUserId,
      startDate: args.startDate,
      endDate: args.endDate,
      rentAmount: round2(args.rentAmount),
      currency: old.currency,
      dueDay,
      depositAmount: old.depositAmount,
      status: "active",
      noticeGivenOn: undefined,
      renewedFromLeaseId: old._id,
      rentIncrease: args.rentIncrease,
      // Unused credit follows the tenant onto the new lease.
      creditBalance: old.creditBalance,
      createdByUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(old._id, { status: "renewed", renewedToLeaseId: newId, creditBalance: undefined, updatedAt: now });

    // The deposit is held against the tenancy, so it moves to the new lease.
    const deposit = await depositForLease(ctx, old._id);
    if (deposit) await ctx.db.patch(deposit._id, { leaseId: newId, updatedAt: now });

    // Rent already raised for periods the new lease covers stays as it is;
    // the daily job skips periods with a charge on either lease.
    await refreshUnitStatus(ctx, old.unitId);
    await stayAudit(ctx, access, {
      action: "stay.lease_renew",
      description: `Renewed lease to ${args.endDate} at ${old.currency} ${round2(args.rentAmount)}`,
      targetType: "stayLease",
      targetId: newId,
      metadata: { fromLeaseId: old._id, startDate: args.startDate, endDate: args.endDate, rentAmount: args.rentAmount },
    });
    return newId;
  },
});

/** ST-15: end a lease on move-out. Future unpaid rent is cancelled. */
export const end = mutation({
  args: { id: v.id("stayLeases"), moveOutDate: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.id);
    if (lease.status !== "active") throw new ConvexError("This lease is not active");
    if (!isValidDate(args.moveOutDate)) throw new ConvexError("Enter a valid move-out date");
    if (args.moveOutDate < lease.startDate) throw new ConvexError("Move-out cannot be before the lease started");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason for ending the lease");
    const now = Date.now();
    await ctx.db.patch(lease._id, { status: "ended", moveOutDate: args.moveOutDate, endReason: reason, updatedAt: now });

    const charges = await ctx.db.query("stayCharges").withIndex("by_lease", (q) => q.eq("leaseId", lease._id)).collect();
    const cancelled: string[] = [];
    let creditBack = 0;
    for (const c of charges) {
      // Only rent for periods after move-out, and only what was settled from credit.
      const paidByMoney = round2(c.amountPaid - (c.creditApplied ?? 0));
      if (c.kind !== "rent" || c.dueDate <= args.moveOutDate || c.status === "cancelled" || paidByMoney > 0) continue;
      creditBack = round2(creditBack + (c.creditApplied ?? 0));
      await ctx.db.patch(c._id, {
        status: "cancelled",
        amountPaid: 0,
        creditApplied: undefined,
        cancelReason: "Lease ended",
        updatedAt: now,
      });
      cancelled.push(c._id);
    }
    if (creditBack > 0) {
      await ctx.db.patch(lease._id, { creditBalance: round2((lease.creditBalance ?? 0) + creditBack) });
    }
    await refreshUnitStatus(ctx, lease.unitId);
    await stayAudit(ctx, access, {
      action: "stay.lease_end",
      description: `Ended lease, move-out ${args.moveOutDate}: ${reason}`,
      targetType: "stayLease",
      targetId: lease._id,
      metadata: { moveOutDate: args.moveOutDate, reason, cancelledCharges: cancelled },
    });
  },
});

/** Record (or withdraw) the tenant's notice. The unit shows "notice". */
export const setNotice = mutation({
  args: { id: v.id("stayLeases"), noticeGivenOn: v.union(v.string(), v.null()), plannedMoveOut: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.id);
    if (lease.status !== "active") throw new ConvexError("This lease is not active");
    if (args.noticeGivenOn && !isValidDate(args.noticeGivenOn)) throw new ConvexError("Enter a valid notice date");
    if (args.plannedMoveOut && !isValidDate(args.plannedMoveOut)) throw new ConvexError("Enter a valid move-out date");
    await ctx.db.patch(lease._id, {
      noticeGivenOn: args.noticeGivenOn ?? undefined,
      // A planned move-out stops rent being raised after it.
      moveOutDate: args.noticeGivenOn ? args.plannedMoveOut || undefined : undefined,
      updatedAt: Date.now(),
    });
    await refreshUnitStatus(ctx, lease.unitId);
    await stayAudit(ctx, access, {
      action: args.noticeGivenOn ? "stay.lease_notice" : "stay.lease_notice_withdrawn",
      description: args.noticeGivenOn
        ? `Tenant gave notice on ${args.noticeGivenOn}${args.plannedMoveOut ? `, moving out ${args.plannedMoveOut}` : ""}`
        : "Notice withdrawn",
      targetType: "stayLease",
      targetId: lease._id,
    });
  },
});

/** ST-16: plan a rent increase, applied by the daily job on its date. */
export const setRentIncrease = mutation({
  args: { id: v.id("stayLeases"), effectiveDate: v.union(v.string(), v.null()), newRent: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.id);
    if (lease.status !== "active") throw new ConvexError("This lease is not active");
    let rentIncrease: Doc<"stayLeases">["rentIncrease"];
    if (args.effectiveDate) {
      if (!isValidDate(args.effectiveDate) || !(args.newRent && args.newRent > 0)) {
        throw new ConvexError("Enter a valid date and new rent");
      }
      rentIncrease = { effectiveDate: args.effectiveDate, newRent: round2(args.newRent) };
    }
    await ctx.db.patch(lease._id, { rentIncrease, updatedAt: Date.now() });
    await stayAudit(ctx, access, {
      action: "stay.lease_rent_increase",
      description: rentIncrease
        ? `Planned rent increase to ${lease.currency} ${rentIncrease.newRent} from ${rentIncrease.effectiveDate}`
        : "Removed planned rent increase",
      targetType: "stayLease",
      targetId: lease._id,
      metadata: { rentIncrease, previous: lease.rentIncrease ?? null },
    });
  },
});

// ── Charges ──────────────────────────────────────────────────────────

/** ST-21: a one-off charge (admin fee, damage, late fee, utilities). */
export const addCharge = mutation({
  args: {
    leaseId: v.id("stayLeases"),
    kind: chargeKindValidator,
    description: v.string(),
    amount: v.number(),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const lease = await getVisibleLease(ctx, access, args.leaseId);
    if (!isValidDate(args.dueDate)) throw new ConvexError("Enter a valid due date");
    const description = args.description.trim();
    if (!description) throw new ConvexError("Describe the charge");
    if (lease.renewedToLeaseId) throw new ConvexError("Add charges to the current lease");
    const id = await insertCharge(ctx, lease, {
      kind: args.kind,
      description,
      amount: args.amount,
      dueDate: args.dueDate,
      createdByUserId: access.user._id,
    });
    await stayAudit(ctx, access, {
      action: "stay.charge_create",
      description: `Added charge "${description}" ${lease.currency} ${round2(args.amount)}`,
      targetType: "stayCharge",
      targetId: id,
      metadata: { leaseId: lease._id, kind: args.kind, amount: args.amount, dueDate: args.dueDate },
    });
    return id;
  },
});

/**
 * Cancel a charge raised in error. Charges are never deleted. A charge that
 * a payment has touched must have that payment reversed first; credit used
 * on it returns to the lease.
 */
export const cancelCharge = mutation({
  args: { chargeId: v.id("stayCharges"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const charge = await ctx.db.get(args.chargeId);
    if (!charge || charge.orgId !== access.orgId) throw new ConvexError("Charge not found");
    const lease = await getVisibleLease(ctx, access, charge.leaseId);
    if (charge.status === "cancelled") return;
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    const fromMoney = round2(charge.amountPaid - (charge.creditApplied ?? 0));
    if (fromMoney > 0) {
      throw new ConvexError("A payment or the deposit has been applied to this charge. Reverse it first.");
    }
    const now = Date.now();
    await ctx.db.patch(charge._id, { status: "cancelled", amountPaid: 0, creditApplied: undefined, cancelReason: reason, updatedAt: now });
    if ((charge.creditApplied ?? 0) > 0) {
      // Credit goes back to the current lease in the chain.
      let head = lease;
      while (head.renewedToLeaseId) {
        const next = await ctx.db.get(head.renewedToLeaseId);
        if (!next) break;
        head = next;
      }
      await ctx.db.patch(head._id, { creditBalance: round2((head.creditBalance ?? 0) + (charge.creditApplied ?? 0)), updatedAt: now });
    }
    await stayAudit(ctx, access, {
      action: "stay.charge_cancel",
      description: `Cancelled charge "${charge.description}" ${charge.currency} ${charge.amount}: ${reason}`,
      targetType: "stayCharge",
      targetId: charge._id,
      metadata: { leaseId: charge.leaseId, reason },
    });
  },
});
