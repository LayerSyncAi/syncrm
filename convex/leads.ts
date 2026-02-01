import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";

const leadArgs = {
  fullName: v.string(),
  phone: v.string(),
  email: v.optional(v.string()),
  source: v.union(
    v.literal("walk_in"),
    v.literal("referral"),
    v.literal("facebook"),
    v.literal("whatsapp"),
    v.literal("website"),
    v.literal("property_portal"),
    v.literal("other")
  ),
  interestType: v.union(v.literal("rent"), v.literal("buy")),
  budgetCurrency: v.optional(v.string()),
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  preferredAreas: v.array(v.string()),
  notes: v.string(),
  stageId: v.id("pipelineStages"),
  ownerUserId: v.optional(v.id("users")),
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function assertLeadAccess(ctx: any, leadId: any, userId: any, isAdmin: boolean) {
  const lead = await ctx.db.get(leadId);
  if (!lead) {
    return null;
  }
  if (!isAdmin && lead.ownerUserId !== userId) {
    return null;
  }
  return lead;
}

export const create = mutation({
  args: leadArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const timestamp = Date.now();
    const ownerId = user.role === "admin" && args.ownerUserId
      ? args.ownerUserId
      : user._id;
    return ctx.db.insert("leads", {
      fullName: args.fullName,
      phone: args.phone,
      normalizedPhone: normalizePhone(args.phone),
      email: args.email,
      source: args.source,
      interestType: args.interestType,
      budgetCurrency: args.budgetCurrency,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      preferredAreas: args.preferredAreas,
      notes: args.notes,
      stageId: args.stageId,
      ownerUserId: ownerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const list = query({
  args: {
    stageId: v.optional(v.id("pipelineStages")),
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    preferredAreaKeyword: v.optional(v.string()),
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const results = await ctx.db.query("leads").collect();

    // Get all stages and users for joining
    const stages = await ctx.db.query("pipelineStages").collect();
    const users = await ctx.db.query("users").collect();
    const stageMap = new Map(stages.map((s) => [s._id, s]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    const filtered = results.filter((lead) => {
      if (user.role !== "admin" && lead.ownerUserId !== user._id) {
        return false;
      }
      if (user.role === "admin" && args.ownerUserId && lead.ownerUserId !== args.ownerUserId) {
        return false;
      }
      if (args.stageId && lead.stageId !== args.stageId) {
        return false;
      }
      if (args.interestType && lead.interestType !== args.interestType) {
        return false;
      }
      if (args.preferredAreaKeyword) {
        const match = lead.preferredAreas.some((area) =>
          area.toLowerCase().includes(args.preferredAreaKeyword!.toLowerCase())
        );
        if (!match) return false;
      }
      if (args.q) {
        const search = args.q.toLowerCase();
        if (
          !lead.fullName.toLowerCase().includes(search) &&
          !lead.phone.includes(search)
        ) {
          return false;
        }
      }
      return true;
    });

    // Enrich leads with owner and stage names
    return filtered.map((lead) => {
      const owner = userMap.get(lead.ownerUserId);
      const stage = stageMap.get(lead.stageId);
      return {
        ...lead,
        ownerName: owner?.fullName || owner?.name || owner?.email || "Unknown",
        stageName: stage?.name || "Unknown",
        stageOrder: stage?.order ?? 0,
      };
    });
  },
});

export const getById = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) {
      return null;
    }
    const stage = await ctx.db.get(lead.stageId);
    const owner = await ctx.db.get(lead.ownerUserId);
    return { lead, stage, owner };
  },
});

export const update = mutation({
  args: {
    leadId: v.id("leads"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    source: v.optional(
      v.union(
        v.literal("walk_in"),
        v.literal("referral"),
        v.literal("facebook"),
        v.literal("whatsapp"),
        v.literal("website"),
        v.literal("property_portal"),
        v.literal("other")
      )
    ),
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preferredAreas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) {
      throw new Error("Lead not found");
    }
    const updated: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.fullName) updated.fullName = args.fullName;
    if (args.phone) {
      updated.phone = args.phone;
      updated.normalizedPhone = normalizePhone(args.phone);
    }
    if (args.email !== undefined) updated.email = args.email;
    if (args.source) updated.source = args.source;
    if (args.interestType) updated.interestType = args.interestType;
    if (args.budgetMin !== undefined) updated.budgetMin = args.budgetMin;
    if (args.budgetMax !== undefined) updated.budgetMax = args.budgetMax;
    if (args.preferredAreas) updated.preferredAreas = args.preferredAreas;
    await ctx.db.patch(args.leadId, updated);
  },
});

export const moveStage = mutation({
  args: {
    leadId: v.id("leads"),
    stageId: v.id("pipelineStages"),
    closeReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) {
      throw new Error("Lead not found");
    }
    const stage = await ctx.db.get(args.stageId);
    if (!stage) {
      throw new Error("Stage not found");
    }
    const updated: Record<string, unknown> = {
      stageId: args.stageId,
      updatedAt: Date.now(),
    };
    if (stage.isTerminal) {
      updated.closedAt = Date.now();
      updated.closeReason = args.closeReason ?? "";
    }
    await ctx.db.patch(args.leadId, updated);
  },
});

export const updateNotes = mutation({
  args: { leadId: v.id("leads"), notes: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin");
    if (!lead) {
      throw new Error("Lead not found");
    }
    await ctx.db.patch(args.leadId, { notes: args.notes, updatedAt: Date.now() });
  },
});

export const statsSummary = query({
  args: { ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const leads = await ctx.db.query("leads").collect();
    const scoped = leads.filter((lead) => {
      if (user.role !== "admin") {
        return lead.ownerUserId === user._id;
      }
      if (args.ownerUserId) {
        return lead.ownerUserId === args.ownerUserId;
      }
      return true;
    });
    return {
      total: scoped.length,
      open: scoped.filter((lead) => !lead.closedAt).length,
      won: scoped.filter((lead) => lead.closeReason && lead.closeReason !== "" && lead.closedAt).length,
    };
  },
});

export const dashboardStats = query({
  args: { ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const leads = await ctx.db.query("leads").collect();
    const stages = await ctx.db.query("pipelineStages").withIndex("by_order").collect();

    // Filter leads based on user role
    const scoped = leads.filter((lead) => {
      if (user.role !== "admin") {
        return lead.ownerUserId === user._id;
      }
      if (args.ownerUserId) {
        return lead.ownerUserId === args.ownerUserId;
      }
      return true;
    });

    // Time calculations
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    // Calculate stats
    const newThisWeek = scoped.filter((lead) => lead.createdAt >= oneWeekAgo).length;
    const openLeads = scoped.filter((lead) => !lead.closedAt).length;

    // Get terminal stages to identify won/lost
    const wonStage = stages.find((s) => s.terminalOutcome === "won");
    const lostStage = stages.find((s) => s.terminalOutcome === "lost");

    const wonThisMonth = scoped.filter((lead) =>
      lead.closedAt &&
      lead.closedAt >= startOfMonthMs &&
      wonStage &&
      lead.stageId === wonStage._id
    ).length;

    const lostThisMonth = scoped.filter((lead) =>
      lead.closedAt &&
      lead.closedAt >= startOfMonthMs &&
      lostStage &&
      lead.stageId === lostStage._id
    ).length;

    // Calculate stage breakdown (non-terminal stages only for pipeline view)
    const nonTerminalStages = stages.filter((s) => !s.isTerminal);
    const stageCounts = nonTerminalStages.map((stage) => {
      const count = scoped.filter((lead) => lead.stageId === stage._id && !lead.closedAt).length;
      return {
        id: stage._id,
        name: stage.name,
        count,
        order: stage.order,
      };
    });

    // Calculate percentages based on total open leads
    const totalOpenForStages = stageCounts.reduce((sum, s) => sum + s.count, 0);
    const stageBreakdown = stageCounts.map((stage) => ({
      ...stage,
      percent: totalOpenForStages > 0 ? stage.count / totalOpenForStages : 0,
    }));

    // Calculate monthly progress (won / (won + lost) this month, or won / total closed)
    const closedThisMonth = wonThisMonth + lostThisMonth;
    const monthlyProgress = closedThisMonth > 0
      ? Math.round((wonThisMonth / closedThisMonth) * 100)
      : 0;

    return {
      stats: {
        newThisWeek,
        openLeads,
        wonThisMonth,
        lostThisMonth,
      },
      stageBreakdown,
      monthlyProgress,
    };
  },
});
