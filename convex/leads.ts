import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess, isEffectiveAdmin } from "./helpers";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { checkRateLimit } from "./rateLimit";
import { computeAndStoreScore } from "./leadScoring";
import { COMMISSION_RATE, computeCommissionSplit } from "./commissionLib";
import { canonicalizeAreas } from "./lib/locations";
import { leadSourceValidator, LEGACY_PORTAL_SOURCE } from "./lib/leadSources";
import { buildLeadDetailsPatch } from "./leadEditLib";
import { recordAudit } from "./logs";

const leadArgs = {
  contactId: v.id("contacts"),
  source: leadSourceValidator,
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
  // Unassigned leads are visible to (and workable by) everyone in the org so
  // nothing imported without a clear owner gets lost.
  if (!isAdmin && lead.ownerUserId !== userId && !lead.isUnassigned) {
    return null;
  }
  return lead;
}

/**
 * Leads a non-admin can see: their own plus every unassigned lead in the org.
 */
async function ownAndUnassignedLeads(
  ctx: QueryCtx,
  userId: Id<"users">,
  orgId: Id<"organizations">
): Promise<Doc<"leads">[]> {
  const [own, unassigned] = await Promise.all([
    ctx.db
      .query("leads")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect(),
    ctx.db
      .query("leads")
      .withIndex("by_org_unassigned", (q) => q.eq("orgId", orgId).eq("isUnassigned", true))
      .collect(),
  ]);
  const seen = new Set(own.map((l) => l._id));
  return [...own, ...unassigned.filter((l) => !seen.has(l._id))];
}

function ownerLabel(
  lead: { isUnassigned?: boolean; ownerUserId: Id<"users"> },
  userMap: Map<Id<"users">, { fullName?: string; name?: string; email?: string }>
) {
  if (lead.isUnassigned) return "Unassigned";
  const owner = userMap.get(lead.ownerUserId);
  return owner?.fullName || owner?.name || owner?.email || "Unknown";
}

export const create = mutation({
  args: leadArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    await checkRateLimit(ctx, "leadCreate", user._id);

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

    const leadId = await ctx.db.insert("leads", {
      contactId: args.contactId,
      fullName: contact.name,
      phone: contact.phone || undefined,
      normalizedPhone: contact.normalizedPhone || undefined,
      email: contact.email,
      source: args.source,
      interestType: args.interestType,
      budgetCurrency: args.budgetCurrency,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      preferredAreas: canonicalizeAreas(args.preferredAreas),
      notes: args.notes,
      stageId: args.stageId,
      ownerUserId: ownerId,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Notify the owner when a lead is assigned to someone other than the
    // creator (e.g. an admin assigning to an agent). No self-notifications.
    if (ownerId !== user._id) {
      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: ownerId,
        title: "New lead assigned",
        body: `${contact.name} was assigned to you.`,
        url: `/app/leads/${leadId}`,
        tag: `lead-${leadId}`,
      });
    }

    return leadId;
  },
});

