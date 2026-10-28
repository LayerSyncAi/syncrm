/**
 * Excel import of landlords, properties, units, tenants and leases (BRD Stay
 * ST-06). The app parses and validates the template (src/lib/stay/import.ts)
 * and sends one batch of properties per call. Re-running an import reuses
 * what already exists (landlords and tenants by phone or email, properties by
 * name, units by label) and never creates a second active lease on a unit.
 */
import { ConvexError, Infer, v } from "convex/values";
import { mutation, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireStay, requireStayAdmin, StayAccess } from "./access";
import { defaultRooms, isValidDate, round2 } from "./ledger";
import { findLikelyDuplicates, linkLandlordToProperty, refreshUnitStatus, stayAudit, todayForOrg, upsertLandlord, upsertTenant } from "./shared";
import { createLease } from "./leases";
import { insertCharge } from "./money";

const personArg = v.object({
  name: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  idNumber: v.optional(v.string()),
  entityKind: v.optional(v.union(v.literal("individual"), v.literal("company"))),
});

const propertyArg = v.object({
  landlord: v.object({
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    entityKind: v.optional(v.union(v.literal("individual"), v.literal("company"))),
    bankName: v.optional(v.string()),
    accountName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    branch: v.optional(v.string()),
  }),
  name: v.string(),
  address: v.string(),
  kind: v.union(v.literal("residential"), v.literal("commercial")),
  feePct: v.number(),
  managerEmail: v.optional(v.string()),
  units: v.array(
    v.object({
      label: v.string(),
      bedrooms: v.optional(v.number()),
      lease: v.optional(
        v.object({
          tenant: personArg,
          startDate: v.string(),
          endDate: v.string(),
          rent: v.number(),
          currency: v.union(v.literal("USD"), v.literal("ZiG")),
          dueDay: v.number(),
          deposit: v.number(),
          depositHeldIn: v.optional(v.union(v.literal("trust"), v.literal("business"), v.literal("landlord"))),
          depositReceived: v.optional(v.number()),
          openingArrears: v.optional(v.number()),
        })
      ),
    })
  ),
});

type PropertyArg = Infer<typeof propertyArg>;

export const importBatch = mutation({
  args: { properties: v.array(propertyArg) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireStayAdmin(access);
    if (args.properties.length > 25) throw new ConvexError("Send at most 25 properties per batch");
    const today = await todayForOrg(ctx, access.orgId);
    const results = [];
    for (const p of args.properties) {
      try {
        results.push({ name: p.name, ok: true as const, ...(await importProperty(ctx, access, p, today)) });
      } catch (e) {
        // One bad property must not undo the rest of the batch.
        results.push({ name: p.name, ok: false as const, error: e instanceof Error ? e.message : String(e), warnings: [], leases: 0, units: 0 });
      }
    }
    await stayAudit(ctx, access, {
      action: "stay.import",
      description: `Imported ${results.filter((r) => r.ok).length} of ${results.length} properties from Excel`,
      targetType: "organization",
      targetId: access.orgId,
    });
    return results;
  },
});

async function findManager(ctx: MutationCtx, orgId: Id<"organizations">, email?: string): Promise<Id<"users"> | undefined> {
  const e = email?.trim().toLowerCase();
  if (!e) return undefined;
  const users = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", e)).take(5);
  return users.find((u) => u.orgId === orgId && u.isActive)?._id;
}

