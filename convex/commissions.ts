import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, requireAdmin, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

const scenarioValidator = v.union(
  v.literal("shared_deal"),
  v.literal("own_property_own_lead"),
  v.literal("company_property")
);

// ── Commission Config CRUD (Admin only) ──────────────────

export const listConfigs = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const configs = await ctx.db
      .query("commissionConfigs")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    return configs.map((config) => {
      const creator = userMap.get(config.createdByUserId);
      return {
        ...config,
        createdByName: creator?.fullName || creator?.name || creator?.email || "Unknown",
      };
    });
  },
});

export const getConfigByScenario = query({
  args: { scenario: scenarioValidator },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const configs = await ctx.db
      .query("commissionConfigs")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Return the default config for this scenario, or the first one
    const scenarioConfigs = configs.filter((c) => c.scenario === args.scenario);
    return scenarioConfigs.find((c) => c.isDefault) || scenarioConfigs[0] || null;
  },
});

export const createConfig = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    scenario: scenarioValidator,
    propertyAgentPercent: v.number(),
    leadAgentPercent: v.number(),
    companyPercent: v.number(),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    // Validate percentages sum to 100
    const total = args.propertyAgentPercent + args.leadAgentPercent + args.companyPercent;
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Commission percentages must sum to 100%. Current total: ${total}%`);
    }

    // Validate no negative percentages
    if (args.propertyAgentPercent < 0 || args.leadAgentPercent < 0 || args.companyPercent < 0) {
      throw new Error("Commission percentages cannot be negative");
    }

    // If setting as default, unset other defaults for this scenario
    if (args.isDefault) {
      const existingConfigs = await ctx.db
        .query("commissionConfigs")
        .withIndex("by_org", (q) => q.eq("orgId", admin.orgId))
        .collect();

      for (const config of existingConfigs) {
        if (config.scenario === args.scenario && config.isDefault) {
          await ctx.db.patch(config._id, { isDefault: false, updatedAt: Date.now() });
        }
      }
    }

    const timestamp = Date.now();
    return ctx.db.insert("commissionConfigs", {
      name: args.name.trim(),
      description: args.description?.trim(),
      scenario: args.scenario,
      propertyAgentPercent: args.propertyAgentPercent,
      leadAgentPercent: args.leadAgentPercent,
      companyPercent: args.companyPercent,
      isDefault: args.isDefault,
      orgId: admin.orgId,
      createdByUserId: admin._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const updateConfig = mutation({
  args: {
    configId: v.id("commissionConfigs"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    propertyAgentPercent: v.optional(v.number()),
    leadAgentPercent: v.optional(v.number()),
    companyPercent: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Commission config not found");
    assertOrgAccess(config, admin.orgId);

    // If percentages are being updated, validate they sum to 100
    const propPercent = args.propertyAgentPercent ?? config.propertyAgentPercent;
    const leadPercent = args.leadAgentPercent ?? config.leadAgentPercent;
    const compPercent = args.companyPercent ?? config.companyPercent;
    const total = propPercent + leadPercent + compPercent;

    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Commission percentages must sum to 100%. Current total: ${total}%`);
    }

    if (propPercent < 0 || leadPercent < 0 || compPercent < 0) {
      throw new Error("Commission percentages cannot be negative");
    }

    // If setting as default, unset other defaults for this scenario
    if (args.isDefault === true) {
      const existingConfigs = await ctx.db
        .query("commissionConfigs")
        .withIndex("by_org", (q) => q.eq("orgId", admin.orgId))
        .collect();

      for (const c of existingConfigs) {
        if (c._id !== args.configId && c.scenario === config.scenario && c.isDefault) {
          await ctx.db.patch(c._id, { isDefault: false, updatedAt: Date.now() });
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.description !== undefined) updates.description = args.description.trim();
    if (args.propertyAgentPercent !== undefined) updates.propertyAgentPercent = args.propertyAgentPercent;
    if (args.leadAgentPercent !== undefined) updates.leadAgentPercent = args.leadAgentPercent;
    if (args.companyPercent !== undefined) updates.companyPercent = args.companyPercent;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;

    await ctx.db.patch(args.configId, updates);
  },
});

