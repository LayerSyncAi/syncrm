/**
 * Landlords and tenants in SyncStay (BRD Stay ST-01, ST-10, ST-26).
 *
 * Both are Hub `contacts`: a landlord carries ownerType "landlord"/"both",
 * a tenant carries isLeaseTenant. Stay reaches a contact through the Stay
 * records the caller may see, not through the CRM's agent ownership.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { StayAccess, requireLeaseEditor, requireStay } from "./access";
import { addTo, CurrencyTotals, outstanding, round2 } from "./ledger";
import {
  canSeeLease,
  chainAccount,
  findLikelyDuplicates,
  leaseChain,
  leaseLabels,
  nameMaps,
  stayAudit,
  todayForOrg,
  updatePersonPatch,
  userLabel,
  visibleLeases,
  visibleStayProperties,
} from "./shared";
import { personValidator } from "./validators";

/** Whether the caller reaches this contact through a Stay record they can see. */
async function canSeePerson(ctx: QueryCtx | MutationCtx, access: StayAccess, c: Doc<"contacts">): Promise<boolean> {
  if (c.orgId !== access.orgId) return false;
  if (access.seesAll) return true;
  const [asLandlord, asTenant] = await Promise.all([
    ctx.db.query("stayProperties").withIndex("by_landlord", (q) => q.eq("landlordContactId", c._id)).collect(),
    ctx.db.query("stayLeases").withIndex("by_tenant", (q) => q.eq("tenantContactId", c._id)).collect(),
  ]);
  return (
    asLandlord.some((sp) => sp.managerUserId === access.user._id) ||
    asTenant.some((l) => canSeeLease(access, l))
  );
}

function personView(c: Doc<"contacts">) {
  return {
    _id: c._id,
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    entityKind: c.entityKind ?? "individual",
    idNumber: c.idNumber ?? "",
    company: c.company ?? "",
    bankDetails: c.bankDetails ?? {},
  };
}

/**
 * Contacts that look like the person being typed in, by phone or email, so
 * the form can offer "use this contact" instead of creating a duplicate.
 */
export const findDuplicates = query({
  args: { phone: v.optional(v.string()), email: v.optional(v.string()), excludeId: v.optional(v.id("contacts")) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const found = await findLikelyDuplicates(ctx, access.orgId, args.phone, args.email);
    return found
      .filter((c) => c._id !== args.excludeId)
      .slice(0, 5)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        isLandlord: c.ownerType === "landlord" || c.ownerType === "both",
        isTenant: !!c.isLeaseTenant,
      }));
  },
});

/** Landlord contacts for pickers (all org landlords; a pick is a link, not a disclosure of their records). */
export const landlordOptions = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const [landlords, both] = await Promise.all([
      ctx.db.query("contacts").withIndex("by_org_owner_type", (q) => q.eq("orgId", access.orgId).eq("ownerType", "landlord")).collect(),
      ctx.db.query("contacts").withIndex("by_org_owner_type", (q) => q.eq("orgId", access.orgId).eq("ownerType", "both")).collect(),
    ]);
    const q = args.q?.trim().toLowerCase();
    return [...landlords, ...both]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
      .map((c) => ({ _id: c._id, name: c.name, phone: c.phone ?? "" }));
  },
});

