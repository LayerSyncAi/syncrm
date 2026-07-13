import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess, isEffectiveAdmin } from "./helpers";
import { Id } from "./_generated/dataModel";
import { areaMatchesLocation, canonicalizeAreas } from "./lib/locations";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function canAccessContact(
  ctx: any,
  contactId: Id<"contacts">,
  userId: Id<"users">,
  isAdmin: boolean,
  userOrgId: Id<"organizations">
) {
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

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    preferredAreas: v.optional(v.array(v.string())),
    ownerUserIds: v.optional(v.array(v.id("users"))),
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
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

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

    await ctx.db.delete(args.contactId);
  },
});

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