export const deleteConfig = mutation({
  args: { configId: v.id("commissionConfigs") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Commission config not found");
    assertOrgAccess(config, admin.orgId);

    // Check if this config is referenced by any deal commissions
    const usedCommissions = await ctx.db
      .query("dealCommissions")
      .withIndex("by_org", (q) => q.eq("orgId", admin.orgId))
      .collect();

    const isUsed = usedCommissions.some((c) => c.commissionConfigId === args.configId);
    if (isUsed) {
      throw new Error("Cannot delete a commission config that has been used in deals. You can create a new config instead.");
    }

    await ctx.db.delete(args.configId);
  },
});

// ── Deal Commission Records ──────────────────────────────

export const listDealCommissions = query({
  args: {
    leadId: v.optional(v.id("leads")),
    agentUserId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("paid"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    let commissions = await ctx.db
      .query("dealCommissions")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    // Role-based filtering: agents only see their own commissions
    if (!isAdmin) {
      commissions = commissions.filter(
        (c) => c.propertyAgentUserId === user._id || c.leadAgentUserId === user._id
      );
    }

    if (args.leadId) {
      commissions = commissions.filter((c) => c.leadId === args.leadId);
    }
    if (args.agentUserId) {
      commissions = commissions.filter(
        (c) => c.propertyAgentUserId === args.agentUserId || c.leadAgentUserId === args.agentUserId
      );
    }
    if (args.status) {
      commissions = commissions.filter((c) => c.status === args.status);
    }

    // Enrich
    const [leads, users] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const leadMap = new Map(leads.map((l) => [l._id, l]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return commissions.map((commission) => {
      const lead = leadMap.get(commission.leadId);
      const propAgent = commission.propertyAgentUserId ? userMap.get(commission.propertyAgentUserId) : null;
      const leadAgent = userMap.get(commission.leadAgentUserId);
      return {
        ...commission,
        leadName: lead?.fullName || "Unknown",
        propertyAgentName: propAgent?.fullName || propAgent?.name || "—",
        leadAgentName: leadAgent?.fullName || leadAgent?.name || "Unknown",
      };
    });
  },
});

export const updateCommissionStatus = mutation({
  args: {
    commissionId: v.id("dealCommissions"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("paid")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission record not found");
    assertOrgAccess(commission, admin.orgId);

    await ctx.db.patch(args.commissionId, { status: args.status });
  },
});

// ── Seed default configs ─────────────────────────────────

export const seedDefaultConfigs = mutation({
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    const existing = await ctx.db
      .query("commissionConfigs")
      .withIndex("by_org", (q) => q.eq("orgId", admin.orgId))
      .collect();

    if (existing.length > 0) return;

    const timestamp = Date.now();
    const defaults = [
      {
        name: "Shared Deal (Default)",
        description: "Property shared between two agents. Agent A holds the property, Agent B closes the deal with their lead.",
        scenario: "shared_deal" as const,
        propertyAgentPercent: 40,
        leadAgentPercent: 40,
        companyPercent: 20,
        isDefault: true,
      },
      {
        name: "Own Property & Own Lead",
        description: "Agent closes a deal using their own property listing and their own lead.",
        scenario: "own_property_own_lead" as const,
        propertyAgentPercent: 0,
        leadAgentPercent: 70,
        companyPercent: 30,
        isDefault: true,
      },
      {
        name: "Company Property",
        description: "Agent brings a lead to a company-listed property (no specific property agent).",
        scenario: "company_property" as const,
        propertyAgentPercent: 0,
        leadAgentPercent: 50,
        companyPercent: 50,
        isDefault: true,
      },
    ];

    for (const config of defaults) {
      await ctx.db.insert("commissionConfigs", {
        ...config,
        orgId: admin.orgId,
        createdByUserId: admin._id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  },
});
