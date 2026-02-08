import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";

// Query leads for export with filters
export const getLeadsForExport = query({
  args: {
    stageId: v.optional(v.id("pipelineStages")),
    ownerUserId: v.optional(v.id("users")),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    fields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const isAdmin = user.role === "admin";

    let results;
    if (!isAdmin) {
      results = await ctx.db
        .query("leads")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
        .collect();
    } else if (args.ownerUserId) {
      results = await ctx.db
        .query("leads")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", args.ownerUserId!))
        .collect();
    } else if (args.stageId) {
      results = await ctx.db
        .query("leads")
        .withIndex("by_stage", (q) => q.eq("stageId", args.stageId!))
        .collect();
    } else {
      results = await ctx.db.query("leads").collect();
    }

    // Filter out archived
    let filtered = results.filter((l) => !l.isArchived);

    // Apply remaining filters
    if (args.stageId && !(!isAdmin || args.ownerUserId)) {
      // Already filtered by index
    } else if (args.stageId) {
      filtered = filtered.filter((l) => l.stageId === args.stageId);
    }

    if (args.dateFrom) {
      filtered = filtered.filter((l) => l.createdAt >= args.dateFrom!);
    }
    if (args.dateTo) {
      filtered = filtered.filter((l) => l.createdAt <= args.dateTo!);
    }

    // Batch fetch stages and users for enrichment
    const [stages, users] = await Promise.all([
      ctx.db.query("pipelineStages").withIndex("by_order").collect(),
      ctx.db.query("users").collect(),
    ]);
    const stageMap = new Map(stages.map((s) => [s._id, s]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return filtered.map((lead) => {
      const owner = userMap.get(lead.ownerUserId);
      const stage = stageMap.get(lead.stageId);
      return {
        _id: lead._id,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email || "",
        source: lead.source,
        interestType: lead.interestType,
        budgetCurrency: lead.budgetCurrency || "",
        budgetMin: lead.budgetMin ?? "",
        budgetMax: lead.budgetMax ?? "",
        preferredAreas: lead.preferredAreas.join(", "),
        notes: lead.notes,
        stageName: stage?.name || "Unknown",
        ownerName: owner?.fullName || owner?.name || owner?.email || "Unknown",
        score: lead.score ?? "",
        closedAt: lead.closedAt
          ? new Date(lead.closedAt).toISOString()
          : "",
        closeReason: lead.closeReason || "",
        createdAt: new Date(lead.createdAt).toISOString(),
        updatedAt: new Date(lead.updatedAt).toISOString(),
      };
    });
  },
});
