import { mutation, query } from "./_generated/server";
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
      status: "todo",
      completionNotes: undefined,
      assignedToUserId: assignedTo,
      createdByUserId: user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) throw new Error("Lead not found");
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    // Sort by createdAt descending (most recent first)
    return activities.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listUpcomingForMe = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return ctx.db
      .query("activities")
      .withIndex("by_assignee_status", (q) =>
        q.eq("assignedToUserId", user._id)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("completedAt"), undefined),
          q.neq(q.field("scheduledAt"), undefined)
        )
      )
      .collect();
  },
});

// List all tasks/activities with filters for the Tasks page
export const listAllTasks = query({
  args: {
    status: v.optional(v.union(v.literal("todo"), v.literal("completed"), v.literal("all"))),
    type: v.optional(v.union(
      v.literal("call"),
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("viewing"),
      v.literal("note"),
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const isAdmin = user.role === "admin";
    const statusFilter = args.status && args.status !== "all" ? args.status : null;
    const typeFilter = args.type && args.type !== "all" ? args.type : null;

    // Use the most selective index available
    let activities;

    if (!isAdmin) {
      // Non-admin: use assignee index (most selective - only their tasks)
      activities = await ctx.db
        .query("activities")
        .withIndex("by_assignee_status", (q) => q.eq("assignedToUserId", user._id))
        .collect();
    } else if (statusFilter) {
      // Admin with status filter: use status index
      activities = await ctx.db
        .query("activities")
        .withIndex("by_status", (q) => q.eq("status", statusFilter))
        .collect();
    } else if (typeFilter) {
      // Admin with type filter: use type index
      activities = await ctx.db
        .query("activities")
        .withIndex("by_type", (q) => q.eq("type", typeFilter))
        .collect();
    } else {
      activities = await ctx.db.query("activities").collect();
    }

    // Apply remaining filters in memory on the already-narrowed set
    let filtered = activities;
    if (statusFilter && !isAdmin) {
      // Non-admin used assignee index - still need status filter
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (typeFilter && (!isAdmin || statusFilter)) {
      // Need type filter if we didn't use type index
      filtered = filtered.filter(a => a.type === typeFilter);
    }

    // Batch fetch leads and users instead of N+1 queries
    const leadIds = [...new Set(filtered.map(a => a.leadId))];
    const userIds = [...new Set(filtered.map(a => a.assignedToUserId))];

    const [leadDocs, userDocs] = await Promise.all([
      Promise.all(leadIds.map(id => ctx.db.get(id))),
      Promise.all(userIds.map(id => ctx.db.get(id))),
    ]);

    const leadMap = new Map(leadDocs.filter(Boolean).map(l => [l!._id, l!]));
    const userMap = new Map(userDocs.filter(Boolean).map(u => [u!._id, u!]));

    const enrichedActivities = filtered.map((activity) => {
      const lead = leadMap.get(activity.leadId);
      const assignedTo = userMap.get(activity.assignedToUserId);
      return {
        ...activity,
        lead: lead ? { _id: lead._id, fullName: lead.fullName, phone: lead.phone } : null,
        assignedTo: assignedTo ? {
          _id: assignedTo._id,
          fullName: assignedTo.fullName,
          name: assignedTo.name,
          email: assignedTo.email
        } : null,
      };
    });

    // Sort by scheduledAt (if exists) or createdAt descending
    return enrichedActivities.sort((a, b) => {
      const aDate = a.scheduledAt || a.createdAt;
      const bDate = b.scheduledAt || b.createdAt;
      return bDate - aDate;
    });
  },
});

// Get a single activity by ID with full details
export const getById = query({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) return null;

    // Parallel fetch lead, assignedTo, createdBy
    const [lead, assignedTo, createdBy] = await Promise.all([
      ctx.db.get(activity.leadId),
      ctx.db.get(activity.assignedToUserId),
      ctx.db.get(activity.createdByUserId),
    ]);

    if (!lead) return null;
    if (user.role !== "admin" && lead.ownerUserId !== user._id && activity.assignedToUserId !== user._id) {
      return null;
    }

    return {
      ...activity,
      lead: { _id: lead._id, fullName: lead.fullName, phone: lead.phone, email: lead.email },
      assignedTo: assignedTo ? {
        _id: assignedTo._id,
        fullName: assignedTo.fullName,
        name: assignedTo.name,
        email: assignedTo.email
      } : null,
      createdBy: createdBy ? {
        _id: createdBy._id,
        fullName: createdBy.fullName,
        name: createdBy.name,
        email: createdBy.email
      } : null,
    };
  },
});

// Update an activity
export const update = mutation({
  args: {
    activityId: v.id("activities"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    type: v.optional(v.union(
      v.literal("call"),
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("viewing"),
      v.literal("note")
    )),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");

    // Check access
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.scheduledAt !== undefined) updates.scheduledAt = args.scheduledAt;
    if (args.type !== undefined) updates.type = args.type;

    await ctx.db.patch(args.activityId, updates);
  },
});

// Mark activity as complete with required completion notes
export const markComplete = mutation({
  args: {
    activityId: v.id("activities"),
    completionNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }
    if (!args.completionNotes.trim()) {
      throw new Error("Completion notes are required");
    }
    await ctx.db.patch(args.activityId, {
      completedAt: Date.now(),
      status: "completed",
      completionNotes: args.completionNotes.trim(),
      updatedAt: Date.now(),
    });
  },
});

// Reopen a completed activity (change status back to todo)
export const reopen = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.patch(args.activityId, {
      completedAt: undefined,
      status: "todo",
      updatedAt: Date.now(),
    });
  },
});

// Delete an activity
export const remove = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    if (user.role !== "admin" && activity.createdByUserId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.activityId);
  },
});
