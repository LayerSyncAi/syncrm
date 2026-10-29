/**
 * Landlord portal (BRD Stay §6), read-only apart from repair approvals:
 * their properties and units, current tenants (name and lease dates only),
 * rent collected and arrears, maintenance with costs, inspection reports and
 * shared documents. Every read starts from stayProperties.by_landlord, so a
 * landlord only ever reaches their own properties.
 */
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { PortalAccess, requirePortal } from "./access";
import { shapeMaintenanceRequest } from "../stay/maintenance";
import { inspectionDetail } from "../stay/inspections";
import { statementForProperties } from "../stay/statements";
import { landlordStatementFor } from "../finance/trust";
import { financeOn } from "../finance/core";
import { METHOD_LABELS } from "../stay/validators";
import { agencyOf } from "../stay/shared";
import { notifyUsers } from "../lib/notify";
import { recordAudit } from "../logs";

type Currency = Doc<"stayLeases">["currency"];
type Money = Partial<Record<Currency, number>>;

function add(m: Money, currency: Currency, amount: number) {
  m[currency] = (m[currency] ?? 0) + amount;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date());
}

async function myProperties(ctx: QueryCtx | MutationCtx, access: PortalAccess) {
  const rows = await ctx.db
    .query("stayProperties")
    .withIndex("by_landlord", (q) => q.eq("landlordContactId", access.contactId))
    .take(200);
  return rows.filter((p) => p.orgId === access.orgId && p.isActive);
}

async function getMyProperty(ctx: QueryCtx | MutationCtx, access: PortalAccess, id: Id<"stayProperties">) {
  const sp = await ctx.db.get(id);
  if (!sp || sp.orgId !== access.orgId || sp.landlordContactId !== access.contactId) {
    throw new ConvexError("Property not found");
  }
  return sp;
}

async function propertyTitle(ctx: QueryCtx, sp: Doc<"stayProperties">) {
  const prop = await ctx.db.get(sp.propertyId);
  return { title: prop?.title ?? "Property", location: prop?.location ?? "" };
}

/** Dashboard: collected this month, arrears, occupancy, open repairs. */
export const home = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "landlord");
    const today = todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;
    const collected: Money = {};
    const arrears: Money = {};
    let units = 0;
    let occupied = 0;
    let openRepairs = 0;
    const props = await myProperties(ctx, access);
    for (const sp of props) {
      const unitRows = await ctx.db
        .query("stayUnits")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      units += unitRows.length;
      occupied += unitRows.filter((u) => u.status !== "vacant").length;
      const leases = await ctx.db
        .query("stayLeases")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      for (const lease of leases) {
        const payments = await ctx.db
          .query("stayPayments")
          .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
          .take(500);
        for (const p of payments) {
          if (p.purpose === "rent" && !p.reversedAt && p.paidOn >= monthStart && p.paidOn <= today) {
            add(collected, p.currency, p.amount);
          }
        }
        const charges = await ctx.db
          .query("stayCharges")
          .withIndex("by_lease", (q) => q.eq("leaseId", lease._id))
          .take(500);
        for (const c of charges) {
          if ((c.status === "unpaid" || c.status === "part_paid") && c.dueDate < today) {
            add(arrears, c.currency, c.amount - c.amountPaid);
          }
        }
      }
      const requests = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      openRepairs += requests.filter((r) => r.status !== "done").length;
    }
    return { properties: props.length, units, occupied, collected, arrears, openRepairs };
  },
});

/** Properties, units and current tenants: name and lease dates only. */
export const properties = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "landlord");
    const out = [];
    for (const sp of await myProperties(ctx, access)) {
      const { title, location } = await propertyTitle(ctx, sp);
      const unitRows = await ctx.db
        .query("stayUnits")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      const leases = await ctx.db
        .query("stayLeases")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      const units = [];
      for (const u of unitRows.sort((a, b) => a.label.localeCompare(b.label))) {
        const lease = leases.find((l) => l.unitId === u._id && l.status === "active");
        const tenant = lease ? await ctx.db.get(lease.tenantContactId) : null;
        units.push({
          _id: u._id,
          label: u.label,
          status: u.status,
          tenantName: tenant?.name ?? null,
          leaseStart: lease?.startDate ?? null,
          leaseEnd: lease?.endDate ?? null,
        });
      }
      out.push({ _id: sp._id, title, location, kind: sp.kind, managementFeePct: sp.managementFeePct, units });
    }
    return out;
  },
});

