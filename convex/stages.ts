import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, getCurrentUserWithOrg, assertOrgAccess } from "./helpers";

const defaultStages = [
  {
    name: "New Lead",
    description: "Just entered system, no contact made",
    action: "Call/text/email immediately",
    order: 1,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Contacted",
    description: "Had some communication",
    action: "Attempt further contact",
    order: 2,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Qualified",
    description: "Has motivation, timeline, expectations",
    action: "Schedule appointment or offer",
    order: 3,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Follow-Up",
    description: "Not ready but could convert",
    action: "Drip campaign or reminders",
    order: 4,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Offer Made",
    description: "Waiting for response/counter",
    action: "Track and follow up",
    order: 5,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Under Contract",
    description: "Accepted, in escrow",
    action: "Coordinate with title company",
    order: 6,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Closed",
    description: "Deal done",
    action: "Request testimonials",
    order: 7,
    isTerminal: true,
    terminalOutcome: "won" as const,
  },
  {
    name: "Lost",
    description: "Did not convert",
    action: "Log reason, consider re-engaging",
    order: 8,
    isTerminal: true,
    terminalOutcome: "lost" as const,
  },
];

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
    // Check if org already has stages
    const existing = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .first();
    if (existing) return;

    const timestamp = Date.now();
    for (const stage of defaultStages) {
      await ctx.db.insert("pipelineStages", {
        ...stage,
        orgId: user.orgId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
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

    const timestamp = Date.now();
    for (const stage of defaultStages) {
      await ctx.db.insert("pipelineStages", {
        ...stage,
        orgId: user.orgId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
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
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const timestamp = Date.now();
    return ctx.db.insert("pipelineStages", {
      ...args,
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
