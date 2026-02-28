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
    scoreMin: v.optional(v.number()),
    scoreMax: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("score_asc"), v.literal("score_desc"))),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    // Use index-based scoping: for non-admins, use by_owner index directly
    let baseQuery;
    if (!isAdmin) {
      baseQuery = ctx.db
        .query("leads")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id));
    } else if (args.ownerUserId) {
      baseQuery = ctx.db
        .query("leads")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", args.ownerUserId));
    } else if (args.stageId) {
      baseQuery = ctx.db
        .query("leads")
        .withIndex("by_stage", (q) => q.eq("stageId", args.stageId));
    } else {
      baseQuery = ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("orgId", user.orgId));
    }

    const results = await baseQuery.collect();

    // Apply remaining filters that can't be handled by indexes
    const filtered = results.filter((lead) => {
      if (lead.isArchived) return false;
      // Org scoping for non-org index paths
      if (lead.orgId !== user.orgId) return false;
      // Stage filter (only if not already filtered by index)
      if (args.stageId && lead.stageId !== args.stageId && !isAdmin && !args.ownerUserId) {
        // stageId index already applied for admin without owner filter
      } else if (args.stageId && lead.stageId !== args.stageId) {
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
      if (args.scoreMin !== undefined) {
        if ((lead.score ?? 0) < args.scoreMin) return false;
      }
      if (args.scoreMax !== undefined) {
        if ((lead.score ?? 0) > args.scoreMax) return false;
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

    const enriched = filtered.map((lead) => {
      const owner = userMap.get(lead.ownerUserId);
      const stage = stageMap.get(lead.stageId);
      return {
        ...lead,
        ownerName: owner?.fullName || owner?.name || owner?.email || "Unknown",
        stageName: stage?.name || "Unknown",
        stageOrder: stage?.order ?? 0,
      };
    });

    // Sort by score if requested
    if (args.sortBy === "score_desc") {
      enriched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (args.sortBy === "score_asc") {
      enriched.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    }

    // Server-side pagination
    const page = args.page ?? 0;
    const pageSize = args.pageSize ?? 50;
    const totalCount = enriched.length;
    const start = page * pageSize;
    const items = enriched.slice(start, start + pageSize);

    return {
      items,
      totalCount,
      page,
      pageSize,
      hasMore: start + pageSize < totalCount,
    };
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
    dealValue: v.optional(v.number()),
    dealCurrency: v.optional(v.string()),
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

    const now = Date.now();
    const updated: Record<string, unknown> = {
      stageId: args.stageId,
      updatedAt: now,
    };
    if (stage.isTerminal) {
      updated.closedAt = now;
      updated.closeReason = args.closeReason ?? "";
      if (args.dealValue !== undefined) updated.dealValue = args.dealValue;
      if (args.dealCurrency !== undefined) updated.dealCurrency = args.dealCurrency;
    } else {
      updated.closedAt = undefined;
      updated.closeReason = undefined;
    }
    await ctx.db.patch(args.leadId, updated);

    // Auto-generate commission records when deal is won
    if (stage.isTerminal && stage.terminalOutcome === "won" && args.dealValue && args.dealValue > 0) {
      const dealCurrency = args.dealCurrency || "USD";

      // Check if there are active property shares for this lead
      const shares = await ctx.db
        .query("propertyShares")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();

      const activeShares = shares.filter(
        (s) => s.status === "active" && (!s.orgId || s.orgId === user.orgId)
      );

      // Get commission configs for the org
      const configs = await ctx.db
        .query("commissionConfigs")
        .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
        .collect();

      if (activeShares.length > 0) {
        // Shared deal scenario
        const sharedConfig = configs.find(
          (c) => c.scenario === "shared_deal" && c.isDefault
        ) || configs.find((c) => c.scenario === "shared_deal");

        for (const share of activeShares) {
          // Mark share as closed won
          await ctx.db.patch(share._id, {
            status: "closed_won",
            dealValue: args.dealValue,
            dealCurrency,
            closedAt: now,
            updatedAt: now,
          });

          // Mark property as sold (sales) or off_market (rentals)
          const property = await ctx.db.get(share.propertyId);
          if (property) {
            await ctx.db.patch(share.propertyId, {
              status: property.listingType === "sale" ? "sold" : "off_market",
              updatedAt: now,
            });
          }

          // Create commission record
          const propPercent = sharedConfig?.propertyAgentPercent ?? 40;
          const leadPercent = sharedConfig?.leadAgentPercent ?? 40;
          const compPercent = sharedConfig?.companyPercent ?? 20;

          await ctx.db.insert("dealCommissions", {
            leadId: args.leadId,
            propertyId: share.propertyId,
            propertyShareId: share._id,
            commissionConfigId: sharedConfig?._id,
            dealValue: args.dealValue,
            dealCurrency,
            propertyAgentUserId: share.sharedByUserId,
            propertyAgentPercent: propPercent,
            propertyAgentAmount: (args.dealValue * propPercent) / 100,
            leadAgentUserId: share.sharedWithUserId,
            leadAgentPercent: leadPercent,
            leadAgentAmount: (args.dealValue * leadPercent) / 100,
            companyPercent: compPercent,
            companyAmount: (args.dealValue * compPercent) / 100,
            status: "pending",
            orgId: user.orgId,
            createdAt: now,
          });
        }
      } else {
        // No shares - check if lead owner has their own property match
        const matches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
          .collect();

        let scenario: "own_property_own_lead" | "company_property" | "shared_deal" = "company_property";
        let propertyAgentId: Id<"users"> | undefined;
        let propertyId: Id<"properties"> | undefined;

        if (matches.length > 0) {
          // Check if the lead owner also created the matched property
          for (const match of matches) {
            const property = await ctx.db.get(match.propertyId);
            if (property?.createdByUserId === lead.ownerUserId) {
              scenario = "own_property_own_lead";
              propertyId = match.propertyId;
              break;
            }
            if (property) {
              propertyId = match.propertyId;
              if (property.createdByUserId) {
                propertyAgentId = property.createdByUserId;
                // Different agent created this property — treat as shared deal
                scenario = "shared_deal";
              }
            }
          }
        }

        const config = configs.find(
          (c) => c.scenario === scenario && c.isDefault
        ) || configs.find((c) => c.scenario === scenario);

        const defaultSplits = {
          own_property_own_lead: { prop: 0, lead: 70, company: 30 },
          shared_deal: { prop: 40, lead: 40, company: 20 },
          company_property: { prop: 0, lead: 50, company: 50 },
        };
        const defaults = defaultSplits[scenario];
        const propPercent = config?.propertyAgentPercent ?? defaults.prop;
        const leadPercent = config?.leadAgentPercent ?? defaults.lead;
        const compPercent = config?.companyPercent ?? defaults.company;

        await ctx.db.insert("dealCommissions", {
          leadId: args.leadId,
          propertyId,
          commissionConfigId: config?._id,
          dealValue: args.dealValue,
          dealCurrency,
          propertyAgentUserId: scenario === "own_property_own_lead" ? undefined : propertyAgentId,
          propertyAgentPercent: propPercent,
          propertyAgentAmount: (args.dealValue * propPercent) / 100,
          leadAgentUserId: lead.ownerUserId,
          leadAgentPercent: leadPercent,
          leadAgentAmount: (args.dealValue * leadPercent) / 100,
          companyPercent: compPercent,
          companyAmount: (args.dealValue * compPercent) / 100,
          status: "pending",
          orgId: user.orgId,
          createdAt: now,
        });

        // Mark the won property as sold (sales) or off_market (rentals)
        if (propertyId) {
          const wonProperty = await ctx.db.get(propertyId);
          if (wonProperty) {
            await ctx.db.patch(propertyId, {
              status: wonProperty.listingType === "sale" ? "sold" : "off_market",
              updatedAt: now,
            });
          }
        }
      }
    }

    // If deal is lost, mark active shares as closed_lost
    if (stage.isTerminal && stage.terminalOutcome === "lost") {
      const shares = await ctx.db
        .query("propertyShares")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();

      for (const share of shares) {
        if (share.status === "active" && (!share.orgId || share.orgId === user.orgId)) {
          await ctx.db.patch(share._id, {
            status: "closed_lost",
            closedAt: now,
            updatedAt: now,
          });
        }
      }
    }
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

    const wonStage = stages.find((s) => s.terminalOutcome === "won");
    const lostStage = stages.find((s) => s.terminalOutcome === "lost");

    let totalLeads = 0;
    let openLeads = 0;
    let totalWon = 0;
    let totalLost = 0;
    const stageCountMap = new Map<string, number>();

    for (const lead of scoped) {
      totalLeads++;
      if (!lead.closedAt) {
        openLeads++;
      }
      if (wonStage && lead.stageId === wonStage._id) totalWon++;
      if (lostStage && lead.stageId === lostStage._id) totalLost++;
      stageCountMap.set(lead.stageId, (stageCountMap.get(lead.stageId) ?? 0) + 1);
    }

    const stageBreakdown = stages.map((stage) => {
      const count = stageCountMap.get(stage._id) ?? 0;
      return {
        id: stage._id,
        name: stage.name,
        count,
        order: stage.order,
        percent: totalLeads > 0 ? count / totalLeads : 0,
      };
    });

    const totalClosed = totalWon + totalLost;
    const overallProgress = totalClosed > 0
      ? Math.round((totalWon / totalClosed) * 100)
      : 0;

    return {
      stats: {
        totalLeads,
        openLeads,
        totalWon,
        totalLost,
      },
      stageBreakdown,
      monthlyProgress: overallProgress,
    };
  },
});

export const dashboardScoreStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    let scoped = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    if (!isAdmin) {
      scoped = scoped.filter((l) => l.ownerUserId === user._id);
    }

    const activeLeads = scoped.filter((l) => !l.isArchived);

    // Score distribution buckets: 0-19 (Cold), 20-39 (Cool), 40-59 (Warm), 60-79 (Hot), 80-100 (On Fire)
    const distribution = [
      { label: "Cold", range: "0–19", min: 0, max: 19, count: 0 },
      { label: "Cool", range: "20–39", min: 20, max: 39, count: 0 },
      { label: "Warm", range: "40–59", min: 40, max: 59, count: 0 },
      { label: "Hot", range: "60–79", min: 60, max: 79, count: 0 },
      { label: "On Fire", range: "80–100", min: 80, max: 100, count: 0 },
    ];

    let scoredCount = 0;
    let totalScore = 0;

    for (const lead of activeLeads) {
      const score = lead.score ?? 0;
      if (lead.score !== undefined) {
        scoredCount++;
        totalScore += score;
      }
      for (const bucket of distribution) {
        if (score >= bucket.min && score <= bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    // Average score by stage
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    stages.sort((a, b) => a.order - b.order);

    const stageScoreMap = new Map<string, { total: number; count: number }>();
    for (const lead of activeLeads) {
      const entry = stageScoreMap.get(lead.stageId) ?? { total: 0, count: 0 };
      entry.total += lead.score ?? 0;
      entry.count++;
      stageScoreMap.set(lead.stageId, entry);
    }

    const avgScoreByStage = stages.map((stage) => {
      const entry = stageScoreMap.get(stage._id);
      return {
        id: stage._id,
        name: stage.name,
        avgScore: entry && entry.count > 0 ? Math.round(entry.total / entry.count) : 0,
        count: entry?.count ?? 0,
      };
    });

    // Top unworked leads: high score but no activity in the last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const openLeads = activeLeads.filter((l) => !l.closedAt);

    // Pre-sort candidates by score descending, only check top candidates
    // to avoid fetching activities for every single open lead (N+1 fix)
    const candidates = openLeads
      .filter((l) => (l.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 20); // Only check top 20 candidates instead of all open leads

    const leadActivityMap = new Map<string, number>();
    const activityChecks = candidates.map(async (lead) => {
      const recentActivity = await ctx.db
        .query("activities")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .filter((q) => q.gte(q.field("createdAt"), sevenDaysAgo))
        .first();
      leadActivityMap.set(lead._id, recentActivity ? 1 : 0);
    });
    await Promise.all(activityChecks);

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const topUnworked = candidates
      .filter((l) => (leadActivityMap.get(l._id) ?? 0) === 0)
      .slice(0, 5)
      .map((l) => {
        const owner = userMap.get(l.ownerUserId);
        return {
          _id: l._id,
          fullName: l.fullName,
          score: l.score ?? 0,
          ownerName: owner?.fullName || owner?.name || owner?.email || "Unknown",
          lastScoredAt: l.lastScoredAt,
        };
      });

    return {
      distribution: distribution.map((d) => ({
        label: d.label,
        range: d.range,
        count: d.count,
      })),
      avgScoreByStage,
      topUnworked,
      overallAvg: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
      scoredCount,
      totalActive: activeLeads.length,
    };
  },
});