/** ST-54: every request on the landlord's properties, with cost. */
export const maintenance = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "landlord");
    const out = [];
    for (const sp of await myProperties(ctx, access)) {
      const { title } = await propertyTitle(ctx, sp);
      const rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .order("desc")
        .take(200);
      for (const r of rows) {
        const [unit, assignee] = await Promise.all([
          ctx.db.get(r.unitId),
          r.assigneeUserId ? ctx.db.get(r.assigneeUserId) : null,
        ]);
        out.push(
          shapeMaintenanceRequest(r, {
            unitLabel: unit?.label ?? "Unit",
            propertyTitle: title,
            assigneeName: assignee?.fullName || assignee?.name || undefined,
            photoUrls: (await Promise.all(r.photos.map((p) => ctx.storage.getUrl(p)))).filter(
              (u): u is string => !!u
            ),
          })
        );
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** ST-56: the landlord approves or declines a repair over their threshold. */
export const decideRepair = mutation({
  args: {
    maintenanceId: v.id("stayMaintenance"),
    status: v.union(v.literal("approved"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "landlord");
    const row = await ctx.db.get(args.maintenanceId);
    if (!row || row.orgId !== access.orgId) throw new ConvexError("Request not found");
    const sp = await getMyProperty(ctx, access, row.stayPropertyId);
    if (row.landlordApproval?.status !== "pending") {
      throw new ConvexError("This repair is not waiting for your approval");
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      landlordApproval: { status: args.status, at: now, note: args.note?.trim() || undefined },
      updatedAt: now,
    });
    await notifyUsers(ctx, [row.assigneeUserId, sp.managerUserId], {
      orgId: access.orgId,
      module: "stay",
      kind: "maintenance_approval",
      title: `Landlord ${args.status} repair: ${row.title}`,
      body: args.note?.trim() || undefined,
      href: `/app/stay/maintenance/${row._id}`,
    });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: access.user.fullName || access.user.email,
      action: `portal.repair_${args.status}`,
      category: "stay",
      description: `Landlord ${args.status} repair "${row.title}"`,
      targetType: "stayMaintenance",
      targetId: row._id,
      targetLabel: row.title,
      orgId: access.orgId,
    });
  },
});

/** Completed inspection reports on the landlord's properties (ST-76). */
export const inspections = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "landlord");
    const out = [];
    for (const sp of await myProperties(ctx, access)) {
      const { title } = await propertyTitle(ctx, sp);
      const units = await ctx.db
        .query("stayUnits")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(500);
      for (const u of units) {
        const rows = await ctx.db
          .query("stayInspections")
          .withIndex("by_unit", (q) => q.eq("unitId", u._id))
          .take(100);
        for (const r of rows) {
          if (r.status !== "completed") continue;
          out.push({ _id: r._id, type: r.type, date: r.date, propertyTitle: title, unitLabel: u.label });
        }
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const inspection = query({
  args: { inspectionId: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "landlord");
    const row = await ctx.db.get(args.inspectionId);
    if (!row || row.orgId !== access.orgId || row.status !== "completed") {
      throw new ConvexError("Report not found");
    }
    const sp = await getMyProperty(ctx, access, row.stayPropertyId);
    const unit = await ctx.db.get(row.unitId);
    if (!unit) throw new ConvexError("Report not found");
    return await inspectionDetail(ctx, row, unit, sp, false);
  },
});

/** Documents the agency has shared with the landlord. */
export const documents = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePortal(ctx, "landlord");
    const out = [];
    for (const sp of await myProperties(ctx, access)) {
      const { title } = await propertyTitle(ctx, sp);
      const docs = await ctx.db
        .query("stayDocuments")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .take(200);
      for (const d of docs) {
        if (!d.visibleToLandlord) continue;
        out.push({
          _id: d._id,
          name: d.name,
          kind: d.kind,
          propertyTitle: title,
          createdAt: d.createdAt,
          url: await ctx.storage.getUrl(d.storageId),
        });
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * With Sync Finance on, the landlord sees Finance's statement and their
 * remittance advices, read-only (BRD Finance §4). Null when Finance is off,
 * so the page falls back to the Stay statement.
 */
export const financeStatement = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "landlord");
    if (!financeOn(access.org)) return null;
    const st = await landlordStatementFor(ctx, access.org, access.contactId, args.month);
    const payouts = (
      await ctx.db
        .query("finPayouts")
        .withIndex("by_org_ledger_key", (q) => q.eq("orgId", access.orgId).eq("ledger", "landlord").eq("key", access.contactId))
        .collect()
    )
      .filter((p) => p.status === "paid")
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 24)
      .map((p) => ({
        _id: p._id,
        number: p.number,
        date: p.date,
        currency: p.currency,
        amount: p.amount,
        method: METHOD_LABELS[p.method],
        reference: p.reference ?? "",
        lines: p.remittance,
      }));
    return { ...st, payouts };
  },
});

/** Monthly statement (BRD Stay §8), the same figures staff send. */
export const statement = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requirePortal(ctx, "landlord");
    const sps = await myProperties(ctx, access);
    const st = await statementForProperties(ctx, access.orgId, access.contactId, sps, args.month);
    if (!st || !st.properties.length) return null;
    return { ...st, agency: { ...agencyOf(access.org), vatNumber: access.org.vatNumber ?? "" } };
  },
});
