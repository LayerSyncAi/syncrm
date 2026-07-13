import { mutation, query, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  getCurrentUserWithOrg,
  assertOrgAccess,
  canAccessPropertyPrivate,
  canManageProperty,
} from "./helpers";
import { recordAudit } from "./logs";
import { Id } from "./_generated/dataModel";
import { normalizeOwnership as normalizeOwnershipPure } from "./propertyAccessLib";

/**
 * Id-typed wrapper around the pure ownership normaliser (single source of
 * truth in propertyAccessLib). See that file for the shaping rules.
 */
function normalizeOwnership(ownerUserIds?: Array<Id<"users">>): {
  ownershipType: "agent" | "multiple" | "company";
  ownerUserIds: Array<Id<"users">>;
} {
  const result = normalizeOwnershipPure(ownerUserIds);
  return {
    ownershipType: result.ownershipType,
    ownerUserIds: result.ownerUserIds as Array<Id<"users">>,
  };
}

/**
 * Validate that every owner id is an active user in the caller's org.
 * Throws ConvexError otherwise.
 */
async function assertValidOwners(
  ctx: MutationCtx,
  ownerUserIds: Array<Id<"users">>,
  orgId: Id<"organizations">
): Promise<void> {
  for (const id of ownerUserIds) {
    const owner = await ctx.db.get(id);
    if (!owner || !owner.isActive || owner.orgId !== orgId) {
      throw new ConvexError("Invalid owner: user not found in your organization");
    }
  }
}

export const list = query({
  args: {
    location: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("house"),
        v.literal("apartment"),
        v.literal("land"),
        v.literal("commercial"),
        v.literal("other")
      )
    ),
    listingType: v.optional(v.union(v.literal("rent"), v.literal("sale"))),
    status: v.optional(
      v.union(
        v.literal("available"),
        v.literal("under_offer"),
        v.literal("let"),
        v.literal("sold"),
        v.literal("off_market")
      )
    ),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    sortBy: v.optional(
      v.union(v.literal("created_asc"), v.literal("created_desc"))
    ),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Properties are org-shared for normal agents (the sharing model depends on
    // it). Only an ADMIN who has toggled into Agent Mode narrows to the
    // properties they own or created — their "assigned properties" view.
    const restrictToOwn = user.role === "admin" && !!user.agentMode;

    const filtered = properties.filter((property) => {
      // Exclude drafts from the list
      if (property.isDraft) return false;
      if (restrictToOwn) {
        const owns =
          (property.ownerUserIds ?? []).includes(user._id) ||
          property.createdByUserId === user._id;
        if (!owns) return false;
      }
      if (args.location && !property.location.toLowerCase().includes(args.location.toLowerCase())) {
        return false;
      }
      if (args.type && property.type !== args.type) {
        return false;
      }
      if (args.listingType && property.listingType !== args.listingType) {
        return false;
      }
      if (args.status && property.status !== args.status) {
        return false;
      }
      if (args.priceMin && property.price < args.priceMin) {
        return false;
      }
      if (args.priceMax && property.price > args.priceMax) {
        return false;
      }
      if (args.q && !property.title.toLowerCase().includes(args.q.toLowerCase())) {
        return false;
      }
      if (args.ownerUserId && !(property.ownerUserIds ?? []).includes(args.ownerUserId)) {
        return false;
      }
      return true;
    });

    // Enrich with creator info
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const enriched = filtered.map((property) => {
      const creator = property.createdByUserId ? userMap.get(property.createdByUserId) : null;
      const ownerNames = (property.ownerUserIds ?? [])
        .map((id) => {
          const u = userMap.get(id);
          return u?.fullName || u?.name || u?.email || null;
        })
        .filter((n): n is string => !!n);
      return {
        ...property,
        createdByName: creator?.fullName || creator?.name || creator?.email || "System",
        ownerNames,
      };
    });

    // Optional sort by date added (only when requested, so other callers'
    // default ordering is unchanged). Applied to the full set before paging.
    if (args.sortBy === "created_asc") {
      enriched.sort((a, b) => a.createdAt - b.createdAt);
    } else if (args.sortBy === "created_desc") {
      enriched.sort((a, b) => b.createdAt - a.createdAt);
    }

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

/** Aggregates for dashboards and assistants (non-draft properties only). */
export const summaryStats = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const rows = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const props = rows.filter((p) => !p.isDraft);
    const byStatus: Record<string, number> = {};
    const byListingType: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let minP = Infinity;
    let maxP = -Infinity;
    let sum = 0;
    for (const p of props) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      byListingType[p.listingType] = (byListingType[p.listingType] ?? 0) + 1;
      byType[p.type] = (byType[p.type] ?? 0) + 1;
      if (typeof p.price === "number") {
        sum += p.price;
        minP = Math.min(minP, p.price);
        maxP = Math.max(maxP, p.price);
      }
    }
    return {
      totalListed: props.length,
      byStatus,
      byListingType,
      byType,
      price:
        props.length > 0 && minP !== Infinity && maxP !== -Infinity
          ? { min: minP, max: maxP, avg: sum / props.length }
          : null,
    };
  },
});

