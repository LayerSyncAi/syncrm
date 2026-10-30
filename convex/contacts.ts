import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess, isEffectiveAdmin } from "./helpers";
import { Doc, Id } from "./_generated/dataModel";
import { areaMatchesLocation, canonicalizeAreas } from "./lib/locations";
import {
  MIN_DUPLICATE_PHONE_DIGITS,
  duplicateReason,
  isBuyerTenantContact,
  isOwnerContact,
} from "./lib/contactRoles";
import { hasEstateRole, orgModules, userCanUseModule } from "./lib/modules";
import { requireModuleUser } from "./lib/moduleAccess";
import { canSeeStayProperty, requireStay } from "./stay/access";
import { canSeeJob, requireWorth } from "./worth/access";
import { outstanding, round2 } from "./stay/ledger";

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export async function canAccessContact(
  ctx: any,
  contactId: Id<"contacts">,
  userId: Id<"users">,
  isAdmin: boolean,
  userOrgId: Id<"organizations">
): Promise<Doc<"contacts"> | null> {
  const contact = await ctx.db.get(contactId);
  if (!contact) return null;
  if (contact.orgId && contact.orgId !== userOrgId) return null;
  if (isAdmin) return contact;
  if (contact.ownerUserIds.includes(userId)) return contact;
  return null;
}

const preferenceArgs = {
  interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
  budgetCurrency: v.optional(v.string()),
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  preferredPropertyTypes: v.optional(
    v.array(
      v.union(
        v.literal("house"),
        v.literal("apartment"),
        v.literal("land"),
        v.literal("commercial"),
        v.literal("other")
      )
    )
  ),
  minBedrooms: v.optional(v.number()),
  minBathrooms: v.optional(v.number()),
};

/** Seller/landlord role on a contact. Unset means "not a property owner". */
export const ownerTypeValidator = v.union(
  v.literal("seller"),
  v.literal("landlord"),
  v.literal("both")
);

/** Which side of the business a list query wants back. */
export const contactRoleFilter = v.union(
  v.literal("all"),
  v.literal("buyer_tenant"),
  v.literal("owner"),
  v.literal("supplier")
);