async function findPerson(ctx: MutationCtx, access: StayAccess, p: { name: string; phone?: string; email?: string }, role: "landlord" | "tenant") {
  const dupes = await findLikelyDuplicates(ctx, access.orgId, p.phone, p.email);
  if (dupes.length) return dupes[0]._id;
  // Without phone or email, fall back to an exact name among people in the same role.
  if (role === "landlord") {
    for (const ownerType of ["landlord", "both"] as const) {
      const list = await ctx.db
        .query("contacts")
        .withIndex("by_org_owner_type", (q) => q.eq("orgId", access.orgId).eq("ownerType", ownerType))
        .collect();
      const hit = list.find((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (hit) return hit._id;
    }
  } else if (!p.phone && !p.email) {
    const list = await ctx.db
      .query("contacts")
      .withIndex("by_org_lease_tenant", (q) => q.eq("orgId", access.orgId).eq("isLeaseTenant", true))
      .collect();
    const hit = list.find((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (hit) return hit._id;
  }
  return undefined;
}

async function importProperty(ctx: MutationCtx, access: StayAccess, p: PropertyArg, today: string) {
  const warnings: string[] = [];
  const now = Date.now();

  const L = p.landlord;
  const existingLandlord = await findPerson(ctx, access, L, "landlord");
  const landlordContactId = await upsertLandlord(ctx, access, {
    existingContactId: existingLandlord,
    person: {
      name: L.name,
      phone: L.phone,
      email: L.email,
      idNumber: L.idNumber,
      entityKind: L.entityKind,
      bankDetails: { bankName: L.bankName, accountName: L.accountName, accountNumber: L.accountNumber, branch: L.branch },
    },
  });

  const managerUserId = await findManager(ctx, access.orgId, p.managerEmail);
  if (p.managerEmail && !managerUserId) warnings.push(`No active user with email ${p.managerEmail}; no manager assigned`);

  // Reuse a Stay property with the same name.
  const managed = await ctx.db.query("stayProperties").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect();
  let sp: Doc<"stayProperties"> | null = null;
  for (const m of managed) {
    const prop = await ctx.db.get(m.propertyId);
    if (prop && prop.title.trim().toLowerCase() === p.name.trim().toLowerCase()) {
      sp = m;
      break;
    }
  }
  if (sp) {
    if (sp.landlordContactId !== landlordContactId) warnings.push("Property already exists with a different landlord; kept the existing landlord");
  } else {
    const org = await ctx.db.get(access.orgId);
    const propertyId = await ctx.db.insert("properties", {
      title: p.name.trim(),
      type: p.kind === "commercial" ? "commercial" : "house",
      listingType: "rent",
      price: 0,
      currency: org?.defaultCurrency ?? "USD",
      location: p.address.trim() || p.name.trim(),
      area: 0,
      status: "off_market",
      description: "",
      images: [],
      ownershipType: "company",
      ownerUserIds: [],
      createdByUserId: access.user._id,
      orgId: access.orgId,
      createdAt: now,
      updatedAt: now,
    });
    await linkLandlordToProperty(ctx, access, propertyId, landlordContactId);
    const id = await ctx.db.insert("stayProperties", {
      orgId: access.orgId,
      propertyId,
      landlordContactId,
      managerUserId,
      kind: p.kind,
      managementFeePct: p.feePct,
      isActive: true,
      createdByUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    sp = (await ctx.db.get(id))!;
  }

  const units = await ctx.db.query("stayUnits").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect();
  let unitCount = 0;
  let leaseCount = 0;
  for (const u of p.units) {
    let unit = units.find((x) => x.label.trim().toLowerCase() === u.label.trim().toLowerCase());
    if (!unit) {
      const id = await ctx.db.insert("stayUnits", {
        orgId: access.orgId,
        stayPropertyId: sp._id,
        label: u.label.trim(),
        bedrooms: u.bedrooms,
        status: "vacant",
        rooms: defaultRooms(u.bedrooms),
        createdAt: now,
        updatedAt: now,
      });
      unit = (await ctx.db.get(id))!;
      units.push(unit);
      unitCount++;
    }
    const l = u.lease;
    if (!l) continue;
    const active = (await ctx.db.query("stayLeases").withIndex("by_unit", (q) => q.eq("unitId", unit._id)).collect()).find(
      (x) => x.status === "active"
    );
    if (active) {
      warnings.push(`${unit.label} already has an active lease; skipped`);
      continue;
    }
    if (!isValidDate(l.startDate) || !isValidDate(l.endDate) || l.endDate <= l.startDate) {
      warnings.push(`${unit.label}: invalid lease dates; skipped`);
      continue;
    }
    const tenantId = await findPerson(ctx, access, l.tenant, "tenant");
    const leaseId = await createLease(ctx, access, {
      unitId: unit._id,
      tenant: tenantId
        ? { existingContactId: tenantId }
        : { person: { name: l.tenant.name, phone: l.tenant.phone, email: l.tenant.email, idNumber: l.tenant.idNumber, entityKind: l.tenant.entityKind } },
      startDate: l.startDate,
      endDate: l.endDate,
      rentAmount: l.rent,
      currency: l.currency,
      dueDay: Math.min(28, Math.max(1, Math.round(l.dueDay))),
      depositAmount: l.deposit,
      depositHeldIn: l.depositHeldIn,
      silent: true,
    });
    if (tenantId) await upsertTenant(ctx, access, { existingContactId: tenantId });
    leaseCount++;

    // Deposit already held before the switch: an opening balance, no receipt.
    const received = round2(Math.min(l.depositReceived ?? 0, l.deposit || (l.depositReceived ?? 0)));
    if (received > 0) {
      const dep = await ctx.db.query("stayDeposits").withIndex("by_lease", (q) => q.eq("leaseId", leaseId)).first();
      if (dep) {
        await ctx.db.patch(dep._id, {
          amountReceived: received,
          status: "held",
          movements: [{ kind: "received", amount: received, date: today, note: "Opening balance (import)", byUserId: access.user._id, at: now }],
          updatedAt: now,
        });
      }
    }
    // Arrears carried over from the old system, due today.
    if ((l.openingArrears ?? 0) > 0) {
      const lease = (await ctx.db.get(leaseId))!;
      await insertCharge(ctx, lease, {
        kind: "other",
        description: "Opening balance (import)",
        amount: l.openingArrears!,
        dueDate: today,
        createdByUserId: access.user._id,
      });
    }
    await refreshUnitStatus(ctx, unit._id);
  }
  return { warnings, units: unitCount, leases: leaseCount };
}