export const list = query({
  args: {
    stageId: v.optional(v.id("pipelineStages")),
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    preferredAreaKeyword: v.optional(v.string()),
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    // "unassigned" shows only leads no agent owns yet.
    assignment: v.optional(v.literal("unassigned")),
    propertyId: v.optional(v.id("properties")),
    scoreMin: v.optional(v.number()),
    scoreMax: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("score_asc"), v.literal("score_desc"))),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = isEffectiveAdmin(user);

    // Use Convex searchIndex when text search is provided (server-side search on fullName)
    let results;
    if (args.q && args.q.trim().length > 0) {
      const qTrim = args.q.trim();
      results = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) =>
          q.search("fullName", qTrim).eq("orgId", user.orgId)
        )
        .collect();

      // Fallback: search index only indexes fullName — miss phone/email/partial matches or empty FTS.
      if (results.length === 0) {
        const pool = !isAdmin
          ? await ownAndUnassignedLeads(ctx, user._id, user.orgId)
          : await ctx.db
              .query("leads")
              .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
              .collect();
        const qLower = qTrim.toLowerCase();
        const digits = qTrim.replace(/\D/g, "");
        results = pool.filter((lead) => {
          if (lead.isArchived) return false;
          if (lead.orgId && lead.orgId !== user.orgId) return false;
          if (!isAdmin && lead.ownerUserId !== user._id && !lead.isUnassigned) return false;
          const nameMatch = lead.fullName.toLowerCase().includes(qLower);
          const emailMatch = lead.email?.toLowerCase().includes(qLower) ?? false;
          const phoneMatch =
            (lead.phone && lead.phone.includes(qTrim)) ||
            (digits.length > 0 &&
              lead.normalizedPhone &&
              lead.normalizedPhone.includes(digits));
          return nameMatch || emailMatch || phoneMatch;
        });
      }
    } else if (args.assignment === "unassigned") {
      results = await ctx.db
        .query("leads")
        .withIndex("by_org_unassigned", (q) => q.eq("orgId", user.orgId).eq("isUnassigned", true))
        .collect();
    } else if (!isAdmin) {
      results = await ownAndUnassignedLeads(ctx, user._id, user.orgId);
    } else if (args.ownerUserId) {
      const ownerUserId = args.ownerUserId;
      results = await ctx.db
        .query("leads")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect();
    } else if (args.stageId) {
      const stageId = args.stageId;
      results = await ctx.db
        .query("leads")
        .withIndex("by_stage", (q) => q.eq("stageId", stageId))
        .collect();
    } else {
      results = await ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
        .collect();
    }

    // Apply remaining filters that can't be handled by indexes
    const filtered = results.filter((lead) => {
      if (lead.isArchived) return false;
      // Org scoping: legacy rows may omit orgId — only reject when org is set and mismatched
      if (lead.orgId && lead.orgId !== user.orgId) return false;
      // Non-admin can only see their own leads, plus unassigned ones
      if (!isAdmin && lead.ownerUserId !== user._id && !lead.isUnassigned) return false;
      if (args.assignment === "unassigned" && !lead.isUnassigned) return false;
      // An owner filter means "assigned to this agent" — an unassigned lead's
      // ownerUserId is only the importer.
      if (args.ownerUserId && (lead.isUnassigned || lead.ownerUserId !== args.ownerUserId)) return false;
      // Stage filter
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

    // Batch fetch all property matches for the filtered leads
    const allMatches = await ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_org", (q: any) => q.eq("orgId", user.orgId))
      .collect();
    const matchByLead = new Map<string, typeof allMatches[0]>();
    for (const m of allMatches) {
      if (!matchByLead.has(m.leadId as string)) {
        matchByLead.set(m.leadId as string, m);
      }
    }

    // Fetch property titles for all matched properties
    const propertyIds = new Set(
      Array.from(matchByLead.values()).map((m) => m.propertyId)
    );
    const propertyTitleMap = new Map<string, string>();
    for (const pid of propertyIds) {
      const property = await ctx.db.get(pid);
      if (property) {
        propertyTitleMap.set(pid as string, property.title);
      }
    }

    // Build a set of lead IDs that match a specific property (for property filter)
    let propertyFilterLeadIds: Set<string> | null = null;
    if (args.propertyId) {
      propertyFilterLeadIds = new Set(
        allMatches
          .filter((m) => m.propertyId === args.propertyId)
          .map((m) => m.leadId as string)
      );
    }

    // Apply property filter before enrichment
    const afterPropertyFilter = args.propertyId
      ? filtered.filter((lead) => propertyFilterLeadIds!.has(lead._id as string))
      : filtered;

    const enriched = afterPropertyFilter.map((lead) => {
      const stage = stageMap.get(lead.stageId);
      const match = matchByLead.get(lead._id as string);
      const propertyTitle = match ? propertyTitleMap.get(match.propertyId as string) ?? null : null;
      return {
        ...lead,
        ownerName: ownerLabel(lead, userMap),
        stageName: stage?.name || "Unknown",
        stageOrder: stage?.order ?? 0,
        propertyTitle,
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

export const listByStage = query({
  args: {
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    assignment: v.optional(v.literal("unassigned")),
    scoreMin: v.optional(v.number()),
    scoreMax: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = isEffectiveAdmin(user);

    // Fetch all stages for this org
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const sortedStages = stages.sort((a, b) => a.order - b.order);

    // Fetch leads
    let results;
    if (args.q && args.q.trim().length > 0) {
      const qTrim = args.q.trim();
      results = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) =>
          q.search("fullName", qTrim).eq("orgId", user.orgId)
        )
        .collect();
      if (results.length === 0) {
        const pool = !isAdmin
          ? await ownAndUnassignedLeads(ctx, user._id, user.orgId)
          : await ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect();
        const qLower = qTrim.toLowerCase();
        const digits = qTrim.replace(/\D/g, "");
        results = pool.filter((lead) => {
          if (lead.isArchived) return false;
          if (lead.orgId && lead.orgId !== user.orgId) return false;
          if (!isAdmin && lead.ownerUserId !== user._id && !lead.isUnassigned) return false;
          const nameMatch = lead.fullName.toLowerCase().includes(qLower);
          const emailMatch = lead.email?.toLowerCase().includes(qLower) ?? false;
          const phoneMatch =
            (lead.phone && lead.phone.includes(qTrim)) ||
            (digits.length > 0 && lead.normalizedPhone && lead.normalizedPhone.includes(digits));
          return nameMatch || emailMatch || phoneMatch;
        });
      }
    } else if (args.assignment === "unassigned") {
      results = await ctx.db
        .query("leads")
        .withIndex("by_org_unassigned", (q) => q.eq("orgId", user.orgId).eq("isUnassigned", true))
        .collect();
    } else if (!isAdmin) {
      results = await ownAndUnassignedLeads(ctx, user._id, user.orgId);
    } else if (args.ownerUserId) {
      results = await ctx.db.query("leads").withIndex("by_owner", (q) => q.eq("ownerUserId", args.ownerUserId!)).collect();
    } else {
      results = await ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect();
    }

    // Filter
    const filtered = results.filter((lead) => {
      if (lead.isArchived) return false;
      if (lead.orgId && lead.orgId !== user.orgId) return false;
      if (!isAdmin && lead.ownerUserId !== user._id && !lead.isUnassigned) return false;
      if (args.assignment === "unassigned" && !lead.isUnassigned) return false;
      if (args.ownerUserId && (lead.isUnassigned || lead.ownerUserId !== args.ownerUserId)) return false;
      if (args.interestType && lead.interestType !== args.interestType) return false;
      if (args.scoreMin !== undefined && (lead.score ?? 0) < args.scoreMin) return false;
      if (args.scoreMax !== undefined && (lead.score ?? 0) > args.scoreMax) return false;
      return true;
    });

    // Enrich with owner names
    const users = await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const enriched = filtered.map((lead) => {
      return {
        _id: lead._id,
        contactId: lead.contactId,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        interestType: lead.interestType,
        score: lead.score,
        stageId: lead.stageId,
        ownerUserId: lead.ownerUserId,
        isUnassigned: lead.isUnassigned,
        interestNeedsReview: lead.interestNeedsReview,
        ownerName: ownerLabel(lead, userMap),
        budgetMin: lead.budgetMin,
        budgetMax: lead.budgetMax,
        budgetCurrency: lead.budgetCurrency,
        preferredAreas: lead.preferredAreas,
        closedAt: lead.closedAt,
        closeReason: lead.closeReason,
        updatedAt: lead.updatedAt,
        createdAt: lead.createdAt,
        lastActivityAt: lead.lastActivityAt,
      };
    });

    // Group by stage
    const stageMap = new Map<string, typeof enriched>();
    for (const stage of sortedStages) {
      stageMap.set(stage._id as string, []);
    }
    for (const lead of enriched) {
      const bucket = stageMap.get(lead.stageId as string);
      if (bucket) {
        bucket.push(lead);
      }
    }

    // Sort leads within each stage by updatedAt descending
    for (const bucket of stageMap.values()) {
      bucket.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return {
      stages: sortedStages.map((s) => ({
        _id: s._id,
        name: s.name,
        order: s.order,
        isTerminal: s.isTerminal,
        terminalOutcome: s.terminalOutcome,
      })),
      columns: Object.fromEntries(stageMap),
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
      lead.isUnassigned ? null : ctx.db.get(lead.ownerUserId),
    ]);
    return { lead, stage, owner };
  },
});

export const update = mutation({
  args: {
    leadId: v.id("leads"),
    source: v.optional(leadSourceValidator),
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
    if (args.source) {
      updated.source = args.source;
      // Naming the real source resolves the review flag set by the
      // flagLegacyPortalLeads migration.
      if (args.source !== LEGACY_PORTAL_SOURCE) updated.sourceNeedsReview = undefined;
    }
    if (args.interestType) {
      updated.interestType = args.interestType;
      updated.interestNeedsReview = undefined;
    }
    if (args.budgetCurrency !== undefined) updated.budgetCurrency = args.budgetCurrency;
    if (args.budgetMin !== undefined) updated.budgetMin = args.budgetMin;
    if (args.budgetMax !== undefined) updated.budgetMax = args.budgetMax;
    if (args.preferredAreas) updated.preferredAreas = canonicalizeAreas(args.preferredAreas);
    await ctx.db.patch(args.leadId, updated);
  },
});

/**
 * Edit a lead's details after creation. Name / phone / email are denormalised
 * from the contact, so they are written to the lead, its contact and every
 * sibling lead of that contact; preference fields stay on this lead only.
 * Owner or admin may edit (same gate as `update`).
 */
export const updateDetails = mutation({
  args: {
    leadId: v.id("leads"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()), // "" clears
    email: v.optional(v.string()), // "" clears
    source: v.optional(leadSourceValidator),
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    budgetCurrency: v.optional(v.string()),
    budgetMin: v.optional(v.union(v.number(), v.null())), // null clears
    budgetMax: v.optional(v.union(v.number(), v.null())),
    preferredAreas: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    // Assigned agent. An admin may assign anyone active in the org; an agent
    // may only take an unassigned lead for themselves.
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = user.role === "admin";
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, isAdmin, user.orgId);
    if (!lead) {
      throw new Error("Lead not found");
    }

    // Resolve an assignment change before touching anything.
    let newOwner: Doc<"users"> | null = null;
    const ownerChanging =
      args.ownerUserId !== undefined &&
      (lead.isUnassigned || args.ownerUserId !== lead.ownerUserId);
    if (ownerChanging) {
      if (!isAdmin && !(lead.isUnassigned && args.ownerUserId === user._id)) {
        throw new Error("Only an admin can reassign a lead. You can take an unassigned lead for yourself.");
      }
      newOwner = await ctx.db.get(args.ownerUserId!);
      if (!newOwner || newOwner.orgId !== user.orgId || !newOwner.isActive) {
        throw new Error("Choose an active agent in your organisation");
      }
    }

    // Past the first stage a lead must stay contactable (see moveStage).
    const stage = (await ctx.db.get(lead.stageId as Id<"pipelineStages">)) as { order: number } | null;
    const requireContactInfo = !!stage && stage.order > 1;

    const { leadId: _leadId, ownerUserId: _owner, ...input } = args;
    void _leadId;
    void _owner;
    const result = buildLeadDetailsPatch(lead, input, {
      canonicalizeAreas,
      requireContactInfo,
    });
    if (result.error) {
      throw new Error(result.error);
    }
    if (newOwner) {
      result.leadPatch.ownerUserId = newOwner._id;
      result.leadPatch.isUnassigned = undefined;
      result.changedFields.push("assignedAgent");
    }
    if (result.changedFields.length === 0 && Object.keys(result.leadPatch).length === 0) {
      return { changedFields: [] as string[] };
    }

    const now = Date.now();
    await ctx.db.patch(args.leadId, { ...result.leadPatch, updatedAt: now });

    // The new agent also needs the contact behind the lead.
    if (newOwner) {
      const contact = await ctx.db.get(lead.contactId as Id<"contacts">);
      if (contact && !contact.ownerUserIds.includes(newOwner._id)) {
        await ctx.db.patch(contact._id, {
          ownerUserIds: [...contact.ownerUserIds, newOwner._id],
          updatedAt: now,
        });
      }
    }

    // Let the newly assigned agent know (never notify yourself).
    if (newOwner && newOwner._id !== user._id) {
      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: newOwner._id,
        title: "Lead assigned to you",
        body: `${(result.leadPatch.fullName as string | undefined) ?? lead.fullName} was assigned to you.`,
        url: `/app/leads/${args.leadId}`,
        tag: `lead-${args.leadId}`,
      });
    }

    // Keep the contact and the other leads for this contact in step.
    if (Object.keys(result.identityPatch).length > 0) {
      const contact = await ctx.db.get(lead.contactId);
      if (contact) {
        const contactPatch: Record<string, unknown> = { updatedAt: now };
        if (result.identityPatch.fullName !== undefined) contactPatch.name = result.identityPatch.fullName;
        if ("phone" in result.identityPatch) {
          contactPatch.phone = result.identityPatch.phone;
          contactPatch.normalizedPhone = result.identityPatch.normalizedPhone;
        }
        if ("email" in result.identityPatch) contactPatch.email = result.identityPatch.email;
        await ctx.db.patch(contact._id, contactPatch);
      }
      const siblings = await ctx.db
        .query("leads")
        .withIndex("by_contact", (q) => q.eq("contactId", lead.contactId))
        .collect();
      for (const sibling of siblings) {
        if (sibling._id === lead._id) continue;
        await ctx.db.patch(sibling._id, { ...result.identityPatch, updatedAt: now });
      }
    }

    // Email, budget, areas and notes all feed the score.
    await computeAndStoreScore(ctx, args.leadId, user.orgId);

    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "lead.update",
      category: "lead",
      description: `Updated ${result.changedFields.join(", ")} on lead "${
        (result.leadPatch.fullName as string | undefined) ?? lead.fullName
      }"`,
      targetType: "lead",
      targetId: args.leadId,
      targetLabel: (result.leadPatch.fullName as string | undefined) ?? lead.fullName,
      metadata: {
        changedFields: result.changedFields,
        ...(newOwner ? { assignedTo: newOwner.fullName || newOwner.name || newOwner.email } : {}),
      },
      orgId: user.orgId,
    });

    return { changedFields: result.changedFields };
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

    // Enforce contact info when moving beyond the initial (order 1) stage
    const currentStage = await ctx.db.get(lead.stageId) as { order: number } | null;
    const targetStage = stage as unknown as { order: number };
    const isLeavingInitialStage = currentStage && currentStage.order === 1 && targetStage.order > 1;
    if (isLeavingInitialStage) {
      const contact = await ctx.db.get(lead.contactId) as { phone?: string; email?: string } | null;
      if (contact && !contact.phone && !contact.email) {
        throw new Error(
          "MISSING_CONTACT_INFO: For the sake of data consistency, you can't move a lead further down the pipeline without any contact information. Please add a phone number or email to the contact first."
        );
      }
    }

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

          // Create commission record. Splits are shares of the commission
          // pool (COMMISSION_RATE of the sale value), not of the sale value.
          const propPercent = sharedConfig?.propertyAgentPercent ?? 40;
          const leadPercent = sharedConfig?.leadAgentPercent ?? 40;
          const compPercent = sharedConfig?.companyPercent ?? 20;
          const split = computeCommissionSplit(args.dealValue, {
            propertyAgentPercent: propPercent,
            leadAgentPercent: leadPercent,
            companyPercent: compPercent,
          });

          await ctx.db.insert("dealCommissions", {
            leadId: args.leadId,
            propertyId: share.propertyId,
            propertyShareId: share._id,
            commissionConfigId: sharedConfig?._id,
            dealValue: args.dealValue,
            dealCurrency,
            commissionRate: COMMISSION_RATE,
            commissionAmount: split.commissionAmount,
            propertyAgentUserId: share.sharedByUserId,
            propertyAgentPercent: propPercent,
            propertyAgentAmount: split.propertyAgentAmount,
            leadAgentUserId: share.sharedWithUserId,
            leadAgentPercent: leadPercent,
            leadAgentAmount: split.leadAgentAmount,
            companyPercent: compPercent,
            companyAmount: split.companyAmount,
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
        const split = computeCommissionSplit(args.dealValue, {
          propertyAgentPercent: propPercent,
          leadAgentPercent: leadPercent,
          companyPercent: compPercent,
        });

        await ctx.db.insert("dealCommissions", {
          leadId: args.leadId,
          propertyId,
          commissionConfigId: config?._id,
          dealValue: args.dealValue,
          dealCurrency,
          commissionRate: COMMISSION_RATE,
          commissionAmount: split.commissionAmount,
          propertyAgentUserId: scenario === "own_property_own_lead" ? undefined : propertyAgentId,
          propertyAgentPercent: propPercent,
          propertyAgentAmount: split.propertyAgentAmount,
          leadAgentUserId: lead.ownerUserId,
          leadAgentPercent: leadPercent,
          leadAgentAmount: split.leadAgentAmount,
          companyPercent: compPercent,
          companyAmount: split.companyAmount,
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

    // Handle "Under Contract" stage — mark matched properties as "under_offer"
    const isUnderContract = !stage.isTerminal && stage.name.toLowerCase() === "under contract";
    if (isUnderContract) {
      const ucMatches = await ctx.db
        .query("leadPropertyMatches")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();
      for (const match of ucMatches) {
        const property = await ctx.db.get(match.propertyId);
        if (property && property.status === "available") {
          await ctx.db.patch(match.propertyId, {
            status: "under_offer" as const,
            updatedAt: now,
          });
        }
      }
    }

    // Auto-close other leads pointing to the same property when won or under contract
    const isWon = stage.isTerminal && stage.terminalOutcome === "won";
    if (isWon || isUnderContract) {
      const thisLeadMatches = await ctx.db
        .query("leadPropertyMatches")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();
      const thisPropertyIds = thisLeadMatches.map((m) => m.propertyId as string);

      if (thisPropertyIds.length > 0) {
        // Find the lost stage for auto-closing
        const allStages = await ctx.db
          .query("pipelineStages")
          .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
          .collect();
        const lostStage = allStages.find((s) => s.isTerminal && s.terminalOutcome === "lost");

        if (lostStage) {
          // Find all other leads in the org that share these properties
          const allPropertyMatches = await ctx.db
            .query("leadPropertyMatches")
            .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
            .collect();
          const competingLeadIds = new Set(
            allPropertyMatches
              .filter(
                (m) =>
                  thisPropertyIds.includes(m.propertyId as string) &&
                  m.leadId !== args.leadId
              )
              .map((m) => m.leadId as string)
          );

          for (const competingLeadId of competingLeadIds) {
            const competingLead = await ctx.db.get(competingLeadId as Id<"leads">);
            if (
              competingLead &&
              !competingLead.isArchived &&
              !competingLead.closedAt &&
              competingLead.orgId === user.orgId
            ) {
              await ctx.db.patch(competingLeadId as Id<"leads">, {
                stageId: lostStage._id,
                closedAt: now,
                closeReason: isWon
                  ? "Property sold/let to another lead"
                  : "Property under contract with another lead",
                updatedAt: now,
              });
            }
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

export const updateCloseDetails = mutation({
  args: {
    leadId: v.id("leads"),
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

    // Only allow updating close details on leads that are already in a terminal stage
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const stage = stages.find((s) => s._id === lead.stageId);
    if (!stage || !stage.isTerminal) {
      throw new Error("Lead is not in a closed stage");
    }

    const now = Date.now();
    const updated: Record<string, unknown> = {
      updatedAt: now,
    };
    if (args.closeReason !== undefined) updated.closeReason = args.closeReason;
    if (args.dealValue !== undefined) updated.dealValue = args.dealValue;
    if (args.dealCurrency !== undefined) updated.dealCurrency = args.dealCurrency;

    await ctx.db.patch(args.leadId, updated);

    // Auto-generate commission records when deal is won and dealValue is provided
    if (stage.terminalOutcome === "won" && args.dealValue && args.dealValue > 0) {
      const dealCurrency = args.dealCurrency || "USD";

      // Check if commission records already exist for this lead
      const existingCommissions = await ctx.db
        .query("dealCommissions")
        .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
        .collect();

      // Only create commissions if none exist yet
      if (existingCommissions.length === 0) {
        const shares = await ctx.db
          .query("propertyShares")
          .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
          .collect();

        const activeShares = shares.filter(
          (s) => (s.status === "active" || s.status === "closed_won") && (!s.orgId || s.orgId === user.orgId)
        );

        const configs = await ctx.db
          .query("commissionConfigs")
          .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
          .collect();

        if (activeShares.length > 0) {
          const sharedConfig = configs.find(
            (c) => c.scenario === "shared_deal" && c.isDefault
          ) || configs.find((c) => c.scenario === "shared_deal");

          for (const share of activeShares) {
            if (share.status === "active") {
              await ctx.db.patch(share._id, {
                status: "closed_won",
                dealValue: args.dealValue,
                dealCurrency,
                closedAt: now,
                updatedAt: now,
              });
            }

            const property = await ctx.db.get(share.propertyId);
            if (property) {
              await ctx.db.patch(share.propertyId, {
                status: property.listingType === "sale" ? "sold" : "off_market",
                updatedAt: now,
              });
            }

            const propPercent = sharedConfig?.propertyAgentPercent ?? 40;
            const leadPercent = sharedConfig?.leadAgentPercent ?? 40;
            const compPercent = sharedConfig?.companyPercent ?? 20;
            const split = computeCommissionSplit(args.dealValue, {
              propertyAgentPercent: propPercent,
              leadAgentPercent: leadPercent,
              companyPercent: compPercent,
            });

            await ctx.db.insert("dealCommissions", {
              leadId: args.leadId,
              propertyId: share.propertyId,
              propertyShareId: share._id,
              commissionConfigId: sharedConfig?._id,
              dealValue: args.dealValue,
              dealCurrency,
              commissionRate: COMMISSION_RATE,
              commissionAmount: split.commissionAmount,
              propertyAgentUserId: share.sharedByUserId,
              propertyAgentPercent: propPercent,
              propertyAgentAmount: split.propertyAgentAmount,
              leadAgentUserId: share.sharedWithUserId,
              leadAgentPercent: leadPercent,
              leadAgentAmount: split.leadAgentAmount,
              companyPercent: compPercent,
              companyAmount: split.companyAmount,
              status: "pending",
              orgId: user.orgId,
              createdAt: now,
            });
          }
        } else {
          const matches = await ctx.db
            .query("leadPropertyMatches")
            .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
            .collect();

          let scenario: "own_property_own_lead" | "company_property" | "shared_deal" = "company_property";
          let propertyAgentId: Id<"users"> | undefined;
          let propertyId: Id<"properties"> | undefined;

          if (matches.length > 0) {
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
          const split = computeCommissionSplit(args.dealValue, {
            propertyAgentPercent: propPercent,
            leadAgentPercent: leadPercent,
            companyPercent: compPercent,
          });

          await ctx.db.insert("dealCommissions", {
            leadId: args.leadId,
            propertyId,
            commissionConfigId: config?._id,
            dealValue: args.dealValue,
            dealCurrency,
            commissionRate: COMMISSION_RATE,
            commissionAmount: split.commissionAmount,
            propertyAgentUserId: scenario === "own_property_own_lead" ? undefined : propertyAgentId,
            propertyAgentPercent: propPercent,
            propertyAgentAmount: split.propertyAgentAmount,
            leadAgentUserId: lead.ownerUserId,
            leadAgentPercent: leadPercent,
            leadAgentAmount: split.leadAgentAmount,
            companyPercent: compPercent,
            companyAmount: split.companyAmount,
            status: "pending",
            orgId: user.orgId,
            createdAt: now,
          });

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
    }
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

    // Validate uniqueness of contact-property pairs
    if (args.propertyIds && args.propertyIds.length > 0) {
      const existingLeads = await ctx.db
        .query("leads")
        .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
        .collect();
      const activeLeadIds = existingLeads
        .filter((l) => !l.isArchived && l.orgId === user.orgId)
        .map((l) => l._id);

      if (activeLeadIds.length > 0) {
        const allMatches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
          .collect();
        const existingPropertyIds = new Set(
          allMatches
            .filter((m) => activeLeadIds.some((id) => id === m.leadId))
            .map((m) => m.propertyId as string)
        );

        const duplicateNames: string[] = [];
        for (const propertyId of args.propertyIds) {
          if (existingPropertyIds.has(propertyId as string)) {
            const property = await ctx.db.get(propertyId);
            duplicateNames.push(property?.title || "Unknown property");
          }
        }
        if (duplicateNames.length > 0) {
          throw new Error(
            `This contact already has leads for: ${duplicateNames.join(", ")}. Each contact-property pair must be unique.`
          );
        }
      }
    }

    // Each contact-property pair is its own lead
    if (args.propertyIds && args.propertyIds.length > 0) {
      const leadIds: Id<"leads">[] = [];
      for (const propertyId of args.propertyIds) {
        const property = await ctx.db.get(propertyId);
        if (!property) continue;
        assertOrgAccess(property, user.orgId);

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
          preferredAreas: canonicalizeAreas(args.preferredAreas),
          notes: args.notes,
          stageId: args.stageId,
          ownerUserId: ownerId,
          orgId: user.orgId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await ctx.db.insert("leadPropertyMatches", {
          leadId,
          propertyId,
          matchType: "requested",
          createdByUserId: user._id,
          orgId: user.orgId,
          createdAt: timestamp,
        });

        leadIds.push(leadId);
      }
      // Score all created leads
      for (const lid of leadIds) {
        await computeAndStoreScore(ctx, lid, user.orgId);
      }
      // One consolidated push when assigning to another agent.
      if (ownerId !== user._id && leadIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
          userId: ownerId,
          title:
            leadIds.length === 1 ? "New lead assigned" : "New leads assigned",
          body:
            leadIds.length === 1
              ? `${contact.name} was assigned to you.`
              : `${leadIds.length} leads for ${contact.name} were assigned to you.`,
          url: `/app/leads/${leadIds[0]}`,
          tag: `lead-${leadIds[0]}`,
        });
      }
      return leadIds[0];
    } else {
      // No properties — create a single lead
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
        preferredAreas: canonicalizeAreas(args.preferredAreas),
        notes: args.notes,
        stageId: args.stageId,
        ownerUserId: ownerId,
        orgId: user.orgId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await computeAndStoreScore(ctx, leadId, user.orgId);
      if (ownerId !== user._id) {
        await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
          userId: ownerId,
          title: "New lead assigned",
          body: `${contact.name} was assigned to you.`,
          url: `/app/leads/${leadId}`,
          tag: `lead-${leadId}`,
        });
      }
      return leadId;
    }
  },
});

export const statsSummary = query({
  args: { ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = isEffectiveAdmin(user);

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
    const isAdmin = isEffectiveAdmin(user);

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
    const isAdmin = isEffectiveAdmin(user);

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

export const getOpenLeadsForContact = query({
  args: {
    contactId: v.id("contacts"),
    excludeLeadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    const openLeads = leads.filter((lead) => {
      if (lead.isArchived) return false;
      if (lead.orgId !== user.orgId) return false;
      if (args.excludeLeadId && lead._id === args.excludeLeadId) return false;
      if (lead.closedAt) return false;
      return true;
    });

    const enriched = await Promise.all(
      openLeads.map(async (lead) => {
        const matches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .collect();
        const properties = (
          await Promise.all(
            matches.map(async (m) => {
              const p = await ctx.db.get(m.propertyId);
              return p ? { _id: p._id, title: p.title, location: p.location } : null;
            })
          )
        ).filter(Boolean);

        const stage = await ctx.db.get(lead.stageId);

        return {
          _id: lead._id,
          fullName: lead.fullName,
          interestType: lead.interestType,
          stageName: stage?.name || "Unknown",
          properties,
          createdAt: lead.createdAt,
        };
      })
    );

    return enriched;
  },
});

export const bulkCloseAsLost = mutation({
  args: {
    leadIds: v.array(v.id("leads")),
    closeReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const lostStage = stages.find((s) => s.isTerminal && s.terminalOutcome === "lost");
    if (!lostStage) throw new Error("No 'Lost' stage configured");

    const now = Date.now();
    let closedCount = 0;
    for (const leadId of args.leadIds) {
      const lead = await assertLeadAccess(ctx, leadId, user._id, user.role === "admin", user.orgId);
      if (!lead || lead.closedAt) continue;

      await ctx.db.patch(leadId, {
        stageId: lostStage._id,
        closedAt: now,
        closeReason: args.closeReason || "Contact chose another property",
        updatedAt: now,
      });
      closedCount++;
    }

    return { closedCount };
  },
});

// ── Lead source review ───────────────────────────────────────────────
// Leads that still carry the retired generic "property_portal" source, so an
// agent can reassign them to the real platform. Role-scoped the same way the
// main leads list is: admins see the whole org, agents see only their own.
export const listNeedsSourceReview = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const isAdmin = isEffectiveAdmin(user);

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const flagged = leads.filter(
      (l) =>
        l.sourceNeedsReview === true &&
        !l.isArchived &&
        (isAdmin || l.ownerUserId === user._id)
    );

    const owners = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const ownerMap = new Map(owners.map((u) => [u._id, u]));

    const items = flagged
      .map((l) => {
        const owner = ownerMap.get(l.ownerUserId);
        return {
          _id: l._id,
          fullName: l.fullName,
          phone: l.phone,
          email: l.email,
          source: l.source,
          interestType: l.interestType,
          createdAt: l.createdAt,
          ownerName:
            owner?.fullName || owner?.name || owner?.email || "Unassigned",
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return { items, isAdmin };
  },
});

// Reassign the source on several leads at once and clear their review flag.
// Skips leads the caller can't access rather than failing the whole batch.
export const bulkSetSource = mutation({
  args: {
    leadIds: v.array(v.id("leads")),
    source: leadSourceValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const now = Date.now();

    let updatedCount = 0;
    for (const leadId of args.leadIds) {
      const lead = await assertLeadAccess(ctx, leadId, user._id, user.role === "admin", user.orgId);
      if (!lead) continue;

      await ctx.db.patch(leadId, {
        source: args.source,
        // Reassigning to a real platform resolves the review; picking the
        // generic bucket again leaves it flagged.
        sourceNeedsReview:
          args.source === LEGACY_PORTAL_SOURCE ? true : undefined,
        updatedAt: now,
      });
      updatedCount++;
    }

    return { updatedCount };
  },
});

/**
 * Delete a lead with its property matches and activities, freeing any
 * attached property no other open lead still references. Shared by
 * deleteLead, bulkDelete and contacts.bulkRemove. Caller checks access.
 */
export async function deleteLeadCascade(
  ctx: MutationCtx,
  leadId: Id<"leads">,
  orgId: Id<"organizations">
) {
  const matches = await ctx.db
    .query("leadPropertyMatches")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  if (matches.length > 0) {
    const orgMatches = await ctx.db
      .query("leadPropertyMatches")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const match of matches) {
      // Free the property unless another open (non-closed, non-archived)
      // lead still references it. Leads already deleted earlier in the same
      // bulk call read back as null here, so they don't hold it.
      const others = orgMatches.filter(
        (m) => m.propertyId === match.propertyId && m.leadId !== leadId
      );
      let hasActiveReference = false;
      for (const om of others) {
        const otherLead = await ctx.db.get(om.leadId);
        if (otherLead && !otherLead.isArchived && !otherLead.closedAt) {
          hasActiveReference = true;
          break;
        }
      }
      if (!hasActiveReference) {
        const property = await ctx.db.get(match.propertyId);
        if (property && property.status !== "available") {
          await ctx.db.patch(match.propertyId, { status: "available" as const, updatedAt: Date.now() });
        }
      }
      await ctx.db.delete(match._id);
    }
  }

  const activities = await ctx.db
    .query("activities")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  for (const activity of activities) {
    await ctx.db.delete(activity._id);
  }

  await ctx.db.delete(leadId);
}

/** Why the current user may not delete this lead, or null if they may. */
export function leadDeleteBlocker(
  lead: { orgId?: Id<"organizations">; ownerUserId: Id<"users">; isUnassigned?: boolean },
  user: { _id: Id<"users">; role: string; orgId: Id<"organizations"> }
): string | null {
  const isAdmin = user.role === "admin";
  if (lead.orgId && lead.orgId !== user.orgId) return "Not found";
  if (lead.isUnassigned) return isAdmin ? null : "Only an admin can delete an unassigned lead";
  if (!isAdmin && lead.ownerUserId !== user._id) return "Not your lead";
  return null;
}

export const deleteLead = mutation({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const lead = await assertLeadAccess(ctx, args.leadId, user._id, user.role === "admin", user.orgId);
    if (!lead) throw new Error("Lead not found");
    // Unassigned leads are shared with the whole org for working, not for
    // deleting: only an admin may remove one.
    if (lead.isUnassigned && user.role !== "admin") {
      throw new Error("Only an admin can delete an unassigned lead");
    }
    await deleteLeadCascade(ctx, args.leadId, user.orgId);
    return { deleted: true };
  },
});

/** Most leads one bulkDelete call handles; the page sends larger selections in chunks. */
const BULK_DELETE_LIMIT = 100;

/**
 * Delete several leads at once (the Leads list's select-and-delete). Same
 * rules as deleteLead, applied per lead: anything the user may not delete is
 * skipped and reported rather than failing the whole batch.
 */
export const bulkDelete = mutation({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (args.leadIds.length > BULK_DELETE_LIMIT) {
      throw new Error(`Delete at most ${BULK_DELETE_LIMIT} leads at a time`);
    }
    const deletedNames: string[] = [];
    const skipped: Array<{ leadId: Id<"leads">; name: string; reason: string }> = [];
    for (const leadId of Array.from(new Set(args.leadIds))) {
      const lead = await ctx.db.get(leadId);
      if (!lead) continue; // already gone
      const blocker = leadDeleteBlocker(lead, user);
      if (blocker) {
        skipped.push({ leadId, name: lead.fullName, reason: blocker });
        continue;
      }
      await deleteLeadCascade(ctx, leadId, user.orgId);
      deletedNames.push(lead.fullName);
    }
    if (deletedNames.length > 0) {
      await recordAudit(ctx, {
        actorUserId: user._id,
        actorLabel: user.fullName || user.name || user.email,
        action: "lead.bulk_delete",
        category: "lead",
        description: `Deleted ${deletedNames.length} lead${deletedNames.length === 1 ? "" : "s"}: ${deletedNames
          .slice(0, 20)
          .join(", ")}${deletedNames.length > 20 ? ", …" : ""}`,
        targetType: "lead",
        metadata: { count: deletedNames.length },
        orgId: user.orgId,
      });
    }
    return { deleted: deletedNames.length, skipped };
  },
});
