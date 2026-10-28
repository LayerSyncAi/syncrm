/**
 * Tenant portal (BRD Stay §6): balance and next due date, lease and
 * documents, receipts and statement, move-in/move-out reports, and
 * maintenance requests. Everything is read through the tenant's own leases,
 * so a tenant never sees another tenant's or the landlord's figures.
 */
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { PortalAccess, requirePortal } from "./access";
import { insertMaintenanceRequest, shapeMaintenanceRequest } from "../stay/maintenance";
import { inspectionDetail } from "../stay/inspections";
import { chainAccount, leaseChain, todayForOrg } from "../stay/shared";
import { receiptData } from "../stay/payments";

async function myLeases(ctx: QueryCtx | MutationCtx, access: PortalAccess) {
  const leases = await ctx.db
    .query("stayLeases")
    .withIndex("by_tenant", (q) => q.eq("tenantContactId", access.contactId))
    .take(50);
  return leases.filter((l) => l.orgId === access.orgId);
}

async function getMyLease(ctx: QueryCtx | MutationCtx, access: PortalAccess, id: Id<"stayLeases">) {
  const lease = await ctx.db.get(id);
  if (!lease || lease.orgId !== access.orgId || lease.tenantContactId !== access.contactId) {
    throw new ConvexError("Lease not found");
  }
  return lease;
}

/** The next date rent falls due on or after `today` for a given due day. */
export function nextDueDate(today: string, dueDay: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d <= dueDay) return `${y}-${pad(m)}-${pad(dueDay)}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad(nm)}-${pad(dueDay)}`;
}

/**
 * A lease with its balance. Balances run across the renewal chain (arrears
 * on an old lease stay with the tenant), as on the staff screens.
 */
async function leaseSummary(ctx: QueryCtx, lease: Doc<"stayLeases">) {
  const [unit, sp] = await Promise.all([ctx.db.get(lease.unitId), ctx.db.get(lease.stayPropertyId)]);
  const prop = sp ? await ctx.db.get(sp.propertyId) : null;
  const today = await todayForOrg(ctx, lease.orgId);
  const acc = await chainAccount(ctx, await leaseChain(ctx, lease), today);
  const openDue = acc.charges
    .filter((c) => (c.status === "unpaid" || c.status === "part_paid") && c.amount > c.amountPaid)
    .map((c) => c.dueDate)
    .sort()[0];
  return {
    _id: lease._id,
    status: lease.status,
    unitLabel: unit?.label ?? "Unit",
    propertyTitle: prop?.title ?? "Property",
    propertyLocation: prop?.location ?? "",
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentAmount: lease.rentAmount,
    currency: lease.currency,
    dueDay: lease.dueDay,
    depositAmount: lease.depositAmount,
    balance: acc.balance,
    overdue: acc.overdue > 0,
    nextDueDate: lease.status === "active" ? (openDue ?? nextDueDate(today, lease.dueDay)) : null,
  };
}

/** Dashboard: each lease with its balance and next due date, active first. */
export const home = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "tenant");
    // A renewed lease lives on in its successor's balance and statement.
    const leases = (await myLeases(ctx, access)).filter((l) => l.status !== "renewed");
    leases.sort((a, b) => (a.status === "active" ? -1 : 0) - (b.status === "active" ? -1 : 0) || b.startDate.localeCompare(a.startDate));
    return await Promise.all(leases.map((l) => leaseSummary(ctx, l)));
  },
});

/** Lease details with the documents shared with the tenant. */
export const lease = query({
  args: { leaseId: v.id("stayLeases") },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const lease = await getMyLease(ctx, access, args.leaseId);
    const docs = await ctx.db
      .query("stayDocuments")
      .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
      .take(100);
    const shared = [];
    for (const d of docs) {
      if (!d.visibleToTenant || d.orgId !== access.orgId) continue;
      shared.push({ _id: d._id, name: d.name, kind: d.kind, createdAt: d.createdAt, url: await ctx.storage.getUrl(d.storageId) });
    }
    return { summary: await leaseSummary(ctx, lease), documents: shared };
  },
});

/** Running statement across the renewal chain, and the tenant's receipts. */
export const statement = query({
  args: { leaseId: v.id("stayLeases") },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const lease = await getMyLease(ctx, access, args.leaseId);
    const today = await todayForOrg(ctx, lease.orgId);
    const acc = await chainAccount(ctx, await leaseChain(ctx, lease), today);
    const receipts = acc.payments
      .filter((p) => !p.reversedAt)
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
      .map((p) => ({
        _id: p._id,
        receiptNumber: p.receiptNumber,
        paidOn: p.paidOn,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        purpose: p.purpose,
        reference: p.reference ?? null,
      }));
    const lines = acc.statement.lines.map((l) => ({
      date: l.date,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      balance: l.balance,
    }));
    return { currency: acc.currency, lines, receipts };
  },
});

