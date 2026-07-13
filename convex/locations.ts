import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { CURATED_AREA_NAMES, canonicalizeArea } from "./lib/locations";

// Curated default areas from the configured white-label seed (empty upstream;
// see convex/lib/areaSeed.ts). syncDefaults tops up orgs from this list.
const defaultLocations = CURATED_AREA_NAMES;

export const list = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return locations.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    // Canonicalize so hand-typed variants (e.g. "Mt Pleasant") are stored
    // under the official name and stay matchable.
    const trimmedName = canonicalizeArea(args.name);

    if (!trimmedName) {
      throw new Error("Location name cannot be empty");
    }

    // Check for duplicates within org (case-insensitive)
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const duplicate = existing.find(
      (loc) => loc.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw new Error("A location with this name already exists");
    }

    return ctx.db.insert("locations", {
      name: trimmedName,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const trimmedName = args.name.trim();

    if (!trimmedName) {
      throw new Error("Location name cannot be empty");
    }

    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }
    assertOrgAccess(location, user.orgId);

    // Check for duplicates within org, excluding current location
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const duplicate = existing.find(
      (loc) =>
        loc._id !== args.locationId &&
        loc.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw new Error("A location with this name already exists");
    }

    await ctx.db.patch(args.locationId, { name: trimmedName });
  },
});

export const remove = mutation({
  args: { locationId: v.id("locations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }
    assertOrgAccess(location, user.orgId);
    await ctx.db.delete(args.locationId);
  },
});

export const seedDefaultsIfEmpty = mutation({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    // Check if org already has locations
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .first();
    if (existing) return;

    const timestamp = Date.now();
    for (const name of defaultLocations) {
      await ctx.db.insert("locations", {
        name,
        createdByUserId: user._id,
        orgId: user.orgId,
        createdAt: timestamp,
      });
    }
  },
});

/**
 * Idempotently add any curated default areas that an org is missing.
 * Unlike `seedDefaultsIfEmpty`, this also tops up orgs that were seeded from
 * the older, smaller dataset, so previously-missing suburbs become available
 * without disturbing user-added locations. Returns the number inserted.
 */
export const syncDefaults = mutation({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const existingNames = new Set(
      existing.map((loc) => loc.name.trim().toLowerCase())
    );

    const timestamp = Date.now();
    let inserted = 0;
    for (const name of defaultLocations) {
      if (existingNames.has(name.toLowerCase())) continue;
      await ctx.db.insert("locations", {
        name,
        createdByUserId: user._id,
        orgId: user.orgId,
        createdAt: timestamp,
      });
      existingNames.add(name.toLowerCase());
      inserted++;
    }
    return { inserted };
  },
});
