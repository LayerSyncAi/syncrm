import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { Id, Doc } from "./_generated/dataModel";

async function canAccessLead(ctx: any, leadId: any, userId: any, isAdmin: boolean, userOrgId: Id<"organizations">) {
  const lead = await ctx.db.get(leadId);
  if (!lead) return null;
  if (lead.orgId && lead.orgId !== userOrgId) return null;
  if (!isAdmin && lead.ownerUserId !== userId) {
    return null;
  }
  return lead;
}

// Match score calculation weights
const SCORE_WEIGHTS = {
  interestType: 30,
  budget: 35,
  location: 25,
  availability: 10,
};

interface MatchScoreBreakdown {
  interestTypeScore: number;
  budgetScore: number;
  locationScore: number;
  availabilityScore: number;
  totalScore: number;
  matchReasons: string[];
  warnings: string[];
}

function calculateMatchScore(
  lead: Doc<"leads">,
  property: Doc<"properties">
): MatchScoreBreakdown {
  const matchReasons: string[] = [];
  const warnings: string[] = [];
  let interestTypeScore = 0;
  let budgetScore = 0;
  let locationScore = 0;
  let availabilityScore = 0;

  const interestMatch =
    (lead.interestType === "rent" && property.listingType === "rent") ||
    (lead.interestType === "buy" && property.listingType === "sale");

  if (interestMatch) {
    interestTypeScore = SCORE_WEIGHTS.interestType;
    matchReasons.push(`${lead.interestType === "buy" ? "For sale" : "For rent"} matches interest`);
  } else {
    warnings.push(`Lead wants to ${lead.interestType}, but property is for ${property.listingType}`);
  }

  if (lead.budgetMin !== undefined || lead.budgetMax !== undefined) {
    const budgetMin = lead.budgetMin ?? 0;
    const budgetMax = lead.budgetMax ?? Infinity;
    const price = property.price;

    if (price >= budgetMin && price <= budgetMax) {
      budgetScore = SCORE_WEIGHTS.budget;
      matchReasons.push("Price within budget range");
    } else if (price < budgetMin) {
      const underBy = ((budgetMin - price) / budgetMin) * 100;
      if (underBy <= 20) {
        budgetScore = SCORE_WEIGHTS.budget * 0.8;
        matchReasons.push("Price slightly under budget");
      } else {
        budgetScore = SCORE_WEIGHTS.budget * 0.5;
        warnings.push(`Price ${underBy.toFixed(0)}% under minimum budget`);
      }
    } else {
      const overBy = ((price - budgetMax) / budgetMax) * 100;
      if (overBy <= 10) {
        budgetScore = SCORE_WEIGHTS.budget * 0.7;
        warnings.push(`Price slightly over budget (${overBy.toFixed(0)}%)`);
      } else if (overBy <= 25) {
        budgetScore = SCORE_WEIGHTS.budget * 0.4;
        warnings.push(`Price over budget by ${overBy.toFixed(0)}%`);
      } else {
        budgetScore = SCORE_WEIGHTS.budget * 0.1;
        warnings.push(`Price significantly over budget (${overBy.toFixed(0)}%)`);
      }
    }
  } else {
    budgetScore = SCORE_WEIGHTS.budget * 0.5;
    warnings.push("Lead has no budget specified");
  }

  if (lead.preferredAreas.length > 0) {
    const propertyLocation = property.location.toLowerCase();
    const matchedAreas = lead.preferredAreas.filter((area) =>
      propertyLocation.includes(area.toLowerCase()) ||
      area.toLowerCase().includes(propertyLocation)
    );

    if (matchedAreas.length > 0) {
      locationScore = SCORE_WEIGHTS.location;
      matchReasons.push(`Location matches: ${matchedAreas.join(", ")}`);
    } else {
      const partialMatches = lead.preferredAreas.filter((area) => {
        const areaWords = area.toLowerCase().split(/\s+/);
        const locationWords = propertyLocation.split(/\s+/);
        return areaWords.some((w) => locationWords.some((lw) => lw.includes(w) || w.includes(lw)));
      });

      if (partialMatches.length > 0) {
        locationScore = SCORE_WEIGHTS.location * 0.6;
        matchReasons.push(`Partial location match: ${partialMatches.join(", ")}`);
      } else {
        warnings.push(`Location "${property.location}" not in preferred areas`);
      }
    }
  } else {
    locationScore = SCORE_WEIGHTS.location * 0.5;
    warnings.push("Lead has no preferred areas specified");
  }

  if (property.status === "available") {
    availabilityScore = SCORE_WEIGHTS.availability;
    matchReasons.push("Property is available");
  } else if (property.status === "under_offer") {
    availabilityScore = SCORE_WEIGHTS.availability * 0.5;
    warnings.push("Property is under offer");
  } else {
    warnings.push(`Property status: ${property.status}`);
  }

  const totalScore = interestTypeScore + budgetScore + locationScore + availabilityScore;

  return {
    interestTypeScore,
    budgetScore,
    locationScore,
    availabilityScore,
    totalScore,
    matchReasons,
    warnings,
  };
}