export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    preferredAreas: v.optional(v.array(v.string())),
    ownerUserIds: v.optional(v.array(v.id("users"))),
    ownerType: v.optional(ownerTypeValidator),
    isBuyerTenant: v.optional(v.boolean()),
    isSupplier: v.optional(v.boolean()),
    ...preferenceArgs,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const timestamp = Date.now();

    let owners: Id<"users">[];
    if (user.role === "admin" && args.ownerUserIds && args.ownerUserIds.length > 0) {
      owners = args.ownerUserIds;
    } else {
      owners = [user._id];
    }

    return ctx.db.insert("contacts", {
      name: args.name,
      phone: args.phone || undefined,
      normalizedPhone: args.phone ? normalizePhone(args.phone) : undefined,
      email: args.email,
      company: args.company,
      notes: args.notes,
      preferredAreas: args.preferredAreas
        ? canonicalizeAreas(args.preferredAreas)
        : undefined,
      interestType: args.interestType,
      budgetCurrency: args.budgetCurrency,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      preferredPropertyTypes: args.preferredPropertyTypes,
      minBedrooms: args.minBedrooms,
      minBathrooms: args.minBathrooms,
      ownerType: args.ownerType,
      // Contacts are buyers/tenants unless the caller says otherwise, so the
      // existing create paths keep their behaviour without passing the flag.
      isBuyerTenant: args.isBuyerTenant ?? true,
      isSupplier: args.isSupplier || undefined,
      ownerUserIds: owners,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const list = query({
  args: {
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    // Which side of the business to return. Defaults to buyers/tenants so the
    // Contacts screens keep showing what they always did once sellers and
    // landlords start living in the same table.
    role: v.optional(contactRoleFilter),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const role = args.role ?? "buyer_tenant";

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const isAdmin = isEffectiveAdmin(user);
    const filtered = contacts.filter((contact) => {
      if (role === "buyer_tenant" && !isBuyerTenantContact(contact)) return false;
      if (role === "owner" && !isOwnerContact(contact)) return false;
      if (role === "supplier" && !contact.isSupplier) return false;

      if (!isAdmin) {
        if (!contact.ownerUserIds.includes(user._id)) {
          return false;
        }
      }

      if (isAdmin && args.ownerUserId) {
        if (!contact.ownerUserIds.includes(args.ownerUserId)) {
          return false;
        }
      }

      if (args.q) {
        const search = args.q.toLowerCase();
        const nameMatch = contact.name.toLowerCase().includes(search);
        const phoneMatch = contact.phone?.includes(search) || contact.normalizedPhone?.includes(normalizePhone(search));
        const emailMatch = contact.email?.toLowerCase().includes(search);
        const companyMatch = contact.company?.toLowerCase().includes(search);
        if (!nameMatch && !phoneMatch && !emailMatch && !companyMatch) {
          return false;
        }
      }

      return true;
    });

    const enriched = filtered.map((contact) => {
      const ownerNames = contact.ownerUserIds.map((ownerId) => {
        const owner = userMap.get(ownerId);
        return owner?.fullName || owner?.name || owner?.email || "Unknown";
      });
      return {
        ...contact,
        ownerNames,
      };
    });

    // Server-side pagination
    const page = args.page ?? 0;
    const pageSize = args.pageSize ?? 50;
    const totalCount = enriched.length;
    const start = page * pageSize;
    const items = enriched.slice(start, start + pageSize);

    return {
      items,
      totalCount,
      page,
      pageSize,
      hasMore: start + pageSize < totalCount,
    };
  },
});

export const getById = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) return null;

    const ownerIds = contact.ownerUserIds;
    const allIds = [...ownerIds];
    if (!allIds.some(id => id === contact.createdByUserId)) {
      allIds.push(contact.createdByUserId);
    }
    const userDocs = await Promise.all(allIds.map(id => ctx.db.get(id)));
    const userMap: Map<string, { fullName?: string; name?: string; email?: string }> = new Map();
    for (const u of userDocs) {
      if (u) userMap.set(u._id as string, u as any);
    }

    const owners = ownerIds.map((ownerId: Id<"users">) => {
      const owner = userMap.get(ownerId as string);
      return {
        _id: ownerId,
        name: owner?.fullName || owner?.name || owner?.email || "Unknown",
      };
    });

    const createdBy = userMap.get(contact.createdByUserId as string);

    return {
      ...contact,
      owners,
      createdByName: createdBy?.fullName || createdBy?.name || createdBy?.email || "Unknown",
    };
  },
});

/**
 * Consolidated contact profile: pulls together everything about a contact so a
 * user opening it sees the full history in one place (lead history, preferences,
 * property enquiries, notes/activity timeline, follow-ups, and the agents who
 * have worked the contact). Activities and property matches live on leads, so
 * we fan out contact -> leads -> activities/matches.
 *
 * Everything a contact-owner (or admin) can see here is intentionally scoped to
 * the CONTACT, not to individual lead ownership, so the record survives an agent
 * leaving and preserves business continuity.
 */
