import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

/**
 * Share a property with another agent who has a matching lead.
 * Agent A (property holder) shares with Agent B (lead holder).
 */
export const shareProperty = mutation({
  args: {
    propertyId: v.id("properties"),
    leadId: v.id("leads"),
    sharedWithUserId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);
    if (property.status === "sold" || property.status === "off_market") {
      throw new Error(
        `Cannot share a property that is ${property.status === "sold" ? "sold" : "off market"}`
      );
    }

    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.orgId && lead.orgId !== user.orgId) throw new Error("Lead not found");

    // Verify the target user exists and is in the same org
    const targetUser = await ctx.db.get(args.sharedWithUserId);
    if (!targetUser || targetUser.orgId !== user.orgId) {
      throw new Error("Target agent not found");
    }

    // Cannot share with yourself
    if (args.sharedWithUserId === user._id) {
      throw new Error("Cannot share a property with yourself");
    }

    // Check for existing active share of this property+lead combination
    const existingShares = await ctx.db
      .query("propertyShares")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    const duplicateShare = existingShares.find(
      (s) =>
        s.leadId === args.leadId &&
        s.sharedWithUserId === args.sharedWithUserId &&
        s.status === "active"
    );

    if (duplicateShare) {
      throw new Error("This property is already shared with this agent for this lead");
    }

    const timestamp = Date.now();
    return ctx.db.insert("propertyShares", {
      propertyId: args.propertyId,
      leadId: args.leadId,
      sharedByUserId: user._id,
      sharedWithUserId: args.sharedWithUserId,
      status: "active",
      notes: args.notes,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

/**
 * List all property shares relevant to the current user.
 * Admins see all shares in org, agents see shares they initiated or received.
 */
export const list = query({
  args: {
    propertyId: v.optional(v.id("properties")),
    leadId: v.optional(v.id("leads")),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("closed_won"),
        v.literal("closed_lost"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    let shares = await ctx.db
      .query("propertyShares")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Role-based filtering
    if (!isAdmin) {
      shares = shares.filter(
        (s) => s.sharedByUserId === user._id || s.sharedWithUserId === user._id
      );
    }

    // Apply filters
    if (args.propertyId) {
      shares = shares.filter((s) => s.propertyId === args.propertyId);
    }
    if (args.leadId) {
      shares = shares.filter((s) => s.leadId === args.leadId);
    }
    if (args.status) {
      shares = shares.filter((s) => s.status === args.status);
    }

    // Enrich with property, lead, and user info
    const [properties, leads, users] = await Promise.all([
      ctx.db.query("properties").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const propertyMap = new Map(properties.map((p) => [p._id, p]));
    const leadMap = new Map(leads.map((l) => [l._id, l]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return shares.map((share) => {
      const property = propertyMap.get(share.propertyId);
      const lead = leadMap.get(share.leadId);
      const sharedBy = userMap.get(share.sharedByUserId);
      const sharedWith = userMap.get(share.sharedWithUserId);

      return {
        ...share,
        propertyTitle: property?.title || "Unknown",
        propertyLocation: property?.location || "",
        propertyPrice: property?.price,
        propertyCurrency: property?.currency,
        leadName: lead?.fullName || "Unknown",
        sharedByName: sharedBy?.fullName || sharedBy?.name || sharedBy?.email || "Unknown",
        sharedWithName: sharedWith?.fullName || sharedWith?.name || sharedWith?.email || "Unknown",
      };
    });
  },
});

/**
 * Get shares for a specific property.
 */
export const listForProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const shares = await ctx.db
      .query("propertyShares")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Filter by org and role
    const filtered = shares.filter((s) => {
      if (s.orgId && s.orgId !== user.orgId) return false;
      if (user.role !== "admin" && s.sharedByUserId !== user._id && s.sharedWithUserId !== user._id) {
        return false;
      }
      return true;
    });

    // Enrich
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const enrichedShares = await Promise.all(
      filtered.map(async (share) => {
        const lead = await ctx.db.get(share.leadId);
        const sharedBy = userMap.get(share.sharedByUserId);
        const sharedWith = userMap.get(share.sharedWithUserId);
        return {
          ...share,
          leadName: lead?.fullName || "Unknown",
          sharedByName: sharedBy?.fullName || sharedBy?.name || "Unknown",
          sharedWithName: sharedWith?.fullName || sharedWith?.name || "Unknown",
        };
      })
    );

    return enrichedShares;
  },
});

/**
 * Cancel a property share (only the sharer or admins can cancel).
 */
export const cancelShare = mutation({
  args: { shareId: v.id("propertyShares") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new Error("Share not found");
    assertOrgAccess(share, user.orgId);

    if (user.role !== "admin" && share.sharedByUserId !== user._id) {
      throw new Error("Only the sharing agent or an admin can cancel a share");
    }

    if (share.status !== "active") {
      throw new Error("Only active shares can be cancelled");
    }

    await ctx.db.patch(args.shareId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the deal value on a share when closing.
 */
export const updateDealValue = mutation({
  args: {
    shareId: v.id("propertyShares"),
    dealValue: v.number(),
    dealCurrency: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new Error("Share not found");
    assertOrgAccess(share, user.orgId);

    if (share.status !== "active") {
      throw new Error("Can only update deal value on active shares");
    }

    await ctx.db.patch(args.shareId, {
      dealValue: args.dealValue,
      dealCurrency: args.dealCurrency,
      updatedAt: Date.now(),
    });
  },
});