export const attachPropertyToLead = mutation({
  args: {
    leadId: v.id("leads"),
    propertyId: v.id("properties"),
    matchType: v.union(
      v.literal("suggested"),
      v.literal("requested"),
      v.literal("viewed"),
      v.literal("offered")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);
    return ctx.db.insert("leadPropertyMatches", {
      leadId: args.leadId,
      propertyId: args.propertyId,
      matchType: args.matchType,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: Date.now(),
    });
  },
});

export const listForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    const matches = await ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();

    const enriched = await Promise.all(
      matches.map(async (match) => {
        const property = await ctx.db.get(match.propertyId);
        return {
          ...match,
          property: property
            ? {
                _id: property._id,
                title: property.title,
                location: property.location,
                listingType: property.listingType,
                price: property.price,
                currency: property.currency,
              }
            : null,
        };
      })
    );
    return enriched;
  },
});

export const detach = mutation({
  args: { matchId: v.id("leadPropertyMatches") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    assertOrgAccess(match, user.orgId);
    const lead = await canAccessLead(ctx, match.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    await ctx.db.delete(args.matchId);
  },
});

export const suggestPropertiesForLead = query({
  args: {
    leadId: v.id("leads"),
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
    excludeAttached: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");

    // Get org-scoped properties
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    let attachedPropertyIds: Set<string> = new Set();
    if (args.excludeAttached !== false) {
      const existingMatches = await ctx.db
        .query("leadPropertyMatches")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();
      attachedPropertyIds = new Set(existingMatches.map((m) => m.propertyId));
    }

    const scoredProperties = properties
      .filter((property) => !attachedPropertyIds.has(property._id))
      .map((property) => {
        const scoreBreakdown = calculateMatchScore(lead, property);
        return {
          property: {
            _id: property._id,
            title: property.title,
            type: property.type,
            listingType: property.listingType,
            price: property.price,
            currency: property.currency,
            location: property.location,
            area: property.area,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            status: property.status,
            images: property.images,
          },
          ...scoreBreakdown,
        };
      })
      .filter((item) => item.totalScore >= (args.minScore ?? 30))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, args.limit ?? 10);

    return {
      lead: {
        _id: lead._id,
        fullName: lead.fullName,
        interestType: lead.interestType,
        budgetMin: lead.budgetMin,
        budgetMax: lead.budgetMax,
        budgetCurrency: lead.budgetCurrency,
        preferredAreas: lead.preferredAreas,
      },
      suggestions: scoredProperties,
      totalAvailableProperties: properties.length,
      matchedCount: scoredProperties.length,
    };
  },
});

