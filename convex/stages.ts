import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { insertDefaultStages, seedDefaultStages } from "./lib/orgDefaults";

// Normalize an optional win-probability into the 0–100 range (undefined stays undefined).
function clampProbability(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

export const list = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return stages.sort((a, b) => a.order - b.order);
  },
});

export const seedDefaultsIfEmpty = mutation({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    await seedDefaultStages(ctx, user.orgId);
  },
});

export const adminReseedStages = mutation({
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);

    // Delete all existing stages for this org
    const existingStages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    for (const stage of existingStages) {
      await ctx.db.delete(stage._id);
    }

    await insertDefaultStages(ctx, user.orgId);
  },
});

export const adminCreate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    action: v.optional(v.string()),
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
    winProbability: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const timestamp = Date.now();
    return ctx.db.insert("pipelineStages", {
      ...args,
      winProbability: clampProbability(args.winProbability),
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const adminUpdate = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    name: v.string(),
    description: v.optional(v.string()),
    action: v.optional(v.string()),
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
    winProbability: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    assertOrgAccess(stage, user.orgId);

    await ctx.db.patch(args.stageId, {
      name: args.name,
      description: args.description,
      action: args.action,
      order: args.order,
      isTerminal: args.isTerminal,
      terminalOutcome: args.terminalOutcome,
      winProbability: clampProbability(args.winProbability),
      updatedAt: Date.now(),
    });
  },
});

export const adminReorder = mutation({
  args: {
    orderedStageIds: v.array(v.id("pipelineStages")),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const timestamp = Date.now();
    for (const [index, stageId] of args.orderedStageIds.entries()) {
      const stage = await ctx.db.get(stageId);
      if (stage) {
        assertOrgAccess(stage, user.orgId);
      }
      await ctx.db.patch(stageId, { order: index + 1, updatedAt: timestamp });
    }
  },
});

export const adminDelete = mutation({
  args: {
    stageId: v.id("pipelineStages"),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    assertOrgAccess(stage, user.orgId);

    // Check if any leads are using this stage
    const leadsWithStage = await ctx.db
      .query("leads")
      .withIndex("by_stage", (q) => q.eq("stageId", args.stageId))
      .first();

    if (leadsWithStage) {
      throw new Error("Cannot delete stage: leads are still assigned to it");
    }

    await ctx.db.delete(args.stageId);
  },
});