export const getProfile = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) return null;

    const leads = (
      await ctx.db
        .query("leads")
        .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
        .collect()
    ).filter((l) => !l.orgId || l.orgId === user.orgId);

    // Cache user lookups (owners / assignees) to avoid repeated gets.
    const userNameCache = new Map<string, string>();
    const nameOf = async (id: Id<"users"> | undefined | null) => {
      if (!id) return "Unknown";
      const key = id as string;
      if (userNameCache.has(key)) return userNameCache.get(key)!;
      const u = await ctx.db.get(id);
      const name = u ? u.fullName || u.name || u.email || "Unknown" : "Unknown";
      userNameCache.set(key, name);
      return name;
    };

    const leadHistory = await Promise.all(
      leads.map(async (lead) => {
        const stage = await ctx.db.get(lead.stageId);
        return {
          _id: lead._id,
          fullName: lead.fullName,
          source: lead.source,
          interestType: lead.interestType,
          stageName: stage?.name || "Unknown",
          isArchived: !!lead.isArchived,
          isClosed: !!lead.closedAt,
          closedAt: lead.closedAt ?? null,
          closeReason: lead.closeReason ?? null,
          dealValue: lead.dealValue ?? null,
          dealCurrency: lead.dealCurrency ?? null,
          score: lead.score ?? lead.computedScore ?? null,
          notes: lead.notes ?? "",
          ownerUserId: lead.ownerUserId,
          ownerName: await nameOf(lead.ownerUserId),
          createdAt: lead.createdAt,
        };
      })
    );
    leadHistory.sort((a, b) => b.createdAt - a.createdAt);

    // Activities + enquiries across all the contact's leads.
    const leadNameById = new Map(leads.map((l) => [l._id as string, l.fullName]));
    const activities: Array<{
      _id: Id<"activities">;
      leadId: Id<"leads"> | null;
      leadName: string;
      type: string;
      title: string;
      description: string;
      status: string;
      scheduledAt: number | null;
      completedAt: number | null;
      completionNotes: string | null;
      assignedToName: string;
      createdAt: number;
    }> = [];
    const enquiries: Array<{
      _id: Id<"leadPropertyMatches">;
      leadId: Id<"leads">;
      matchType: string;
      createdAt: number;
      property: {
        _id: Id<"properties">;
        title: string;
        location: string;
        listingType: string;
        price: number;
        currency: string;
      } | null;
    }> = [];

    for (const lead of leads) {
      const [acts, matches] = await Promise.all([
        ctx.db
          .query("activities")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .collect(),
        ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .collect(),
      ]);
      for (const a of acts) {
        activities.push({
          _id: a._id,
          leadId: a.leadId ?? null,
          leadName: leadNameById.get((a.leadId ?? "") as string) ?? lead.fullName,
          type: a.type,
          title: a.title,
          description: a.description,
          status: a.status,
          scheduledAt: a.scheduledAt ?? null,
          completedAt: a.completedAt ?? null,
          completionNotes: a.completionNotes ?? null,
          assignedToName: await nameOf(a.assignedToUserId),
          createdAt: a.createdAt,
        });
      }
      for (const m of matches) {
        const property = await ctx.db.get(m.propertyId);
        enquiries.push({
          _id: m._id,
          leadId: m.leadId,
          matchType: m.matchType,
          createdAt: m.createdAt,
          property: property
            ? {
                _id: property._id,
                title: property.title,
                location: property.location,
                listingType: property.listingType,
                price: property.price,
                currency: property.currency,
              }
            : null,
        });
      }
    }
    activities.sort((a, b) => b.createdAt - a.createdAt);
    enquiries.sort((a, b) => b.createdAt - a.createdAt);

    // Agents who have worked this contact: current owners + every past/present
    // lead owner. Preserves "historical agent ownership" without a new table.
    const agentIds = new Set<string>();
    for (const id of contact.ownerUserIds) agentIds.add(id as string);
    for (const l of leads) agentIds.add(l.ownerUserId as string);
    const currentOwnerSet = new Set(
      (contact.ownerUserIds as Id<"users">[]).map((id) => id as string)
    );
    const agentHistory = await Promise.all(
      [...agentIds].map(async (id) => ({
        _id: id as Id<"users">,
        name: await nameOf(id as Id<"users">),
        isCurrentOwner: currentOwnerSet.has(id),
        leadCount: leads.filter((l) => (l.ownerUserId as string) === id).length,
      }))
    );

    return {
      contact,
      leadHistory,
      activities,
      enquiries,
      agentHistory,
      todoCount: activities.filter((a) => a.status === "todo").length,
    };
  },
});