export const bulkMatchProperties = query({
  args: {
    leadIds: v.optional(v.array(v.id("leads"))),
    minScore: v.optional(v.number()),
    topN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    let leads: Doc<"leads">[];
    if (args.leadIds && args.leadIds.length > 0) {
      const fetchedLeads = await Promise.all(
        args.leadIds.map((id) => canAccessLead(ctx, id, user._id, user.role === "admin", user.orgId))
      );
      leads = fetchedLeads.filter((l): l is Doc<"leads"> => l !== null);
    } else {
      const allLeads = await ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
        .collect();
      leads = allLeads.filter((lead) => {
        if (user.role !== "admin" && lead.ownerUserId !== user._id) return false;
        if (lead.closedAt) return false;
        return true;
      });
    }

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const availableProperties = properties.filter(
      (p) => p.status === "available" || p.status === "under_offer"
    );

    const allMatches = await ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const matchesByLead = new Map<string, Set<string>>();
    for (const match of allMatches) {
      if (!matchesByLead.has(match.leadId)) {
        matchesByLead.set(match.leadId, new Set());
      }
      matchesByLead.get(match.leadId)!.add(match.propertyId);
    }

    const minScore = args.minScore ?? 50;
    const topN = args.topN ?? 5;

    const results = leads.map((lead) => {
      const attachedIds = matchesByLead.get(lead._id) ?? new Set();

      const suggestions = availableProperties
        .filter((p) => !attachedIds.has(p._id))
        .map((property) => {
          const score = calculateMatchScore(lead, property);
          return {
            propertyId: property._id,
            propertyTitle: property.title,
            propertyLocation: property.location,
            propertyPrice: property.price,
            propertyCurrency: property.currency,
            propertyType: property.type,
            listingType: property.listingType,
            totalScore: score.totalScore,
            matchReasons: score.matchReasons,
            warnings: score.warnings,
          };
        })
        .filter((s) => s.totalScore >= minScore)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, topN);

      return {
        lead: {
          _id: lead._id,
          fullName: lead.fullName,
          interestType: lead.interestType,
          budgetMin: lead.budgetMin,
          budgetMax: lead.budgetMax,
          budgetCurrency: lead.budgetCurrency,
          preferredAreas: lead.preferredAreas,
        },
        matchCount: suggestions.length,
        topMatches: suggestions,
      };
    });

    const totalLeads = results.length;
    const leadsWithMatches = results.filter((r) => r.matchCount > 0).length;
    const avgMatchesPerLead =
      totalLeads > 0
        ? results.reduce((sum, r) => sum + r.matchCount, 0) / totalLeads
        : 0;

    return {
      results,
      summary: {
        totalLeads,
        leadsWithMatches,
        avgMatchesPerLead: Math.round(avgMatchesPerLead * 10) / 10,
        totalPropertiesAnalyzed: availableProperties.length,
      },
    };
  },
});

export const getPropertiesForComparison = query({
  args: {
    propertyIds: v.array(v.id("properties")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    if (args.propertyIds.length === 0) {
      return { properties: [] };
    }

    if (args.propertyIds.length > 5) {
      throw new Error("Maximum 5 properties can be compared at once");
    }

    const properties = await Promise.all(
      args.propertyIds.map((id) => ctx.db.get(id))
    );

    const validProperties = properties
      .filter((p): p is Doc<"properties"> => p !== null)
      .filter((p) => !p.orgId || p.orgId === user.orgId);

    return {
      properties: validProperties.map((p) => ({
        _id: p._id,
        title: p.title,
        type: p.type,
        listingType: p.listingType,
        price: p.price,
        currency: p.currency,
        location: p.location,
        area: p.area,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        status: p.status,
        description: p.description,
        images: p.images,
        createdAt: p.createdAt,
      })),
    };
  },
});

export const getMatchScore = query({
  args: {
    leadId: v.id("leads"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await canAccessLead(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    assertOrgAccess(property, user.orgId);

    const scoreBreakdown = calculateMatchScore(lead, property);

    return {
      lead: {
        _id: lead._id,
        fullName: lead.fullName,
        interestType: lead.interestType,
        budgetMin: lead.budgetMin,
        budgetMax: lead.budgetMax,
        preferredAreas: lead.preferredAreas,
      },
      property: {
        _id: property._id,
        title: property.title,
        listingType: property.listingType,
        price: property.price,
        location: property.location,
      },
      ...scoreBreakdown,
    };
  },
});

export const bulkAttachSuggested = mutation({
  args: {
    attachments: v.array(
      v.object({
        leadId: v.id("leads"),
        propertyId: v.id("properties"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const timestamp = Date.now();
    const results: { leadId: string; propertyId: string; success: boolean; error?: string }[] = [];

    for (const attachment of args.attachments) {
      try {
        const lead = await canAccessLead(ctx, attachment.leadId, user._id, user.role === "admin", user.orgId);
        if (!lead) {
          results.push({
            leadId: attachment.leadId,
            propertyId: attachment.propertyId,
            success: false,
            error: "Lead not found or no access",
          });
          continue;
        }

        const existingMatches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q) => q.eq("leadId", attachment.leadId))
          .collect();

        const alreadyAttached = existingMatches.some(
          (m) => m.propertyId === attachment.propertyId
        );

        if (alreadyAttached) {
          results.push({
            leadId: attachment.leadId,
            propertyId: attachment.propertyId,
            success: false,
            error: "Property already attached to lead",
          });
          continue;
        }

        await ctx.db.insert("leadPropertyMatches", {
          leadId: attachment.leadId,
          propertyId: attachment.propertyId,
          matchType: "suggested",
          createdByUserId: user._id,
          orgId: user.orgId,
          createdAt: timestamp,
        });

        results.push({
          leadId: attachment.leadId,
          propertyId: attachment.propertyId,
          success: true,
        });
      } catch (error) {
        results.push({
          leadId: attachment.leadId,
          propertyId: attachment.propertyId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      results,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
    };
  },
});
