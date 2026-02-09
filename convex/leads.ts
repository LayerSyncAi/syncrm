import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

const leadArgs = {
  contactId: v.id("contacts"),
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

async function assertLeadAccess(ctx: any, leadId: any, userId: any, isAdmin: boolean, userOrgId: Id<"organizations">) {
  const lead = await ctx.db.get(leadId);
  if (!lead) {
    return null;
  }
  // Check org access
  if (lead.orgId && lead.orgId !== userOrgId) {
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
    const user = await getCurrentUserWithOrg(ctx);

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
    assertOrgAccess(contact, user.orgId);

    if (user.role !== "admin" && !contact.ownerUserIds.includes(user._id)) {
      throw new Error("You don't have access to this contact");
    }

    const timestamp = Date.now();
    const ownerId = user.role === "admin" && args.ownerUserId
      ? args.ownerUserId
      : user._id;

    return ctx.db.insert("leads", {
      contactId: args.contactId,
      fullName: contact.name,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      email: contact.email,
      source: args.source,
      interestType: args.interestType,
      budgetCurrency: args.budgetCurrency,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      preferredAreas: args.preferredAreas,
      notes: args.notes,
      stageId: args.stageId,
      ownerUserId: ownerId,
      orgId: user.orgId,
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
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    // Always scope by org first
    let results = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Apply role-based filtering
    if (!isAdmin) {
      results = results.filter((lead) => lead.ownerUserId === user._id);
    } else if (args.ownerUserId) {
      results = results.filter((lead) => lead.ownerUserId === args.ownerUserId);
    }

    // Apply remaining filters in memory
    const filtered = results.filter((lead) => {
      if (lead.isArchived) return false;
      if (args.stageId && lead.stageId !== args.stageId) {
        return false;
      }
      if (args.interestType && lead.interestType !== args.interestType) {
        return false;
      }
      if (args.preferredAreaKeyword) {
        const keyword = args.preferredAreaKeyword.toLowerCase();
        const match = lead.preferredAreas.some((area) =>
          area.toLowerCase().includes(keyword)
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

    // Batch fetch stages and users for enrichment (scoped to org)
    const [stages, users] = await Promise.all([
      ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);
    const stageMap = new Map(stages.map((s) => [s._id, s]));
    const userMap = new Map(users.map((u) => [u._id, u]));

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
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) {
      return null;
    }
    const [stage, owner] = await Promise.all([
      ctx.db.get(lead.stageId),
      ctx.db.get(lead.ownerUserId),
    ]);
    return { lead, stage, owner };
  },
});

export const update = mutation({
  args: {
    leadId: v.id("leads"),
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
    budgetCurrency: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preferredAreas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) {
      throw new Error("Lead not found");
    }
    const updated: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.source) updated.source = args.source;
    if (args.interestType) updated.interestType = args.interestType;
    if (args.budgetCurrency !== undefined) updated.budgetCurrency = args.budgetCurrency;
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
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) {
      throw new Error("Lead not found");
    }
    const stage = await ctx.db.get(args.stageId);
    if (!stage) {
      throw new Error("Stage not found");
    }
    assertOrgAccess(stage, user.orgId);

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
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) {
      throw new Error("Lead not found");
    }
    await ctx.db.patch(args.leadId, { notes: args.notes, updatedAt: Date.now() });
  },
});

export const createWithProperties = mutation({
  args: {
    ...leadArgs,
    propertyIds: v.optional(v.array(v.id("properties"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
    assertOrgAccess(contact, user.orgId);

    if (user.role !== "admin" && !contact.ownerUserIds.includes(user._id)) {
      throw new Error("You don't have access to this contact");
    }

    const timestamp = Date.now();
    const ownerId =
      user.role === "admin" && args.ownerUserId ? args.ownerUserId : user._id;

    const leadId = await ctx.db.insert("leads", {
      contactId: args.contactId,
      fullName: contact.name,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      email: contact.email,
      source: args.source,
      interestType: args.interestType,
      budgetCurrency: args.budgetCurrency,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      preferredAreas: args.preferredAreas,
      notes: args.notes,
      stageId: args.stageId,
      ownerUserId: ownerId,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (args.propertyIds && args.propertyIds.length > 0) {
      for (const propertyId of args.propertyIds) {
        const property = await ctx.db.get(propertyId);
        if (!property) continue;
        assertOrgAccess(property, user.orgId);
        await ctx.db.insert("leadPropertyMatches", {
          leadId,
          propertyId,
          matchType: "requested",
          createdByUserId: user._id,
          orgId: user.orgId,
          createdAt: timestamp,
        });
      }
    }

    return leadId;
  },
});

export const statsSummary = query({
  args: { ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    let scoped = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    if (!isAdmin) {
      scoped = scoped.filter((l) => l.ownerUserId === user._id);
    } else if (args.ownerUserId) {
      scoped = scoped.filter((l) => l.ownerUserId === args.ownerUserId);
    }

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
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    let scoped = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    if (!isAdmin) {
      scoped = scoped.filter((l) => l.ownerUserId === user._id);
    } else if (args.ownerUserId) {
      scoped = scoped.filter((l) => l.ownerUserId === args.ownerUserId);
    }

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    stages.sort((a, b) => a.order - b.order);

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    const wonStage = stages.find((s) => s.terminalOutcome === "won");
    const lostStage = stages.find((s) => s.terminalOutcome === "lost");

    let newThisWeek = 0;
    let openLeads = 0;
    let wonThisMonth = 0;
    let lostThisMonth = 0;
    const stageCountMap = new Map<string, number>();

    for (const lead of scoped) {
      if (lead.createdAt >= oneWeekAgo) newThisWeek++;
      if (!lead.closedAt) {
        openLeads++;
        stageCountMap.set(lead.stageId, (stageCountMap.get(lead.stageId) ?? 0) + 1);
      }
      if (lead.closedAt && lead.closedAt >= startOfMonthMs) {
        if (wonStage && lead.stageId === wonStage._id) wonThisMonth++;
        if (lostStage && lead.stageId === lostStage._id) lostThisMonth++;
      }
    }

    const nonTerminalStages = stages.filter((s) => !s.isTerminal);
    const totalOpenForStages = openLeads;

    const stageBreakdown = nonTerminalStages.map((stage) => {
      const count = stageCountMap.get(stage._id) ?? 0;
      return {
        id: stage._id,
        name: stage.name,
        count,
        order: stage.order,
        percent: totalOpenForStages > 0 ? count / totalOpenForStages : 0,
      };
    });

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
