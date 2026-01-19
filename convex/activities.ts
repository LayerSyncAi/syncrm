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

export const createForLead = mutation({
  args: {
    leadId: v.id("leads"),
    type: v.union(
      v.literal("call"),
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("viewing"),
      v.literal("note")
    ),
    title: v.string(),
    description: v.string(),
    scheduledAt: v.optional(v.number()),
    assignedToUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) throw new Error("Lead not found");
    const assignedTo = args.assignedToUserId ?? lead.ownerUserId;
    return ctx.db.insert("activities", {
      leadId: args.leadId,
      type: args.type,
      title: args.title,
      description: args.description,
      scheduledAt: args.scheduledAt,
      completedAt: undefined,
      assignedToUserId: assignedTo,
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
      .query("activities")
      .filter((q) => q.eq(q.field("leadId"), args.leadId))
      .collect();
  },
});

export const listUpcomingForMe = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return ctx.db
      .query("activities")
      .withIndex("by_assignee_status", (q) =>
        q.eq("assignedToUserId", user._id).eq("completedAt", undefined)
      )
      .filter((q) => q.neq(q.field("scheduledAt"), undefined))
      .collect();
  },
});

export const markComplete = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.patch(args.activityId, { completedAt: Date.now() });
  },
});
