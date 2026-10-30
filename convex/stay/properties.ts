/**
 * SyncStay properties and units (BRD Stay ST-02 to ST-05).
 *
 * A Stay property is the management agreement on top of a Hub `properties`
 * row: the landlord, the assigned manager and the fee. Creating one either
 * picks an existing CRM listing or creates a plain Hub property for it.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleStayProperty, requireLeaseEditor, requireStay } from "./access";
import {
  addTo,
  CurrencyTotals,
  defaultRooms,
} from "./ledger";
import {
  getOrgContact,
  linkLandlordToProperty,
  nameMaps,
  stayAudit,
  upsertLandlord,
  userLabel,
  visibleStayProperties,
} from "./shared";
import { personRefValidator } from "./validators";

const kindValidator = v.union(v.literal("residential"), v.literal("commercial"));
const hubTypeValidator = v.union(
  v.literal("house"),
  v.literal("apartment"),
  v.literal("commercial"),
  v.literal("other")
);

function checkFee(pct: number) {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new ConvexError("Management fee must be between 0 and 100%");
  }
}

async function assertManager(ctx: { db: { get: (id: Id<"users">) => Promise<Doc<"users"> | null> } }, orgId: Id<"organizations">, userId?: Id<"users">) {
  if (!userId) return;
  const u = await ctx.db.get(userId);
  if (!u || u.orgId !== orgId || !u.isActive) throw new ConvexError("Manager not found");
}

// ── Queries ──────────────────────────────────────────────────────────

/** Properties the caller may see, with unit counts and the monthly rent roll. */
export const list = query({
  args: { q: v.optional(v.string()), landlordContactId: v.optional(v.id("contacts")) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    let sps = await visibleStayProperties(ctx, access);
    if (args.landlordContactId) sps = sps.filter((sp) => sp.landlordContactId === args.landlordContactId);

    const names = await nameMaps(ctx, {
      contacts: sps.map((sp) => sp.landlordContactId),
      users: sps.map((sp) => sp.managerUserId).filter((x): x is Id<"users"> => !!x),
      properties: sps.map((sp) => sp.propertyId),
    });

    const rows = await Promise.all(
      sps.map(async (sp) => {
        const [units, leases] = await Promise.all([
          ctx.db.query("stayUnits").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
          ctx.db.query("stayLeases").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
        ]);
        const rentRoll: CurrencyTotals = {};
        for (const l of leases) if (l.status === "active") addTo(rentRoll, l.currency, l.rentAmount);
        const prop = names.property(sp.propertyId);
        return {
          _id: sp._id,
          name: prop?.title ?? "Property",
          address: prop?.location ?? "",
          kind: sp.kind,
          isActive: sp.isActive,
          landlordContactId: sp.landlordContactId,
          landlordName: names.contact(sp.landlordContactId)?.name ?? "Unknown",
          managerUserId: sp.managerUserId ?? null,
          managerName: sp.managerUserId ? userLabel(names.user(sp.managerUserId)) : null,
          managementFeePct: sp.managementFeePct,
          units: units.length,
          occupied: units.filter((u) => u.status === "occupied").length,
          notice: units.filter((u) => u.status === "notice").length,
          vacant: units.filter((u) => u.status === "vacant").length,
          rentRoll,
        };
      })
    );

    const q = args.q?.trim().toLowerCase();
    return rows
      .filter((r) => !q || [r.name, r.address, r.landlordName, r.managerName ?? ""].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** One property: agreement, landlord, units with their current lease, expenses. */
export const get = query({
  args: { id: v.id("stayProperties") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sp = await ctx.db.get(args.id);
    if (!sp || sp.orgId !== access.orgId) return null;
    if (!access.seesAll && sp.managerUserId !== access.user._id) return null;

    const [prop, landlord, manager, units, leases, expenses] = await Promise.all([
      ctx.db.get(sp.propertyId),
      ctx.db.get(sp.landlordContactId),
      sp.managerUserId ? ctx.db.get(sp.managerUserId) : null,
      ctx.db.query("stayUnits").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
      ctx.db.query("stayLeases").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
      ctx.db.query("stayExpenses").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
    ]);
    const tenants = await nameMaps(ctx, { contacts: leases.map((l) => l.tenantContactId) });

    return {
      _id: sp._id,
      propertyId: sp.propertyId,
      name: prop?.title ?? "Property",
      address: prop?.location ?? "",
      hubType: prop?.type ?? "other",
      kind: sp.kind,
      isActive: sp.isActive,
      managementFeePct: sp.managementFeePct,
      repairApprovalThreshold: sp.repairApprovalThreshold ?? null,
      notes: sp.notes ?? "",
      managerUserId: sp.managerUserId ?? null,
      managerName: manager ? userLabel(manager) : null,
      landlord: landlord
        ? {
            _id: landlord._id,
            name: landlord.name,
            phone: landlord.phone ?? "",
            email: landlord.email ?? "",
            entityKind: landlord.entityKind ?? "individual",
            idNumber: landlord.idNumber ?? "",
            company: landlord.company ?? "",
            bankDetails: landlord.bankDetails ?? {},
          }
        : null,
      units: units
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
        .map((u) => {
          const current = leases.find((l) => l.unitId === u._id && l.status === "active");
          return {
            _id: u._id,
            label: u.label,
            bedrooms: u.bedrooms ?? null,
            status: u.status,
            rooms: u.rooms,
            inspectionIntervalMonths: u.inspectionIntervalMonths ?? null,
            nextInspectionDue: u.nextInspectionDue ?? null,
            lease: current
              ? {
                  _id: current._id,
                  tenantName: tenants.contact(current.tenantContactId)?.name ?? "Tenant",
                  rentAmount: current.rentAmount,
                  currency: current.currency,
                  startDate: current.startDate,
                  endDate: current.endDate,
                  noticeGivenOn: current.noticeGivenOn ?? null,
                }
              : null,
          };
        }),
      pastLeases: leases
        .filter((l) => l.status !== "active")
        .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))
        .slice(0, 20)
        .map((l) => ({
          _id: l._id,
          unitLabel: units.find((u) => u._id === l.unitId)?.label ?? "Unit",
          tenantName: tenants.contact(l.tenantContactId)?.name ?? "Tenant",
          startDate: l.startDate,
          endDate: l.moveOutDate ?? l.endDate,
          status: l.status,
        })),
      expenses: expenses
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 50)
        .map((e) => ({
          _id: e._id,
          date: e.date,
          description: e.description,
          amount: e.amount,
          currency: e.currency,
          supplier: e.supplier ?? "",
          rechargeToLandlord: e.rechargeToLandlord,
          fromMaintenance: !!e.maintenanceId,
        })),
      canEdit: access.canEditLeases,
      canAssign: access.isDirector,
    };
  },
});

/** Staff who can be assigned as property manager: directors and property managers. */
export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .take(500);
    return users
      .filter((u) => u.isActive && (u.role === "admin" || u.estateRoles?.includes("property_manager")))
      .map((u) => ({ _id: u._id, name: userLabel(u) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** CRM properties not yet under management, for "use an existing property". */
export const searchHubProperties = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const q = args.q.trim().toLowerCase();
    if (q.length < 2) return [];
    const props = await ctx.db
      .query("properties")
      .withIndex("by_org", (qq) => qq.eq("orgId", access.orgId))
      .collect();
    const matches = props
      .filter((p) => !p.isDraft && (p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q)))
      .slice(0, 30);
    const out = [];
    for (const p of matches) {
      const managed = await ctx.db
        .query("stayProperties")
        .withIndex("by_property", (qq) => qq.eq("propertyId", p._id))
        .first();
      if (managed) continue;
      out.push({ _id: p._id, title: p.title, location: p.location, type: p.type, status: p.status, listingType: p.listingType });
      if (out.length >= 10) break;
    }
    return out;
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    // Either an existing Hub property or the details for a new one.
    hubPropertyId: v.optional(v.id("properties")),
    newProperty: v.optional(
      v.object({ name: v.string(), address: v.string(), hubType: hubTypeValidator })
    ),
    kind: kindValidator,
    landlord: personRefValidator,
    managerUserId: v.optional(v.id("users")),
    managementFeePct: v.number(),
    units: v.array(v.object({ label: v.string(), bedrooms: v.optional(v.number()) })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    checkFee(args.managementFeePct);
    // A manager who adds a property manages it; only a director assigns others.
    const managerUserId = access.isDirector ? args.managerUserId : access.user._id;
    await assertManager(ctx, access.orgId, managerUserId);
    const now = Date.now();

    let propertyId: Id<"properties">;
    let propertyName: string;
    if (args.hubPropertyId) {
      const prop = await ctx.db.get(args.hubPropertyId);
      if (!prop || prop.orgId !== access.orgId) throw new ConvexError("Property not found");
      const managed = await ctx.db
        .query("stayProperties")
        .withIndex("by_property", (q) => q.eq("propertyId", prop._id))
        .first();
      if (managed) throw new ConvexError("This property is already managed in SyncStay");
      propertyId = prop._id;
      propertyName = prop.title;
    } else {
      const np = args.newProperty;
      if (!np || !np.name.trim()) throw new ConvexError("Property name is required");
      if (!np.address.trim()) throw new ConvexError("Address is required");
      const org = await ctx.db.get(access.orgId);
      propertyName = np.name.trim();
      propertyId = await ctx.db.insert("properties", {
        title: propertyName,
        type: args.kind === "commercial" ? "commercial" : np.hubType,
        listingType: "rent",
        price: 0,
        currency: org?.defaultCurrency ?? "USD",
        location: np.address.trim(),
        area: 0,
        status: "off_market",
        description: "",
        images: [],
        // Owned by the agency, not an agent: it stays out of agents' personal books.
        ownershipType: "company",
        ownerUserIds: [],
        createdByUserId: access.user._id,
        orgId: access.orgId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const landlordContactId = await upsertLandlord(ctx, access, args.landlord);
    await linkLandlordToProperty(ctx, access, propertyId, landlordContactId);

    const stayPropertyId = await ctx.db.insert("stayProperties", {
      orgId: access.orgId,
      propertyId,
      landlordContactId,
      managerUserId,
      kind: args.kind,
      managementFeePct: args.managementFeePct,
      notes: args.notes?.trim() || undefined,
      isActive: true,
      createdByUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });

    const units = args.units.filter((u) => u.label.trim());
    if (!units.length) units.push({ label: "Main", bedrooms: undefined });
    for (const u of units) {
      await ctx.db.insert("stayUnits", {
        orgId: access.orgId,
        stayPropertyId,
        label: u.label.trim(),
        bedrooms: u.bedrooms,
        status: "vacant",
        rooms: defaultRooms(u.bedrooms),
        createdAt: now,
        updatedAt: now,
      });
    }

    await stayAudit(ctx, access, {
      action: "stay.property_create",
      description: `Added ${propertyName} to SyncStay with ${units.length} unit${units.length === 1 ? "" : "s"}`,
      targetType: "stayProperty",
      targetId: stayPropertyId,
      targetLabel: propertyName,
      metadata: { managementFeePct: args.managementFeePct, landlordContactId },
    });
    return stayPropertyId;
  },
});

export const update = mutation({
  args: {
    id: v.id("stayProperties"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    kind: v.optional(kindValidator),
    managementFeePct: v.optional(v.number()),
    managerUserId: v.optional(v.union(v.id("users"), v.null())),
    landlordContactId: v.optional(v.id("contacts")),
    repairApprovalThreshold: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const sp = await getVisibleStayProperty(ctx, access, args.id);
    const now = Date.now();
    const patch: Partial<Doc<"stayProperties">> = { updatedAt: now };
    const changes: Record<string, unknown> = {};

    if (args.managementFeePct !== undefined && args.managementFeePct !== sp.managementFeePct) {
      checkFee(args.managementFeePct);
      patch.managementFeePct = args.managementFeePct;
      changes.managementFeePct = { from: sp.managementFeePct, to: args.managementFeePct };
    }
    if (args.kind) patch.kind = args.kind;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.repairApprovalThreshold !== undefined) {
      patch.repairApprovalThreshold = args.repairApprovalThreshold ?? undefined;
    }

    const leaseIds = (
      await ctx.db.query("stayLeases").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect()
    );

    // Reassigning the manager or the landlord is a director's call. Both are
    // denormalised onto the property's leases, so those follow.
    if (args.managerUserId !== undefined && (args.managerUserId ?? undefined) !== sp.managerUserId) {
      if (!access.isDirector) throw new ConvexError("Only a director can reassign the property manager");
      const next = args.managerUserId ?? undefined;
      await assertManager(ctx, access.orgId, next);
      patch.managerUserId = next;
      changes.managerUserId = { from: sp.managerUserId ?? null, to: next ?? null };
      for (const l of leaseIds) await ctx.db.patch(l._id, { managerUserId: next, updatedAt: now });
    }
    if (args.landlordContactId && args.landlordContactId !== sp.landlordContactId) {
      if (!access.isDirector) throw new ConvexError("Only a director can change the landlord");
      const c = await getOrgContact(ctx, access.orgId, args.landlordContactId);
      await upsertLandlord(ctx, access, { existingContactId: c._id });
      await linkLandlordToProperty(ctx, access, sp.propertyId, c._id);
      patch.landlordContactId = c._id;
      changes.landlordContactId = { from: sp.landlordContactId, to: c._id };
      for (const l of leaseIds) await ctx.db.patch(l._id, { landlordContactId: c._id, updatedAt: now });
    }

    const prop = await ctx.db.get(sp.propertyId);
    if (prop && (args.name?.trim() || args.address?.trim())) {
      await ctx.db.patch(prop._id, {
        ...(args.name?.trim() ? { title: args.name.trim() } : {}),
        ...(args.address?.trim() ? { location: args.address.trim() } : {}),
        updatedAt: now,
      });
    }

    await ctx.db.patch(sp._id, patch);
    await stayAudit(ctx, access, {
      action: "stay.property_update",
      description: `Updated ${prop?.title ?? "property"}`,
      targetType: "stayProperty",
      targetId: sp._id,
      targetLabel: prop?.title,
      metadata: changes,
    });
  },
});

export const addUnit = mutation({
  args: { stayPropertyId: v.id("stayProperties"), label: v.string(), bedrooms: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const sp = await getVisibleStayProperty(ctx, access, args.stayPropertyId);
    const label = args.label.trim();
    if (!label) throw new ConvexError("Unit name is required");
    const existing = await ctx.db
      .query("stayUnits")
      .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
      .collect();
    if (existing.some((u) => u.label.toLowerCase() === label.toLowerCase())) {
      throw new ConvexError(`There is already a unit called ${label}`);
    }
    const now = Date.now();
    return ctx.db.insert("stayUnits", {
      orgId: access.orgId,
      stayPropertyId: sp._id,
      label,
      bedrooms: args.bedrooms,
      status: "vacant",
      rooms: defaultRooms(args.bedrooms),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateUnit = mutation({
  args: {
    unitId: v.id("stayUnits"),
    label: v.optional(v.string()),
    bedrooms: v.optional(v.union(v.number(), v.null())),
    rooms: v.optional(v.array(v.string())),
    inspectionIntervalMonths: v.optional(v.union(v.number(), v.null())),
    nextInspectionDue: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.orgId !== access.orgId) throw new ConvexError("Unit not found");
    await getVisibleStayProperty(ctx, access, unit.stayPropertyId);
    const patch: Partial<Doc<"stayUnits">> = { updatedAt: Date.now() };
    if (args.label !== undefined) {
      if (!args.label.trim()) throw new ConvexError("Unit name is required");
      patch.label = args.label.trim();
    }
    if (args.bedrooms !== undefined) patch.bedrooms = args.bedrooms ?? undefined;
    if (args.rooms !== undefined) patch.rooms = args.rooms.map((r) => r.trim()).filter(Boolean);
    if (args.inspectionIntervalMonths !== undefined) patch.inspectionIntervalMonths = args.inspectionIntervalMonths ?? undefined;
    if (args.nextInspectionDue !== undefined) patch.nextInspectionDue = args.nextInspectionDue ?? undefined;
    await ctx.db.patch(unit._id, patch);
  },
});

/** Vacant units the caller may let, for the new lease form. */
export const vacantUnits = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const sps = await visibleStayProperties(ctx, access);
    const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId) });
    const out = [];
    for (const sp of sps) {
      if (!sp.isActive) continue;
      const units = await ctx.db
        .query("stayUnits")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
        .collect();
      for (const u of units) {
        if (u.status !== "vacant") continue;
        out.push({
          unitId: u._id,
          stayPropertyId: sp._id,
          label: `${names.property(sp.propertyId)?.title ?? "Property"}, ${u.label}`,
        });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  },
});