/** Landlords of the properties the caller may see. */
export const listLandlords = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const sps = await visibleStayProperties(ctx, access);
    const byLandlord = new Map<string, Doc<"stayProperties">[]>();
    for (const sp of sps) {
      const list = byLandlord.get(sp.landlordContactId) ?? [];
      list.push(sp);
      byLandlord.set(sp.landlordContactId, list);
    }
    const names = await nameMaps(ctx, { contacts: sps.map((sp) => sp.landlordContactId) });
    return [...byLandlord.entries()]
      .map(([id, list]) => {
        const c = names.contact(id as Id<"contacts">);
        return {
          _id: id as Id<"contacts">,
          name: c?.name ?? "Unknown",
          email: c?.email ?? "",
          phone: c?.phone ?? "",
          propertyCount: list.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Edit a landlord's or tenant's details from Stay. */
export const updatePerson = mutation({
  args: { contactId: v.id("contacts"), person: personValidator },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    requireLeaseEditor(access);
    const c = await ctx.db.get(args.contactId);
    if (!c || !(await canSeePerson(ctx, access, c))) throw new ConvexError("Contact not found");
    if (!args.person.name.trim()) throw new ConvexError("Name is required");
    const patch = updatePersonPatch(args.person);
    // Clearing a field on the form clears it on the contact.
    if (!args.person.phone?.trim()) {
      patch.phone = undefined;
      patch.normalizedPhone = undefined;
    }
    if (!args.person.email?.trim()) patch.email = undefined;
    if (!args.person.idNumber?.trim()) patch.idNumber = undefined;
    await ctx.db.patch(c._id, { ...patch, updatedAt: Date.now() });
    await stayAudit(ctx, access, {
      action: "stay.contact_update",
      description: `Updated details for ${args.person.name.trim()}`,
      targetType: "contact",
      targetId: c._id,
      targetLabel: args.person.name.trim(),
    });
  },
});

// ── Tenants ──────────────────────────────────────────────────────────

/**
 * Tenants on leases the caller may see, with what they owe. Balances come
 * from the open charges, read once for the whole agency.
 */
export const listTenants = query({
  args: { q: v.optional(v.string()), status: v.optional(v.union(v.literal("current"), v.literal("past"), v.literal("all"))) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const today = await todayForOrg(ctx, access.orgId);
    const leases = await visibleLeases(ctx, access);
    const visibleIds = new Set(leases.map((l) => l._id as string));
    const label = await leaseLabels(ctx, leases);

    const open = (
      await Promise.all(
        (["unpaid", "part_paid"] as const).map((status) =>
          ctx.db.query("stayCharges").withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status)).collect()
        )
      )
    ).flat();
    const owedByTenant = new Map<string, { owed: CurrencyTotals; overdue: CurrencyTotals }>();
    for (const c of open) {
      if (!visibleIds.has(c.leaseId)) continue;
      const t = owedByTenant.get(c.tenantContactId) ?? { owed: {}, overdue: {} };
      addTo(t.owed, c.currency, outstanding(c));
      if (c.dueDate <= today) addTo(t.overdue, c.currency, outstanding(c));
      owedByTenant.set(c.tenantContactId, t);
    }

    type Row = {
      _id: Id<"contacts">;
      name: string;
      phone: string;
      email: string;
      units: string[];
      hasActiveLease: boolean;
      latestLeaseId: Id<"stayLeases">;
      credit: CurrencyTotals;
      owed: CurrencyTotals;
      overdue: CurrencyTotals;
    };
    const byTenant = new Map<string, Row>();
    for (const l of leases) {
      const lab = label(l);
      let row = byTenant.get(l.tenantContactId);
      if (!row) {
        const owed = owedByTenant.get(l.tenantContactId);
        row = {
          _id: l.tenantContactId,
          name: lab.tenantName,
          phone: lab.tenantPhone ?? "",
          email: lab.tenantEmail ?? "",
          units: [],
          hasActiveLease: false,
          latestLeaseId: l._id,
          credit: {},
          owed: owed?.owed ?? {},
          overdue: owed?.overdue ?? {},
        };
        byTenant.set(l.tenantContactId, row);
      }
      if (l.status === "active") {
        row.hasActiveLease = true;
        row.units.push(`${lab.propertyName}, ${lab.unitLabel}`);
        row.latestLeaseId = l._id;
        if (l.creditBalance) addTo(row.credit, l.currency, l.creditBalance);
      }
    }
    const q = args.q?.trim().toLowerCase();
    const status = args.status ?? "current";
    return [...byTenant.values()]
      .filter((r) => (status === "all" ? true : status === "current" ? r.hasActiveLease : !r.hasActiveLease))
      .filter((r) => !q || [r.name, r.phone, r.email, ...r.units].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** One tenant: details, leases and a running statement per lease. */
export const getTenant = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const c = await ctx.db.get(args.contactId);
    if (!c || c.orgId !== access.orgId) return null;
    const leases = (
      await ctx.db.query("stayLeases").withIndex("by_tenant", (q) => q.eq("tenantContactId", c._id)).collect()
    ).filter((l) => canSeeLease(access, l));
    if (!leases.length && !access.seesAll) return null;
    const today = await todayForOrg(ctx, access.orgId);
    const label = await leaseLabels(ctx, leases);

    // One account per renewal chain, keyed by its latest lease.
    const latestInChain = leases.filter((l) => !l.renewedToLeaseId || !leases.some((x) => x._id === l.renewedToLeaseId));
    const accounts = await Promise.all(
      latestInChain
        .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) || (a.startDate < b.startDate ? 1 : -1))
        .map(async (l) => {
          const chain = await leaseChain(ctx, l);
          const acc = await chainAccount(ctx, chain.filter((x) => canSeeLease(access, x)), today);
          const lab = label(l);
          return {
            leaseId: l._id,
            status: l.status,
            label: `${lab.propertyName}, ${lab.unitLabel}`,
            startDate: chain[0].startDate,
            endDate: l.moveOutDate ?? l.endDate,
            rentAmount: l.rentAmount,
            currency: acc.currency,
            balance: acc.balance,
            overdue: acc.overdue,
            credit: acc.credit,
            lines: acc.statement.lines,
            deposit: acc.deposit
              ? {
                  expected: acc.deposit.amountExpected,
                  received: acc.deposit.amountReceived,
                  held: round2(acc.deposit.amountReceived - acc.deposit.amountApplied - acc.deposit.amountRefunded),
                  heldIn: acc.deposit.heldIn,
                  status: acc.deposit.status,
                }
              : null,
          };
        })
    );
    const managers = await nameMaps(ctx, { users: leases.map((l) => l.managerUserId).filter((x): x is Id<"users"> => !!x) });
    return {
      ...personView(c),
      managerNames: [...new Set(leases.map((l) => (l.managerUserId ? userLabel(managers.user(l.managerUserId)) : null)).filter(Boolean))],
      accounts,
      canEdit: access.canEditLeases,
    };
  },
});

/** One landlord's details and properties (the caller's visible ones). */
export const getLandlord = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const c = await ctx.db.get(args.contactId);
    if (!c || !(await canSeePerson(ctx, access, c))) return null;
    const sps = (
      await ctx.db.query("stayProperties").withIndex("by_landlord", (q) => q.eq("landlordContactId", c._id)).collect()
    ).filter((sp) => access.seesAll || sp.managerUserId === access.user._id);
    const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId) });
    return {
      ...personView(c),
      properties: sps.map((sp) => ({ _id: sp._id, name: names.property(sp.propertyId)?.title ?? "Property", managementFeePct: sp.managementFeePct })),
    };
  },
});
