import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin } from "./helpers";

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
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    const properties = await ctx.db.query("properties").collect();
    return properties.filter((property) => {
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
  },
});

export const create = mutation({
  args: {
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
    status: v.union(
      v.literal("available"),
      v.literal("under_offer"),
      v.literal("let"),
      v.literal("sold"),
      v.literal("off_market")
    ),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const timestamp = Date.now();
    return ctx.db.insert("properties", {
      ...args,
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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
