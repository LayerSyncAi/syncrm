import { mutation, query } from "convex/server";
import { v } from "convex/values";
import { requireAdmin } from "./helpers";

const defaultStages = [
  { name: "Prospect", order: 1, isTerminal: false, terminalOutcome: null },
  { name: "Contacted", order: 2, isTerminal: false, terminalOutcome: null },
  { name: "Viewing Scheduled", order: 3, isTerminal: false, terminalOutcome: null },
  { name: "Negotiation", order: 4, isTerminal: false, terminalOutcome: null },
  { name: "Closed Won", order: 5, isTerminal: true, terminalOutcome: "won" as const },
  { name: "Closed Lost", order: 6, isTerminal: true, terminalOutcome: "lost" as const },
];

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("pipelineStages").withIndex("by_order").collect();
  },
});

export const seedDefaultsIfEmpty = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("pipelineStages").first();
    if (existing) return;
    const timestamp = Date.now();
    for (const stage of defaultStages) {
      await ctx.db.insert("pipelineStages", {
        ...stage,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  },
});

export const adminCreate = mutation({
  args: {
    name: v.string(),
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const timestamp = Date.now();
    return ctx.db.insert("pipelineStages", {
      ...args,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const adminUpdate = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    name: v.string(),
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.stageId, {
      name: args.name,
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
    await requireAdmin(ctx);
    const timestamp = Date.now();
    for (const [index, stageId] of args.orderedStageIds.entries()) {
      await ctx.db.patch(stageId, { order: index + 1, updatedAt: timestamp });
    }
  },
});