export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    preferredAreas: v.optional(v.array(v.string())),
    ownerUserIds: v.optional(v.array(v.id("users"))),
    ownerType: v.optional(v.union(ownerTypeValidator, v.null())),
    isBuyerTenant: v.optional(v.boolean()),
    isSupplier: v.optional(v.boolean()),
    ...preferenceArgs,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) {
      updates.phone = args.phone;
      updates.normalizedPhone = normalizePhone(args.phone);
    }
    if (args.email !== undefined) updates.email = args.email;
    if (args.company !== undefined) updates.company = args.company;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.preferredAreas !== undefined) updates.preferredAreas = canonicalizeAreas(args.preferredAreas);
    if (args.interestType !== undefined) updates.interestType = args.interestType;
    if (args.budgetCurrency !== undefined) updates.budgetCurrency = args.budgetCurrency;
    if (args.budgetMin !== undefined) updates.budgetMin = args.budgetMin;
    if (args.budgetMax !== undefined) updates.budgetMax = args.budgetMax;
    if (args.preferredPropertyTypes !== undefined) updates.preferredPropertyTypes = args.preferredPropertyTypes;
    if (args.minBedrooms !== undefined) updates.minBedrooms = args.minBedrooms;
    if (args.minBathrooms !== undefined) updates.minBathrooms = args.minBathrooms;
    // null clears the owner role (removes them from Owners) without deleting a
    // record that may still be an active buyer/tenant.
    if (args.ownerType !== undefined) {
      updates.ownerType = args.ownerType ?? undefined;
    }
    if (args.isBuyerTenant !== undefined) updates.isBuyerTenant = args.isBuyerTenant;
    if (args.isSupplier !== undefined) updates.isSupplier = args.isSupplier || undefined;

    if (user.role === "admin" && args.ownerUserIds !== undefined) {
      if (args.ownerUserIds.length === 0) {
        throw new Error("Contact must have at least one owner");
      }
      updates.ownerUserIds = args.ownerUserIds;
    }

    await ctx.db.patch(args.contactId, updates);
  },
});

export const remove = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    // A Hub contact is shared: Stay, Worth, Finance and Dev records point at
    // it, so deleting it there would leave them with no landlord, tenant,
    // client or buyer.
    const usedIn = await otherModuleUses(ctx, args.contactId);
    if (usedIn.length > 0) {
      throw new Error(
        `${contact.name} is used in ${usedIn.join(", ")}, so the contact cannot be deleted`
      );
    }

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .take(500);
    for (const doc of docs) {
      await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }
    await ctx.db.delete(args.contactId);
  },
});

/** Modules other than the CRM that hold records pointing at this contact. */
async function otherModuleUses(ctx: QueryCtx, contactId: Id<"contacts">): Promise<string[]> {
  const [asLandlord, asTenant, asClient, invoice, tx, stand, portal] = await Promise.all([
    ctx.db.query("stayProperties").withIndex("by_landlord", (q) => q.eq("landlordContactId", contactId)).first(),
    ctx.db.query("stayLeases").withIndex("by_tenant", (q) => q.eq("tenantContactId", contactId)).first(),
    ctx.db.query("worthJobs").withIndex("by_client", (q) => q.eq("clientContactId", contactId)).first(),
    ctx.db.query("finInvoices").withIndex("by_contact", (q) => q.eq("contactId", contactId)).first(),
    ctx.db.query("finTransactions").withIndex("by_contact", (q) => q.eq("contactId", contactId)).first(),
    ctx.db.query("finStands").withIndex("by_buyer_contact", (q) => q.eq("buyerContactId", contactId)).first(),
    ctx.db.query("users").withIndex("by_portal_contact", (q) => q.eq("portalContactId", contactId)).first(),
  ]);
  const uses: string[] = [];
  if (asLandlord || asTenant || portal) uses.push("Sync Stay");
  if (asClient) uses.push("Sync Worth");
  if (invoice || tx) uses.push("Sync Finance");
  if (stand) uses.push("stand sales");
  return uses;
}