export const createDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const timestamp = Date.now();
    return ctx.db.insert("properties", {
      title: "Untitled Draft",
      type: "house",
      listingType: "sale",
      price: 0,
      currency: "USD",
      location: "",
      area: 0,
      status: "available",
      description: "",
      images: [],
      isDraft: true,
      // Drafts are owned by their creator; an admin can reassign on save.
      ownershipType: "agent",
      ownerUserIds: [user._id],
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const create = mutation({
  args: {
    draftId: v.optional(v.id("properties")),
    title: v.string(),
    type: v.union(
      v.literal("house"),
      v.literal("apartment"),
      v.literal("land"),
      v.literal("commercial"),
      v.literal("other")
    ),
    listingType: v.union(v.literal("rent"), v.literal("sale")),
    price: v.number(),
    currency: v.string(),
    location: v.string(),
    area: v.number(),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    commercialType: v.optional(
      v.union(
        v.literal("warehouse"),
        v.literal("office"),
        v.literal("retail_shop"),
        v.literal("industrial"),
        v.literal("mixed_use"),
        v.literal("other")
      )
    ),
    zoning: v.optional(v.string()),
    usageType: v.optional(v.string()),
    status: v.union(
      v.literal("available"),
      v.literal("under_offer"),
      v.literal("let"),
      v.literal("sold"),
      v.literal("off_market")
    ),
    description: v.string(),
    images: v.array(v.string()),
    // Admin-only ownership assignment. Agents always own what they create, so
    // this is ignored for them. An empty array means "the company" (no agent
    // owner). Omitted by agents and by the admin "company" choice.
    ownerUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (args.images.length < 2) {
      throw new Error("At least 2 property images are required");
    }
    const timestamp = Date.now();
    const { draftId, ownerUserIds, ...propertyData } = args;

    // Resolve ownership.
    //  - Agents always become the sole owner of what they create (no manual
    //    step, regardless of any ownerUserIds passed).
    //  - Admins choose: company (empty/omitted), a single agent, or multiple.
    let ownership;
    if (user.role === "admin") {
      if (ownerUserIds && ownerUserIds.length > 0) {
        await assertValidOwners(ctx, ownerUserIds, user.orgId);
      }
      ownership = normalizeOwnership(ownerUserIds);
    } else {
      ownership = normalizeOwnership([user._id]);
    }

    // If we have a draft, upgrade it to a full property
    if (draftId) {
      const draft = await ctx.db.get(draftId);
      if (draft && draft.isDraft && draft.createdByUserId === user._id) {
        await ctx.db.patch(draftId, {
          ...propertyData,
          ownershipType: ownership.ownershipType,
          ownerUserIds: ownership.ownerUserIds,
          isDraft: undefined,
          updatedAt: timestamp,
        });
        return draftId;
      }
    }

    return ctx.db.insert("properties", {
      ...propertyData,
      ownershipType: ownership.ownershipType,
      ownerUserIds: ownership.ownerUserIds,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const update = mutation({
  args: {
    propertyId: v.id("properties"),
    title: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("house"),
        v.literal("apartment"),
        v.literal("land"),
        v.literal("commercial"),
        v.literal("other")
      )
    ),
    listingType: v.optional(v.union(v.literal("rent"), v.literal("sale"))),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    location: v.optional(v.string()),
    area: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    commercialType: v.optional(
      v.union(
        v.literal("warehouse"),
        v.literal("office"),
        v.literal("retail_shop"),
        v.literal("industrial"),
        v.literal("mixed_use"),
        v.literal("other")
      )
    ),
    zoning: v.optional(v.string()),
    usageType: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("available"),
        v.literal("under_offer"),
        v.literal("let"),
        v.literal("sold"),
        v.literal("off_market")
      )
    ),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    // number sets the date; null clears it; omit to leave unchanged.
    listedOnMarketAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);

    // Allow admins or the property owner(s) to update
    if (!canManageProperty(property, user)) {
      throw new Error("You can only edit properties you own");
    }

    if (args.images !== undefined && args.images.length < 2) {
      throw new Error("At least 2 property images are required");
    }
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args)) {
      if (key === "propertyId") continue;
      // listedOnMarketAt is handled explicitly below so it can be cleared.
      if (key === "listedOnMarketAt") continue;
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    // Explicit clear: null removes the field; a number sets it; undefined leaves
    // it unchanged (the generic loop above can't express "clear to undefined").
    if (args.listedOnMarketAt !== undefined) {
      updates.listedOnMarketAt =
        args.listedOnMarketAt === null ? undefined : args.listedOnMarketAt;
    }
    await ctx.db.patch(args.propertyId, updates);
  },
});

export const deleteDraft = mutation({
  args: {
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return;
    if (!property.isDraft) return; // Only delete drafts
    if (property.createdByUserId !== user._id) return;
    await ctx.db.delete(args.propertyId);
  },
});

export const remove = mutation({
  args: {
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);

    // Allow admins or the property owner(s) to delete
    if (!canManageProperty(property, user)) {
      throw new Error("You can only delete properties you own");
    }

    // Clean up collaborator grants so no orphan rows linger.
    const collaborators = await ctx.db
      .query("propertyCollaborators")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    for (const c of collaborators) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.delete(args.propertyId);
  },
});

