import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, getCurrentUser } from "./helpers";

const criterionSchema = v.object({
  key: v.string(),
  label: v.string(),
  type: v.union(v.literal("boolean"), v.literal("threshold")),
  weight: v.number(),
  enabled: v.boolean(),
  threshold: v.optional(v.number()),
});

const DEFAULT_CRITERIA = [
  { key: "has_email", label: "Has email address", type: "boolean" as const, weight: 10, enabled: true },
  { key: "has_budget", label: "Has budget set", type: "boolean" as const, weight: 15, enabled: true },
  { key: "has_preferred_areas", label: "Has preferred areas", type: "boolean" as const, weight: 10, enabled: true },
  { key: "has_notes", label: "Has notes", type: "boolean" as const, weight: 5, enabled: true },
  { key: "activity_count", label: "Number of activities", type: "threshold" as const, weight: 20, enabled: true, threshold: 3 },
  { key: "budget_min", label: "Minimum budget amount", type: "threshold" as const, weight: 15, enabled: true, threshold: 50000 },
  { key: "recent_activity", label: "Activity in last 7 days", type: "boolean" as const, weight: 25, enabled: true },
];

// Get scoring configuration (or defaults)
export const getConfig = query({
  handler: async (ctx) => {
    await getCurrentUser(ctx);
    const configs = await ctx.db.query("leadScoreConfig").collect();
    if (configs.length === 0) {
      return { criteria: DEFAULT_CRITERIA, isDefault: true };
    }
    // Return the most recent config
    const latest = configs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return { criteria: latest.criteria, isDefault: false, _id: latest._id };
  },
});

// Save scoring configuration (admin only)
export const saveConfig = mutation({
  args: {
    criteria: v.array(criterionSchema),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const timestamp = Date.now();

    const configs = await ctx.db.query("leadScoreConfig").collect();
    if (configs.length > 0) {
      const latest = configs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      await ctx.db.patch(latest._id, {
        criteria: args.criteria,
        updatedByUserId: user._id,
        updatedAt: timestamp,
      });
      return latest._id;
    }

    return ctx.db.insert("leadScoreConfig", {
      criteria: args.criteria,
      updatedByUserId: user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

// Compute score for a single lead (helper used by scoring preview)
export const computeScorePreview = query({
  args: {
    leadId: v.id("leads"),
    criteria: v.array(criterionSchema),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const breakdown: Array<{ key: string; label: string; points: number; met: boolean }> = [];
    let totalScore = 0;

    for (const criterion of args.criteria) {
      if (!criterion.enabled) continue;

      let met = false;
      switch (criterion.key) {
        case "has_email":
          met = !!lead.email && lead.email.trim().length > 0;
          break;
        case "has_budget":
          met = lead.budgetMin !== undefined || lead.budgetMax !== undefined;
          break;
        case "has_preferred_areas":
          met = lead.preferredAreas.length > 0;
          break;
        case "has_notes":
          met = lead.notes.trim().length > 0;
          break;
        case "activity_count":
          met = activities.length >= (criterion.threshold || 0);
          break;
        case "budget_min":
          met = (lead.budgetMin || 0) >= (criterion.threshold || 0);
          break;
        case "recent_activity":
          met = activities.some((a) => a.createdAt >= sevenDaysAgo);
          break;
        default:
          break;
      }

      const points = met ? criterion.weight : 0;
      totalScore += points;
      breakdown.push({
        key: criterion.key,
        label: criterion.label,
        points,
        met,
      });
    }

    return { totalScore, breakdown, leadName: lead.fullName };
  },
});

// Recompute scores for all active leads (admin only)
export const recomputeAllScores = mutation({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const timestamp = Date.now();

    const configs = await ctx.db.query("leadScoreConfig").collect();
    const criteria =
      configs.length > 0
        ? configs.sort((a, b) => b.updatedAt - a.updatedAt)[0].criteria
        : DEFAULT_CRITERIA;

    const allLeads = await ctx.db.query("leads").collect();
    const activeLeads = allLeads.filter((l) => !l.isArchived);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let updated = 0;
    for (const lead of activeLeads) {
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .collect();

      let score = 0;
      for (const criterion of criteria) {
        if (!criterion.enabled) continue;
        let met = false;
        switch (criterion.key) {
          case "has_email":
            met = !!lead.email && lead.email.trim().length > 0;
            break;
          case "has_budget":
            met = lead.budgetMin !== undefined || lead.budgetMax !== undefined;
            break;
          case "has_preferred_areas":
            met = lead.preferredAreas.length > 0;
            break;
          case "has_notes":
            met = lead.notes.trim().length > 0;
            break;
          case "activity_count":
            met = activities.length >= (criterion.threshold || 0);
            break;
          case "budget_min":
            met = (lead.budgetMin || 0) >= (criterion.threshold || 0);
            break;
          case "recent_activity":
            met = activities.some((a) => a.createdAt >= sevenDaysAgo);
            break;
        }
        if (met) score += criterion.weight;
      }

      await ctx.db.patch(lead._id, {
        score,
        lastScoredAt: timestamp,
        updatedAt: timestamp,
      });
      updated++;
    }

    return { updated };
  },
});