export const addOwner = mutation({
  args: {
    contactId: v.id("contacts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    if (contact.ownerUserIds.includes(args.userId)) {
      return;
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || !targetUser.isActive || targetUser.orgId !== user.orgId) {
      throw new Error("User not found or inactive");
    }

    await ctx.db.patch(args.contactId, {
      ownerUserIds: [...contact.ownerUserIds, args.userId],
      updatedAt: Date.now(),
    });
  },
});

export const removeOwner = mutation({
  args: {
    contactId: v.id("contacts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    if (contact.ownerUserIds.length <= 1) {
      throw new Error("Contact must have at least one owner");
    }

    if (!contact.ownerUserIds.includes(args.userId)) {
      return;
    }

    await ctx.db.patch(args.contactId, {
      ownerUserIds: contact.ownerUserIds.filter((id: Id<"users">) => id !== args.userId),
      updatedAt: Date.now(),
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const accessible = contacts.filter((contact) => {
      if (user.role === "admin") return true;
      return contact.ownerUserIds.includes(user._id);
    });

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      total: accessible.length,
      newThisWeek: accessible.filter((c) => c.createdAt >= oneWeekAgo).length,
    };
  },
});

/**
 * Match a single contact's preferences against available properties.
 * Returns properties that satisfy the contact's stored criteria.
 */
export const matchProperties = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) return [];

    // Needs at least one preference to match on
    const hasPrefs =
      contact.interestType ||
      contact.preferredAreas?.length ||
      contact.preferredPropertyTypes?.length ||
      contact.budgetMin ||
      contact.budgetMax;
    if (!hasPrefs) return [];

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    return properties
      .filter((p) => {
        if (p.isDraft) return false;
        if (p.status !== "available" && p.status !== "under_offer") return false;

        // Interest type: rent → rent, buy → sale
        if (contact.interestType) {
          const wantedListing = contact.interestType === "buy" ? "sale" : "rent";
          if (p.listingType !== wantedListing) return false;
        }

        // Property type filter
        if (contact.preferredPropertyTypes?.length) {
          if (!contact.preferredPropertyTypes.includes(p.type as any)) return false;
        }

        // Budget filter
        if (contact.budgetMin && p.price < contact.budgetMin) return false;
        if (contact.budgetMax && p.price > contact.budgetMax) return false;

        // Area/location filter (normalized + alias-aware matching)
        if (contact.preferredAreas?.length) {
          const areaMatch = contact.preferredAreas.some((a: string) =>
            areaMatchesLocation(a, p.location)
          );
          if (!areaMatch) return false;
        }

        // Bedrooms
        if (contact.minBedrooms && (p.bedrooms ?? 0) < contact.minBedrooms) return false;
        // Bathrooms
        if (contact.minBathrooms && (p.bathrooms ?? 0) < contact.minBathrooms) return false;

        return true;
      })
      .slice(0, 50)
      .map((p) => ({
        _id: p._id,
        title: p.title,
        type: p.type,
        listingType: p.listingType,
        price: p.price,
        currency: p.currency,
        location: p.location,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        area: p.area,
        status: p.status,
      }));
  },
});

/**
 * Segmented contact list — filter contacts by their stored preferences
 * and by historical lead interest data (past leads on the contact).
 */
