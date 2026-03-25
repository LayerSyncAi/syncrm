import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";

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
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const filtered = properties.filter((property) => {
      // Exclude drafts from the list
      if (property.isDraft) return false;
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
      return {
        ...property,
        createdByName: creator?.fullName || creator?.name || creator?.email || "System",
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
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (args.images.length < 2) {
      throw new Error("At least 2 property images are required");
    }
    const timestamp = Date.now();
    const { draftId, ...propertyData } = args;

    // If we have a draft, upgrade it to a full property
    if (draftId) {
      const draft = await ctx.db.get(draftId);
      if (draft && draft.isDraft && draft.createdByUserId === user._id) {
        await ctx.db.patch(draftId, {
          ...propertyData,
          isDraft: undefined,
          updatedAt: timestamp,
        });
        return draftId;
      }
    }

    return ctx.db.insert("properties", {
      ...propertyData,
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
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);

    // Allow admins or the property creator to update
    if (user.role !== "admin" && property.createdByUserId !== user._id) {
      throw new Error("You can only edit properties you created");
    }

    if (args.images !== undefined && args.images.length < 2) {
      throw new Error("At least 2 property images are required");
    }
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args)) {
      if (key === "propertyId") continue;
      if (value !== undefined) {
        updates[key] = value;
      }
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

    // Allow admins or the property creator to delete
    if (user.role !== "admin" && property.createdByUserId !== user._id) {
      throw new Error("You can only delete properties you created");
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
    return {
      ...property,
      createdByName: creator?.fullName || creator?.name || creator?.email || "System",
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