export const search = query({
  args: {
    q: v.optional(v.string()),
    listingType: v.optional(v.union(v.literal("rent"), v.literal("sale"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const allProperties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    let properties = args.listingType
      ? allProperties.filter((p) => p.listingType === args.listingType)
      : allProperties;

    if (args.q) {
      const search = args.q.toLowerCase();
      properties = properties.filter(
        (p) =>
          p.title.toLowerCase().includes(search) ||
          p.location.toLowerCase().includes(search)
      );
    }

    properties = properties.filter(
      (p) => p.status === "available" || p.status === "under_offer"
    );

    const limit = args.limit ?? 20;
    return properties.slice(0, limit).map((p) => ({
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

export const getById = query({
  args: {
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;
    if (property.orgId && property.orgId !== user.orgId) return null;
    const creator = property.createdByUserId ? await ctx.db.get(property.createdByUserId) : null;

    // Resolve owner display names for the (shared) listing detail.
    const owners = property.ownerUserIds ?? [];
    const ownerDocs = await Promise.all(owners.map((id) => ctx.db.get(id)));
    const ownerNames = ownerDocs
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => u.fullName || u.name || u.email || "Unknown");

    const canAccessPrivate = await canAccessPropertyPrivate(ctx, property, user);

    return {
      ...property,
      createdByName: creator?.fullName || creator?.name || creator?.email || "System",
      ownerNames,
      // UI gating flags (enforcement still happens server-side on each endpoint).
      canAccessPrivate,
      canManage: canManageProperty(property, user),
    };
  },
});

export const getPropertyDealInfo = query({
  args: {
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;
    if (property.orgId && property.orgId !== user.orgId) return null;

    // Only relevant for sold, under_offer, or let properties
    if (
      property.status !== "sold" &&
      property.status !== "under_offer" &&
      property.status !== "let"
    ) {
      return null;
    }

    // The deal counterparty (contact name, deal value, lead link) is private
    // mandate information. Non-owners/non-collaborators only see the status,
    // which is already part of the shared listing.
    const canAccessPrivate = await canAccessPropertyPrivate(ctx, property, user);
    if (!canAccessPrivate) {
      return { status: property.status };
    }

    // Check deal commissions first (for sold/let properties)
    const commissions = await ctx.db
      .query("dealCommissions")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const propertyCommission = commissions.find(
      (c) => c.propertyId === args.propertyId
    );

    if (propertyCommission) {
      const lead = await ctx.db.get(propertyCommission.leadId);
      return {
        status: property.status,
        dealValue: propertyCommission.dealValue,
        dealCurrency: propertyCommission.dealCurrency,
        contactName: lead?.fullName || "Unknown",
        leadId: propertyCommission.leadId,
      };
    }

    // Check leadPropertyMatches for under_offer (under contract) properties
    const matches = await ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    for (const match of matches) {
      if (match.propertyId === args.propertyId) {
        const lead = await ctx.db.get(match.leadId);
        if (lead && !lead.isArchived && !lead.closedAt) {
          const stage = await ctx.db.get(lead.stageId);
          if (
            stage &&
            (stage.name.toLowerCase() === "under contract" ||
              (stage.isTerminal && stage.terminalOutcome === "won"))
          ) {
            return {
              status: property.status,
              contactName: lead.fullName,
              leadId: match.leadId,
            };
          }
        }
      }
    }

    return { status: property.status };
  },
});

// =====================
// Ownership reassignment
// =====================

/**
 * Reassign a property's ownership. Admins and current owners may do this.
 * Pass an empty `ownerUserIds` to transfer ownership to the company.
 */
export const reassignOwnership = mutation({
  args: {
    propertyId: v.id("properties"),
    ownerUserIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError("Property not found");
    assertOrgAccess(property, user.orgId);

    if (!canManageProperty(property, user)) {
      throw new ConvexError("You are not authorised to reassign this property");
    }

    if (args.ownerUserIds.length > 0) {
      await assertValidOwners(ctx, args.ownerUserIds, user.orgId);
    }
    const ownership = normalizeOwnership(args.ownerUserIds);

    await ctx.db.patch(args.propertyId, {
      ownershipType: ownership.ownershipType,
      ownerUserIds: ownership.ownerUserIds,
      updatedAt: Date.now(),
    });

    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "property.ownership_reassign",
      category: "property",
      description: `Reassigned ownership of "${property.title}" to ${
        ownership.ownershipType === "company"
          ? "the company"
          : `${ownership.ownerUserIds.length} agent(s)`
      }`,
      targetType: "property",
      targetId: args.propertyId,
      targetLabel: property.title,
      metadata: {
        ownershipType: ownership.ownershipType,
        ownerUserIds: ownership.ownerUserIds,
      },
      orgId: user.orgId,
    });
  },
});

// =====================
// Collaborators
// =====================

/**
 * List the explicit collaborators on a property. Only users with private
 * access (owners, collaborators, admins) may view the collaborator list.
 */
export const listCollaborators = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return [];
    if (property.orgId && property.orgId !== user.orgId) return [];

    // Gate: don't reveal who has access unless the caller already has access.
    if (!(await canAccessPropertyPrivate(ctx, property, user))) {
      return [];
    }

    const rows = await ctx.db
      .query("propertyCollaborators")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const agent = await ctx.db.get(row.agentId);
        const grantedBy = await ctx.db.get(row.grantedByUserId);
        return {
          _id: row._id,
          agentId: row.agentId,
          agentName:
            agent?.fullName || agent?.name || agent?.email || "Unknown",
          grantedByName:
            grantedBy?.fullName ||
            grantedBy?.name ||
            grantedBy?.email ||
            "Unknown",
          grantedAt: row.grantedAt,
        };
      })
    );
    return enriched.sort((a, b) => a.grantedAt - b.grantedAt);
  },
});

