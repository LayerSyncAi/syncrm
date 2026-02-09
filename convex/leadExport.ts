import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg } from "./helpers";

export const getLeadsForExport = query({
  args: {
    stageId: v.optional(v.id("pipelineStages")),
    ownerUserId: v.optional(v.id("users")),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    fields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";

    // Always scope by org
    let results = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    if (!isAdmin) {
      results = results.filter((l) => l.ownerUserId === user._id);
    } else if (args.ownerUserId) {
      results = results.filter((l) => l.ownerUserId === args.ownerUserId);
    }

    let filtered = results.filter((l) => !l.isArchived);

    if (args.stageId) {
      filtered = filtered.filter((l) => l.stageId === args.stageId);
    }

    if (args.dateFrom) {
      filtered = filtered.filter((l) => l.createdAt >= args.dateFrom!);
    }
    if (args.dateTo) {
      filtered = filtered.filter((l) => l.createdAt <= args.dateTo!);
    }

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