/** One receipt, for printing or saving as a PDF. */
export const receipt = query({
  args: { paymentId: v.id("stayPayments") },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.orgId !== access.orgId) throw new ConvexError("Receipt not found");
    const lease = await getMyLease(ctx, access, payment.leaseId);
    const r = await receiptData(ctx, payment, lease, access.org);
    // Staff-only detail stays out of the portal.
    return { ...r, recordedBy: "", tenantEmail: undefined, emailedAt: null };
  },
});

/** Move-in and move-out reports on the tenant's leases (ST-76). */
export const inspections = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "tenant");
    const out = [];
    for (const lease of await myLeases(ctx, access)) {
      const rows = await ctx.db
        .query("stayInspections")
        .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
        .take(20);
      for (const r of rows) {
        if (r.status !== "completed" || r.type === "routine") continue;
        out.push({ _id: r._id, leaseId: lease._id, type: r.type, date: r.date, tenantAck: r.tenantAck ?? null });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  },
});

async function getMyInspection(ctx: QueryCtx | MutationCtx, access: PortalAccess, id: Id<"stayInspections">) {
  const row = await ctx.db.get(id);
  if (!row || row.orgId !== access.orgId || !row.leaseId || row.status !== "completed" || row.type === "routine") {
    throw new ConvexError("Report not found");
  }
  await getMyLease(ctx, access, row.leaseId);
  return row;
}

export const inspection = query({
  args: { inspectionId: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const row = await getMyInspection(ctx, access, args.inspectionId);
    const [unit, sp] = await Promise.all([ctx.db.get(row.unitId), ctx.db.get(row.stayPropertyId)]);
    if (!unit || !sp) throw new ConvexError("Report not found");
    return await inspectionDetail(ctx, row, unit, sp, false);
  },
});

/** ST-80: tenant accepts the move-in report or adds comments. */
export const acknowledgeInspection = mutation({
  args: { inspectionId: v.id("stayInspections"), comment: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const row = await getMyInspection(ctx, access, args.inspectionId);
    if (row.tenantAck) throw new ConvexError("You have already responded to this report");
    await ctx.db.patch(row._id, {
      tenantAck: { at: Date.now(), comment: args.comment?.trim() || undefined },
      updatedAt: Date.now(),
    });
  },
});

/** Units the tenant can report a problem on: their active leases. */
export const maintenanceUnits = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "tenant");
    const out = [];
    for (const l of await myLeases(ctx, access)) {
      if (l.status !== "active") continue;
      const s = await leaseSummary(ctx, l);
      out.push({ leaseId: l._id, label: `${s.propertyTitle}, ${s.unitLabel}` });
    }
    return out;
  },
});

export const maintenance = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "tenant");
    const out = [];
    for (const lease of await myLeases(ctx, access)) {
      const rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
        .order("desc")
        .take(100);
      const s = await leaseSummary(ctx, lease);
      for (const r of rows) {
        const shaped = shapeMaintenanceRequest(r, {
          unitLabel: s.unitLabel,
          propertyTitle: s.propertyTitle,
          photoUrls: (await Promise.all(r.photos.map((p) => ctx.storage.getUrl(p)))).filter(
            (u): u is string => !!u
          ),
        });
        // Costs and landlord approvals are between the agency and the landlord.
        out.push({ ...shaped, cost: undefined, currency: undefined, landlordApproval: undefined, expenseId: undefined });
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** ST-50: log a request from the portal, with optional photos. */
export const createMaintenance = mutation({
  args: {
    leaseId: v.id("stayLeases"),
    title: v.string(),
    description: v.string(),
    photos: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "tenant");
    const lease = await getMyLease(ctx, access, args.leaseId);
    if (lease.status !== "active") throw new ConvexError("This lease has ended");
    if ((args.photos?.length ?? 0) > 6) throw new ConvexError("Add up to 6 photos");
    const [unit, sp] = await Promise.all([ctx.db.get(lease.unitId), ctx.db.get(lease.stayPropertyId)]);
    if (!unit || !sp) throw new ConvexError("Lease not found");
    return await insertMaintenanceRequest(ctx, {
      unit,
      sp,
      raisedByUserId: access.user._id,
      raisedVia: "tenant_portal",
      title: args.title,
      description: args.description,
      photos: args.photos,
      leaseId: lease._id,
    });
  },
});
