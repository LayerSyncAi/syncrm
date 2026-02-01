import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./helpers";

const defaultStages = [
  {
    name: "New Lead",
    description: "The lead just entered your system. No contact has been made yet.",
    action: "Call, text, or email immediately. First response time matters.",
    order: 1,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Contacted",
    description: "You have reached out and had some form of communication, even if it was a voicemail.",
    action: "Attempt further contact or set a short-term follow-up.",
    order: 2,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Qualified",
    description: "The seller has motivation, a timeline, and realistic expectations. You now know this is worth pursuing.",
    action: "Schedule an appointment or prepare to make an offer.",
    order: 3,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Follow-Up",
    description: "The lead is not ready but could convert with time. They are not cold, just not immediate.",
    action: "Enroll in a drip campaign or set manual reminders.",
    order: 4,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Offer Made",
    description: "An offer has been submitted, and you are waiting for a response or counter.",
    action: "Track all communication and follow up aggressively.",
    order: 5,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Under Contract",
    description: "The seller accepted your offer. The property is in escrow or being prepared for assignment.",
    action: "Coordinate with the title company or buyer rep.",
    order: 6,
    isTerminal: false,
    terminalOutcome: null,
  },
  {
    name: "Closed",
    description: "The deal is done. You received your assignment fee or resale proceeds.",
    action: "Tag the lead as won. Request testimonials or referrals.",
    order: 7,
    isTerminal: true,
    terminalOutcome: "won" as const,
  },
  {
    name: "Lost",
    description: "The lead did not convert. They chose another option or are no longer interested.",
    action: "Log the reason and consider re-engaging in the future.",
    order: 8,
    isTerminal: true,
    terminalOutcome: "lost" as const,
  },
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

// Force re-seed stages (admin only) - useful for updating existing stages
export const adminReseedStages = mutation({
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Delete all existing stages
    const existingStages = await ctx.db.query("pipelineStages").collect();
    for (const stage of existingStages) {
      await ctx.db.delete(stage._id);
    }

    // Insert new defaults
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
    await requireAdmin(ctx);
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
    await requireAdmin(ctx);
    const timestamp = Date.now();
    for (const [index, stageId] of args.orderedStageIds.entries()) {
      await ctx.db.patch(stageId, { order: index + 1, updatedAt: timestamp });
    }
  },
});