export const segmentedList = query({
  args: {
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    propertyType: v.optional(
      v.union(
        v.literal("house"),
        v.literal("apartment"),
        v.literal("land"),
        v.literal("commercial"),
        v.literal("other")
      )
    ),
    area: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    minBedrooms: v.optional(v.number()),
    includeHistorical: v.optional(v.boolean()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const accessible = contacts.filter((c) => {
      if (user.role === "admin") return true;
      return c.ownerUserIds.includes(user._id);
    });

    // If includeHistorical, fetch all leads and build a contactId → lead-prefs map
    let leadPrefsMap: Map<string, { interestTypes: Set<string>; areas: Set<string>; budgetMin?: number; budgetMax?: number }> | undefined;
    if (args.includeHistorical) {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
        .collect();
      leadPrefsMap = new Map();
      for (const lead of leads) {
        const key = lead.contactId as string;
        let entry = leadPrefsMap.get(key);
        if (!entry) {
          entry = { interestTypes: new Set(), areas: new Set() };
          leadPrefsMap.set(key, entry);
        }
        entry.interestTypes.add(lead.interestType);
        for (const a of lead.preferredAreas) entry.areas.add(a.toLowerCase());
        if (lead.budgetMin && (!entry.budgetMin || lead.budgetMin < entry.budgetMin)) {
          entry.budgetMin = lead.budgetMin;
        }
        if (lead.budgetMax && (!entry.budgetMax || lead.budgetMax > entry.budgetMax)) {
          entry.budgetMax = lead.budgetMax;
        }
      }
    }

    const filtered = accessible.filter((c) => {
      const historicalPrefs = leadPrefsMap?.get(c._id as string);

      // Interest type
      if (args.interestType) {
        const contactMatch = c.interestType === args.interestType;
        const histMatch = historicalPrefs?.interestTypes.has(args.interestType) ?? false;
        if (!contactMatch && !histMatch) return false;
      }

      // Property type
      if (args.propertyType) {
        if (!c.preferredPropertyTypes?.includes(args.propertyType as any)) return false;
      }

      // Area (normalized + alias-aware so "Mt Pleasant" matches "Mount Pleasant")
      if (args.area) {
        const area = args.area;
        const contactAreaMatch = c.preferredAreas?.some((a) =>
          areaMatchesLocation(area, a)
        ) ?? false;
        const histAreaMatch = historicalPrefs
          ? [...historicalPrefs.areas].some((a) => areaMatchesLocation(area, a))
          : false;
        if (!contactAreaMatch && !histAreaMatch) return false;
      }

      // Budget range overlap
      if (args.budgetMin) {
        const cMax = c.budgetMax ?? historicalPrefs?.budgetMax;
        if (cMax !== undefined && cMax < args.budgetMin) return false;
      }
      if (args.budgetMax) {
        const cMin = c.budgetMin ?? historicalPrefs?.budgetMin;
        if (cMin !== undefined && cMin > args.budgetMax) return false;
      }

      // Min bedrooms
      if (args.minBedrooms) {
        if (c.minBedrooms && c.minBedrooms < args.minBedrooms) return false;
      }

      return true;
    });

    // Enrich with owner names
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const enriched = filtered.map((c) => ({
      ...c,
      ownerNames: c.ownerUserIds.map((id) => {
        const owner = userMap.get(id);
        return owner?.fullName || owner?.name || owner?.email || "Unknown";
      }),
      historicalInterests: leadPrefsMap?.get(c._id as string)
        ? {
            interestTypes: [...(leadPrefsMap.get(c._id as string)!.interestTypes)],
            areas: [...(leadPrefsMap.get(c._id as string)!.areas)],
          }
        : undefined,
    }));

    const page = args.page ?? 0;
    const pageSize = args.pageSize ?? 50;
    const totalCount = enriched.length;
    const start = page * pageSize;
    const items = enriched.slice(start, start + pageSize);

    return {
      items,
      totalCount,
      page,
      pageSize,
      hasMore: start + pageSize < totalCount,
    };
  },
});

/**
 * HB-33: existing contacts in the org that look like the person being
 * entered, by phone or email. Like the lead duplicate warning, this names
 * matches the caller does not own, so nobody creates a second record for the
 * same person; `canOpen` says whether the caller can open the match.
 */
export const findDuplicates = query({
  args: {
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    excludeId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const found = new Map<string, Doc<"contacts">>();

    const phone = args.phone ? normalizePhone(args.phone) : "";
    if (phone.length >= MIN_DUPLICATE_PHONE_DIGITS) {
      const rows = await ctx.db
        .query("contacts")
        .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", phone))
        .take(20);
      for (const c of rows) found.set(c._id, c);
    }
    const email = args.email?.trim();
    if (email && email.includes("@")) {
      // Stored as typed, so look up both the typed and the lower-case form.
      for (const variant of new Set([email, email.toLowerCase()])) {
        const rows = await ctx.db
          .query("contacts")
          .withIndex("by_org_email", (q) => q.eq("orgId", user.orgId).eq("email", variant))
          .take(20);
        for (const c of rows) found.set(c._id, c);
      }
    }

    const isAdmin = user.role === "admin";
    const matches = [];
    for (const c of found.values()) {
      if (c.orgId !== user.orgId || c._id === args.excludeId) continue;
      const reason = duplicateReason(c, args);
      if (!reason) continue;
      matches.push({
        _id: c._id,
        name: c.name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        reason,
        canOpen: isAdmin || c.ownerUserIds.includes(user._id),
      });
    }
    return matches.slice(0, 5);
  },
});

/** A query gate that answers "no" instead of throwing. */
async function allowed<T>(gate: Promise<T>): Promise<T | null> {
  try {
    return await gate;
  } catch {
    return null;
  }
}

const ROW_LIMIT = 20;

/**
 * HB-32: the contact's records in every other module on one page. Each
 * section uses that module's own access rules and is null when the caller
 * cannot open the module, so the page only shows what they could see there.
 */
export const getAcrossModules = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(ctx, args.contactId, user._id, user.role === "admin", user.orgId);
    if (!contact) return null;
    const org = await ctx.db.get(user.orgId);
    const modules = orgModules(org);
    const isDirector = user.role === "admin" && !user.agentMode;
    const isAccounts = hasEstateRole(user, "accounts");
    const propertyTitle = async (propertyId: Id<"properties">) => (await ctx.db.get(propertyId))?.title ?? "Property";

    // ── Sync Stay: properties they let, leases they rent ──
    const stayAccess = await allowed(requireStay(ctx));
    let stay = null;
    if (stayAccess) {
      const [owned, rented] = await Promise.all([
        ctx.db.query("stayProperties").withIndex("by_landlord", (q) => q.eq("landlordContactId", contact._id)).take(50),
        ctx.db.query("stayLeases").withIndex("by_tenant", (q) => q.eq("tenantContactId", contact._id)).take(50),
      ]);
      const properties = await Promise.all(
        owned
          .filter((sp) => canSeeStayProperty(stayAccess, sp))
          .slice(0, ROW_LIMIT)
          .map(async (sp) => ({ _id: sp._id, title: await propertyTitle(sp.propertyId), isActive: sp.isActive }))
      );
      const leases = await Promise.all(
        rented
          .filter((l) => l.orgId === stayAccess.orgId && (stayAccess.seesAll || l.managerUserId === user._id))
          .slice(0, ROW_LIMIT)
          .map(async (l) => {
            const [sp, unit, charges] = await Promise.all([
              ctx.db.get(l.stayPropertyId),
              ctx.db.get(l.unitId),
              ctx.db.query("stayCharges").withIndex("by_lease", (q) => q.eq("leaseId", l._id)).take(500),
            ]);
            const owed = charges
              .filter((c) => c.status === "unpaid" || c.status === "part_paid")
              .reduce((t, c) => t + outstanding(c), 0);
            return {
              _id: l._id,
              property: sp ? await propertyTitle(sp.propertyId) : "Property",
              unit: unit?.label ?? "",
              status: l.status,
              startDate: l.startDate,
              endDate: l.endDate,
              rentAmount: l.rentAmount,
              currency: l.currency,
              balance: round2(owed),
            };
          })
      );
      stay = { properties, leases, isTenant: rented.length > 0 };
    }

    // ── Sync Finance: invoices and landlord payouts ──
    // Mirrors finance/core.ts requireFinance and visibleLandlordIds; imported
    // here would form a cycle (stay/shared imports this module).
    const financeUser = await allowed(requireModuleUser(ctx, "finance"));
    let finance = null;
    if (financeUser) {
      const isStaff = isDirector || isAccounts;
      const managesLandlord =
        isStaff ||
        (await ctx.db
          .query("stayProperties")
          .withIndex("by_landlord", (q) => q.eq("landlordContactId", contact._id))
          .take(50)).some((sp) => sp.managerUserId === user._id);
      const invoices = isStaff
        ? (await ctx.db.query("finInvoices").withIndex("by_contact", (q) => q.eq("contactId", contact._id)).order("desc").take(ROW_LIMIT))
            .filter((i) => i.orgId === user.orgId)
            .map((i) => ({
              _id: i._id,
              number: i.number,
              date: i.date,
              dueDate: i.dueDate,
              currency: i.currency,
              total: i.total,
              amountPaid: i.amountPaid,
              status: i.status,
            }))
        : null;
      const payouts = managesLandlord
        ? (await ctx.db
            .query("finPayouts")
            .withIndex("by_org_ledger_key", (q) => q.eq("orgId", user.orgId).eq("ledger", "landlord").eq("key", contact._id))
            .order("desc")
            .take(ROW_LIMIT)).map((p) => ({
            _id: p._id,
            number: p.number,
            date: p.date,
            currency: p.currency,
            amount: p.amount,
            status: p.status,
          }))
        : null;
      finance = invoices || payouts ? { invoices, payouts } : null;
    }

    // ── Sync Worth: valuations they instructed ──
    const worthAccess = await allowed(requireWorth(ctx));
    let worth = null;
    if (worthAccess) {
      const jobs = await ctx.db
        .query("worthJobs")
        .withIndex("by_client", (q) => q.eq("clientContactId", contact._id))
        .order("desc")
        .take(50);
      worth = {
        jobs: jobs
          .filter((j) => canSeeJob(worthAccess, j))
          .slice(0, ROW_LIMIT)
          .map((j) => ({
            _id: j._id,
            reference: j.reference,
            propertyAddress: j.propertyAddress,
            status: j.status,
            receivedDate: j.receivedDate,
            dueDate: j.dueDate,
            issuedDate: j.issuedDate ?? null,
          })),
      };
    }

    // ── Stand sales (Sync Dev, or Sync Finance instalments) ──
    // Mirrors dev/access.ts requireSales, for the same import-cycle reason.
    const viaDev = userCanUseModule(user, org, "dev");
    const viaFinance = userCanUseModule(user, org, "finance") && (user.role === "admin" || isAccounts);
    let stands = null;
    if (viaDev || viaFinance) {
      const rows = (
        await ctx.db
          .query("finStands")
          .withIndex("by_buyer_contact", (q) => q.eq("buyerContactId", contact._id))
          .order("desc")
          .take(ROW_LIMIT)
      ).filter((s) => s.orgId === user.orgId);
      const devNames = new Map<string, string>();
      for (const s of rows) {
        if (!devNames.has(s.developmentId)) {
          devNames.set(s.developmentId, (await ctx.db.get(s.developmentId))?.name ?? "");
        }
      }
      const base = modules.includes("dev") && viaDev ? "/app/dev/buyers" : "/app/finance/instalments";
      stands = rows.map((s) => ({
        _id: s._id,
        standNumber: s.standNumber,
        development: devNames.get(s.developmentId) ?? "",
        currency: s.currency,
        price: s.price,
        balance: s.balance,
        overdue: s.overdue,
        status: s.status,
        href: `${base}/${s._id}`,
      }));
    }

    return { stay, finance, worth, stands };
  },
});
