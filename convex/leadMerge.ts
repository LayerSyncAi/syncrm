import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

export const getLeadsForMerge = query({
  args: {
    leadIds: v.array(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const leads = await Promise.all(args.leadIds.map((id) => ctx.db.get(id)));
    return leads.filter((l) => l !== null && (!l.orgId || l.orgId === user.orgId));
  },
});

export const mergeLeads = mutation({
  args: {
    primaryLeadId: v.id("leads"),
    mergedLeadIds: v.array(v.id("leads")),
    fieldResolutions: v.array(
      v.object({
        field: v.string(),
        chosenValue: v.string(),
        sourceLeadId: v.id("leads"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const timestamp = Date.now();

    const primaryLead = await ctx.db.get(args.primaryLeadId);
    if (!primaryLead) throw new Error("Primary lead not found");
    assertOrgAccess(primaryLead, user.orgId);

    const mergedLeads: Array<{ _id: Id<"leads"> }> = [];
    for (const id of args.mergedLeadIds) {
      const lead = await ctx.db.get(id);
      if (!lead) throw new Error(`Merged lead ${id} not found`);
      assertOrgAccess(lead, user.orgId);
      mergedLeads.push(lead);
    }

    const updates: Record<string, any> = { updatedAt: timestamp };
    for (const resolution of args.fieldResolutions) {
      const field = resolution.field;
      if (field === "fullName") updates.fullName = resolution.chosenValue;
      else if (field === "phone") {
        updates.phone = resolution.chosenValue;
        updates.normalizedPhone = resolution.chosenValue.replace(/[^\d]/g, "");
      } else if (field === "email") updates.email = resolution.chosenValue || undefined;
      else if (field === "source") updates.source = resolution.chosenValue;
      else if (field === "interestType") updates.interestType = resolution.chosenValue;
      else if (field === "budgetCurrency") updates.budgetCurrency = resolution.chosenValue || undefined;
      else if (field === "budgetMin") updates.budgetMin = resolution.chosenValue ? Number(resolution.chosenValue) : undefined;
      else if (field === "budgetMax") updates.budgetMax = resolution.chosenValue ? Number(resolution.chosenValue) : undefined;
      else if (field === "notes") updates.notes = resolution.chosenValue;
      else if (field === "preferredAreas") {
        updates.preferredAreas = resolution.chosenValue
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean);
      }
    }

    await ctx.db.patch(args.primaryLeadId, updates);

    for (const mergedLead of mergedLeads) {
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_lead", (q) => q.eq("leadId", mergedLead._id))
        .collect();
      for (const activity of activities) {
        await ctx.db.patch(activity._id, { leadId: args.primaryLeadId });
      }

      const matches = await ctx.db
        .query("leadPropertyMatches")
        .withIndex("by_lead", (q) => q.eq("leadId", mergedLead._id))
        .collect();
      for (const match of matches) {
        const existingMatches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q) => q.eq("leadId", args.primaryLeadId))
          .collect();
        const alreadyExists = existingMatches.some(
          (m) => m.propertyId === match.propertyId
        );
        if (!alreadyExists) {
          await ctx.db.patch(match._id, { leadId: args.primaryLeadId });
        } else {
          await ctx.db.delete(match._id);
        }
      }

      await ctx.db.patch(mergedLead._id, {
        isArchived: true,
        mergedIntoLeadId: args.primaryLeadId,
        updatedAt: timestamp,
      });
    }

    await ctx.db.insert("mergeAudits", {
      primaryLeadId: args.primaryLeadId,
      mergedLeadIds: args.mergedLeadIds,
      fieldResolutions: args.fieldResolutions,
      mergedByUserId: user._id,
      orgId: user.orgId,
      mergedAt: timestamp,
    });

    return { success: true };
  },
});

export const getMergeHistory = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const audits = await ctx.db
      .query("mergeAudits")
      .withIndex("by_primary", (q) => q.eq("primaryLeadId", args.leadId))
      .collect();

    // Filter to only this org's audits
    const orgAudits = audits.filter((a) => !a.orgId || a.orgId === user.orgId);

    const enriched = await Promise.all(
      orgAudits.map(async (audit) => {
        const mergedBy = await ctx.db.get(audit.mergedByUserId);
        return {
          ...audit,
          mergedByName:
            mergedBy?.fullName || mergedBy?.name || mergedBy?.email || "Unknown",
        };
      })
    );

    return enriched.sort((a, b) => b.mergedAt - a.mergedAt);
  },
});
