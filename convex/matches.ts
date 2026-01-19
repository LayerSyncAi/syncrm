import { mutation, query } from "convex/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";

async function canAccessLead(ctx: any, leadId: any, userId: any, isAdmin: boolean) {
  const lead = await ctx.db.get(leadId);
  if (!lead) return null;
  if (!isAdmin && lead.ownerUserId !== userId) {
    return null;
  }
  return lead;
}

export const attachPropertyToLead = mutation({
  args: {
    leadId: v.id("leads"),
    propertyId: v.id("properties"),
    matchType: v.union(
      v.literal("suggested"),
      v.literal("requested"),
      v.literal("viewed"),
      v.literal("offered")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) throw new Error("Lead not found");
    return ctx.db.insert("leadPropertyMatches", {
      leadId: args.leadId,
      propertyId: args.propertyId,
      matchType: args.matchType,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const listForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) throw new Error("Lead not found");
    return ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
  },
});

export const detach = mutation({
  args: { matchId: v.id("leadPropertyMatches") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    const lead = await canAccessLead(ctx, match.leadId, user._id, user.role === "admin");
    if (!lead) throw new Error("Lead not found");
    await ctx.db.delete(args.matchId);
  },
});
