import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./helpers";
import { Id } from "./_generated/dataModel";

// Get leads by IDs for the merge UI
export const getLeadsForMerge = query({
  args: {
    leadIds: v.array(v.id("leads")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const leads = await Promise.all(args.leadIds.map((id) => ctx.db.get(id)));
    return leads.filter(Boolean);
  },
});

// Merge leads: keep primary, archive others, move related objects
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

    // Validate all merged leads exist
    const mergedLeads: Array<{ _id: Id<"leads"> }> = [];
    for (const id of args.mergedLeadIds) {
      const lead = await ctx.db.get(id);
      if (!lead) throw new Error(`Merged lead ${id} not found`);
      mergedLeads.push(lead);
    }

    // Apply field resolutions to primary lead
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

    // Move all related objects from merged leads to primary
    for (const mergedLead of mergedLeads) {
      // Move activities
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_lead", (q) => q.eq("leadId", mergedLead._id))
        .collect();
      for (const activity of activities) {
        await ctx.db.patch(activity._id, { leadId: args.primaryLeadId });
      }

      // Move lead-property matches
      const matches = await ctx.db
        .query("leadPropertyMatches")
        .withIndex("by_lead", (q) => q.eq("leadId", mergedLead._id))
        .collect();
      for (const match of matches) {
        // Check if primary already has this property match
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

      // Archive the merged lead (soft delete)
      await ctx.db.patch(mergedLead._id, {
        isArchived: true,
        mergedIntoLeadId: args.primaryLeadId,
        updatedAt: timestamp,
      });
    }

    // Create merge audit trail
    await ctx.db.insert("mergeAudits", {
      primaryLeadId: args.primaryLeadId,
      mergedLeadIds: args.mergedLeadIds,
      fieldResolutions: args.fieldResolutions,
      mergedByUserId: user._id,
      mergedAt: timestamp,
    });

    return { success: true };
  },
});

// Get merge history for a lead
export const getMergeHistory = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const audits = await ctx.db
      .query("mergeAudits")
      .withIndex("by_primary", (q) => q.eq("primaryLeadId", args.leadId))
      .collect();

    const enriched = await Promise.all(
      audits.map(async (audit) => {
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
