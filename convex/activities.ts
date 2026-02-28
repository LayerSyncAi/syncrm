import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

async function canAccessLead(ctx: any, leadId: any, userId: any, isAdmin: boolean, userOrgId: Id<"organizations">) {
  const lead = await ctx.db.get(leadId);
  if (!lead) return null;
  if (lead.orgId && lead.orgId !== userOrgId) return null;
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
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    const assignedTo = args.assignedToUserId ?? lead.ownerUserId;
    const now = Date.now();

    // Compute nextReminderAt: 1 hour before scheduledAt (for pre-reminder cron)
    const nextReminderAt = args.scheduledAt
      ? args.scheduledAt - 60 * 60 * 1000
      : undefined;

    const activityId = await ctx.db.insert("activities", {
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
      nextReminderAt,
      orgId: user.orgId,
      createdAt: now,
      updatedAt: now,
    });

    // Update denormalized fields on lead
    await ctx.db.patch(args.leadId, {
      lastActivityAt: now,
      activityCount: (lead.activityCount ?? 0) + 1,
      updatedAt: now,
    });

    return activityId;
  },
});

export const listForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    return activities.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listUpcomingForMe = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
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
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";
    const statusFilter = args.status && args.status !== "all" ? args.status : null;
    const typeFilter = args.type && args.type !== "all" ? args.type : null;

    // Scope by org
    let activities = await ctx.db
      .query("activities")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Non-admin: only their tasks
    if (!isAdmin) {
      activities = activities.filter(a => a.assignedToUserId === user._id);
    }

    // Apply filters
    let filtered = activities;
    if (statusFilter) {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (typeFilter) {
      filtered = filtered.filter(a => a.type === typeFilter);
    }

    // Batch fetch leads and users
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

    return enrichedActivities.sort((a, b) => {
      const aDate = a.scheduledAt || a.createdAt;
      const bDate = b.scheduledAt || b.createdAt;
      return bDate - aDate;
    });
  },
});

export const getById = query({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) return null;
    if (activity.orgId && activity.orgId !== user.orgId) return null;

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
    const user = await getCurrentUserWithOrg(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    assertOrgAccess(activity, user.orgId);

    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.scheduledAt !== undefined) {
      updates.scheduledAt = args.scheduledAt;
      // Recompute nextReminderAt when schedule changes
      updates.nextReminderAt = args.scheduledAt
        ? args.scheduledAt - 60 * 60 * 1000
        : undefined;
    }
    if (args.type !== undefined) updates.type = args.type;

    await ctx.db.patch(args.activityId, updates);
  },
});

export const markComplete = mutation({
  args: {
    activityId: v.id("activities"),
    completionNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    assertOrgAccess(activity, user.orgId);
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }
    if (!args.completionNotes.trim()) {
      throw new Error("Completion notes are required");
    }
    const now = Date.now();
    await ctx.db.patch(args.activityId, {
      completedAt: now,
      status: "completed",
      completionNotes: args.completionNotes.trim(),
      nextReminderAt: undefined, // No more reminders needed
      updatedAt: now,
    });

    // Update denormalized lastActivityAt on lead
    await ctx.db.patch(activity.leadId, {
      lastActivityAt: now,
      updatedAt: now,
    });
  },
});

export const reopen = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    assertOrgAccess(activity, user.orgId);
    if (user.role !== "admin" && activity.assignedToUserId !== user._id) {
      throw new Error("Not allowed");
    }
    // Restore nextReminderAt if the activity has a future schedule
    const nextReminderAt = activity.scheduledAt && activity.scheduledAt > Date.now()
      ? activity.scheduledAt - 60 * 60 * 1000
      : undefined;
    await ctx.db.patch(args.activityId, {
      completedAt: undefined,
      status: "todo",
      nextReminderAt,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    assertOrgAccess(activity, user.orgId);
    if (user.role !== "admin" && activity.createdByUserId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.activityId);

    // Decrement denormalized activityCount on lead
    const lead = await ctx.db.get(activity.leadId);
    if (lead) {
      await ctx.db.patch(activity.leadId, {
        activityCount: Math.max(0, (lead.activityCount ?? 1) - 1),
        updatedAt: Date.now(),
      });
    }
  },
});