/**
 * Grant an agent collaborator access to a property. Owners and admins may do
 * this. The change takes effect immediately (document access is checked live).
 */
export const addCollaborator = mutation({
  args: {
    propertyId: v.id("properties"),
    agentId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError("Property not found");
    assertOrgAccess(property, user.orgId);

    if (!canManageProperty(property, user)) {
      throw new ConvexError("You are not authorised to manage collaborators");
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent || !agent.isActive || agent.orgId !== user.orgId) {
      throw new ConvexError("Agent not found in your organization");
    }

    // No-op if the agent is already an owner.
    if ((property.ownerUserIds ?? []).some((id) => id === args.agentId)) {
      throw new ConvexError("That agent already owns this property");
    }

    // Idempotent: don't create duplicate grants.
    const existing = await ctx.db
      .query("propertyCollaborators")
      .withIndex("by_property_agent", (q) =>
        q.eq("propertyId", args.propertyId).eq("agentId", args.agentId)
      )
      .first();
    if (existing) return existing._id;

    const id = await ctx.db.insert("propertyCollaborators", {
      propertyId: args.propertyId,
      agentId: args.agentId,
      grantedByUserId: user._id,
      grantedAt: Date.now(),
      orgId: user.orgId,
    });

    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "property.collaborator_add",
      category: "property",
      description: `Granted ${
        agent.fullName || agent.name || agent.email || "an agent"
      } access to "${property.title}"`,
      targetType: "property",
      targetId: args.propertyId,
      targetLabel: property.title,
      metadata: { agentId: args.agentId },
      orgId: user.orgId,
    });

    return id;
  },
});

/**
 * Revoke an agent's collaborator access. Owners and admins may do this. Access
 * is removed immediately.
 */
export const removeCollaborator = mutation({
  args: {
    propertyId: v.id("properties"),
    agentId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError("Property not found");
    assertOrgAccess(property, user.orgId);

    if (!canManageProperty(property, user)) {
      throw new ConvexError("You are not authorised to manage collaborators");
    }

    const existing = await ctx.db
      .query("propertyCollaborators")
      .withIndex("by_property_agent", (q) =>
        q.eq("propertyId", args.propertyId).eq("agentId", args.agentId)
      )
      .first();
    if (!existing) return;

    await ctx.db.delete(existing._id);

    const agent = await ctx.db.get(args.agentId);
    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "property.collaborator_remove",
      category: "property",
      description: `Revoked ${
        agent?.fullName || agent?.name || agent?.email || "an agent"
      }'s access to "${property.title}"`,
      targetType: "property",
      targetId: args.propertyId,
      targetLabel: property.title,
      metadata: { agentId: args.agentId },
      orgId: user.orgId,
    });
  },
});
