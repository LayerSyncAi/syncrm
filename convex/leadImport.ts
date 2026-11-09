import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserWithOrg } from "./helpers";
import { checkRateLimit } from "./rateLimit";
import { canonicalizeAreas } from "./lib/locations";
import {
  leadSourceValidator,
  LEGACY_PORTAL_SOURCE,
  resolveImportSource,
} from "./lib/leadSources";
import {
  matchAgent,
  parseInterestType,
  type AgentCandidate,
  type AgentMatch,
} from "./lib/leadImportMatching";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/[^\d]/g, "");
  return hasPlus ? "+" + digits : digits;
}

/** Active members of the org, as candidates for the Primary Agent column. */
async function orgAgentCandidates(ctx: QueryCtx, orgId: Id<"organizations">): Promise<AgentCandidate[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return users
    .filter((u) => u.isActive)
    .map((u) => ({ id: u._id, name: u.fullName || u.name, email: u.email }));
}

/**
 * Preview of how each distinct Primary Agent value will resolve, so the
 * import page can show who each row goes to before anything is written.
 * bulkImport repeats the same matching server-side.
 */
export const previewAgentMatches = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const agents = await orgAgentCandidates(ctx, user.orgId);
    const unique = Array.from(new Set(args.names.map((n) => n.trim()).filter(Boolean))).slice(0, 500);
    return unique.map((name) => ({ name, match: matchAgent(name, agents) as AgentMatch }));
  },
});

export const checkDuplicates = query({
  args: {
    rows: v.array(
      v.object({
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        rowIndex: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const allLeads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const activeLeads = allLeads.filter((l) => !l.isArchived);

    const results: Array<{
      rowIndex: number;
      isDuplicate: boolean;
      reason: string;
      matchingLeadId: string | null;
      matchingLeadName: string | null;
    }> = [];

    for (const row of args.rows) {
      let isDuplicate = false;
      let reason = "";
      let matchingLeadId: string | null = null;
      let matchingLeadName: string | null = null;

      if (row.email) {
        const normEmail = normalizeEmail(row.email);
        const match = activeLeads.find(
          (l) => l.email && normalizeEmail(l.email) === normEmail
        );
        if (match) {
          isDuplicate = true;
          reason = `Email matches existing lead "${match.fullName}"`;
          matchingLeadId = match._id;
          matchingLeadName = match.fullName;
        }
      }

      if (!isDuplicate && row.phone) {
        const normPhone = normalizePhone(row.phone);
        const match = activeLeads.find(
          (l) => l.phone && normalizePhone(l.phone) === normPhone
        );
        if (match) {
          isDuplicate = true;
          reason = `Phone matches existing lead "${match.fullName}"`;
          matchingLeadId = match._id;
          matchingLeadName = match.fullName;
        }
      }

      results.push({
        rowIndex: row.rowIndex,
        isDuplicate,
        reason,
        matchingLeadId,
        matchingLeadName,
      });
    }

    return results;
  },
});

export const findDuplicatesForLead = query({
  args: {
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    excludeLeadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (!args.email && !args.phone) return [];

    const allLeads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const activeLeads = allLeads.filter(
      (l) => !l.isArchived && l._id !== args.excludeLeadId
    );

    const matches: Array<{
      leadId: string;
      fullName: string;
      email: string | undefined;
      phone: string;
      reason: string;
      propertyTitle: string | null;
    }> = [];

    for (const lead of activeLeads) {
      let reason: string | null = null;
      if (args.email) {
        const normEmail = normalizeEmail(args.email);
        if (lead.email && normalizeEmail(lead.email) === normEmail) {
          reason = "Email match";
        }
      }
      if (!reason && args.phone) {
        const normPhone = normalizePhone(args.phone);
        if (lead.phone && normalizePhone(lead.phone) === normPhone) {
          reason = "Phone match";
        }
      }
      if (reason) {
        // Look up the matched property for this lead
        const leadMatches = await ctx.db
          .query("leadPropertyMatches")
          .withIndex("by_lead", (q: any) => q.eq("leadId", lead._id))
          .first();
        let propertyTitle: string | null = null;
        if (leadMatches) {
          const property = await ctx.db.get(leadMatches.propertyId);
          propertyTitle = property?.title ?? null;
        }
        matches.push({
          leadId: lead._id,
          fullName: lead.fullName,
          email: lead.email,
          phone: lead.phone || "",
          reason,
          propertyTitle,
        });
      }
    }

    return matches;
  },
});

export const bulkImport = mutation({
  args: {
    mode: v.union(
      v.literal("create_only"),
      v.literal("upsert"),
      v.literal("skip_duplicates")
    ),
    // The source chosen for this upload. Every row is tagged with it unless
    // sourceMode is "column" and the row carries a recognisable source of its
    // own — so an imported list is never defaulted to "other" any more.
    batchSource: leadSourceValidator,
    sourceMode: v.optional(v.union(v.literal("batch"), v.literal("column"))),
    rows: v.array(
      v.object({
        fullName: v.string(),
        phone: v.string(),
        email: v.optional(v.string()),
        source: v.optional(v.string()),
        // Raw cell from the file ("To Let", "For Sale", ...). Empty or
        // unrecognised values are flagged for review, never defaulted.
        interestType: v.optional(v.string()),
        // Raw "Primary Agent" cell, resolved to an org member by name.
        primaryAgent: v.optional(v.string()),
        budgetCurrency: v.optional(v.string()),
        budgetMin: v.optional(v.number()),
        budgetMax: v.optional(v.number()),
        preferredAreas: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    await checkRateLimit(ctx, "importBulk", user._id);
    const timestamp = Date.now();

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    stages.sort((a, b) => a.order - b.order);
    const defaultStage = stages.find((s) => !s.isTerminal);
    if (!defaultStage) {
      throw new Error("No pipeline stages configured");
    }

    const existingLeads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const activeLeads = existingLeads.filter((l) => !l.isArchived);
    const agents = await orgAgentCandidates(ctx, user.orgId);

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ row: number; message: string }>,
      // Primary Agent outcomes (only counted for rows that carry a value).
      autoAssigned: 0,
      unassigned: 0,
      assignmentIssues: [] as Array<{
        row: number;
        value: string;
        reason: "ambiguous" | "not_found";
        candidates: string[];
      }>,
      // Rows whose interest type was empty or not recognised.
      interestFlagged: 0,
      interestIssues: [] as Array<{ row: number; value: string }>,
    };
    // New leads per auto-assigned agent, for one notification each.
    const assignedCounts = new Map<Id<"users">, number>();

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];

      try {
        if (!row.fullName?.trim()) {
          results.errors.push({ row: i, message: "Full name is required" });
          results.failed++;
          continue;
        }
        if (!row.phone?.trim()) {
          results.errors.push({ row: i, message: "Phone is required" });
          results.failed++;
          continue;
        }

        const normalizedPhoneVal = normalizePhone(row.phone);
        const source = resolveImportSource(
          row.source,
          args.batchSource,
          args.sourceMode ?? "batch"
        );
        // A CSV can still carry the retired generic portal bucket. Accept it
        // rather than losing the row, but flag it for reassignment to the real
        // platform — same treatment the migration gives historical leads.
        const sourceNeedsReview =
          source === LEGACY_PORTAL_SOURCE ? true : undefined;
        // Interest type: previously anything other than the literal "rent"
        // fell back to "buy", so portal wordings ("To Let", "Renting") all
        // became buyers. Read the wording; flag what we can't read.
        const parsedInterest = parseInterestType(row.interestType);
        const interestRaw = (row.interestType ?? "").trim();

        // Primary Agent → assigned agent. No value means "as before" (the
        // importer owns the lead); a value that resolves to nobody or to
        // several agents leaves the lead unassigned rather than guessing.
        const agentMatch = matchAgent(row.primaryAgent, agents);
        const matchedAgentId =
          agentMatch.status === "matched" ? (agentMatch.agentId as Id<"users">) : null;
        const agentIssue =
          agentMatch.status === "ambiguous" || agentMatch.status === "not_found"
            ? {
                row: i,
                value: (row.primaryAgent ?? "").trim(),
                reason: agentMatch.status,
                candidates: agentMatch.status === "ambiguous" ? agentMatch.candidates : [],
              }
            : null;

        let duplicateLead = null;
        if (row.email) {
          const normEmail = normalizeEmail(row.email);
          duplicateLead = activeLeads.find(
            (l) => l.email && normalizeEmail(l.email) === normEmail
          );
        }
        if (!duplicateLead) {
          duplicateLead = activeLeads.find(
            (l) => l.phone && normalizePhone(l.phone) === normalizedPhoneVal
          );
        }

        if (duplicateLead) {
          if (args.mode === "create_only") {
            results.errors.push({
              row: i,
              message: `Duplicate: matches "${duplicateLead.fullName}"`,
            });
            results.failed++;
            continue;
          }
          if (args.mode === "skip_duplicates") {
            results.skipped++;
            continue;
          }
          if (args.mode === "upsert") {
            // An existing lead keeps its owner unless the file names a clear
            // match; it keeps its interest type when the file's is unreadable.
            if (agentIssue) results.assignmentIssues.push(agentIssue);
            if (matchedAgentId) results.autoAssigned++;
            if (!parsedInterest && interestRaw) {
              results.interestFlagged++;
              results.interestIssues.push({ row: i, value: interestRaw });
            }
            await ctx.db.patch(duplicateLead._id, {
              fullName: row.fullName.trim(),
              phone: row.phone.trim(),
              normalizedPhone: normalizedPhoneVal,
              email: row.email?.trim() || duplicateLead.email,
              source,
              sourceNeedsReview,
              interestType: parsedInterest ?? duplicateLead.interestType,
              interestNeedsReview: parsedInterest
                ? undefined
                : interestRaw
                  ? true
                  : duplicateLead.interestNeedsReview,
              ...(matchedAgentId
                ? { ownerUserId: matchedAgentId, isUnassigned: undefined }
                : {}),
              budgetCurrency: row.budgetCurrency || duplicateLead.budgetCurrency,
              budgetMin: row.budgetMin ?? duplicateLead.budgetMin,
              budgetMax: row.budgetMax ?? duplicateLead.budgetMax,
              preferredAreas: row.preferredAreas
                ? canonicalizeAreas(row.preferredAreas.split(","))
                : duplicateLead.preferredAreas,
              notes: row.notes?.trim() || duplicateLead.notes,
              updatedAt: timestamp,
            });
            results.updated++;
            continue;
          }
        }

        const ownerUserId = matchedAgentId ?? user._id;
        const isUnassigned = agentIssue ? true : undefined;
        const contactId = await ctx.db.insert("contacts", {
          name: row.fullName.trim(),
          phone: row.phone.trim(),
          normalizedPhone: normalizedPhoneVal,
          email: row.email?.trim(),
          ownerUserIds:
            matchedAgentId && matchedAgentId !== user._id ? [user._id, matchedAgentId] : [user._id],
          createdByUserId: user._id,
          orgId: user.orgId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await ctx.db.insert("leads", {
          contactId,
          fullName: row.fullName.trim(),
          phone: row.phone.trim(),
          normalizedPhone: normalizedPhoneVal,
          email: row.email?.trim(),
          source,
          sourceNeedsReview,
          // "buy" is only a placeholder when flagged: the lead shows
          // "Interest type needs review" until an agent confirms it.
          interestType: parsedInterest ?? "buy",
          interestNeedsReview: parsedInterest ? undefined : true,
          budgetCurrency: row.budgetCurrency || undefined,
          budgetMin: row.budgetMin,
          budgetMax: row.budgetMax,
          preferredAreas: row.preferredAreas
            ? canonicalizeAreas(row.preferredAreas.split(","))
            : [],
          notes: row.notes?.trim() || "",
          stageId: defaultStage._id,
          ownerUserId,
          isUnassigned,
          orgId: user.orgId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        results.created++;
        if (matchedAgentId) {
          results.autoAssigned++;
          if (matchedAgentId !== user._id) {
            assignedCounts.set(matchedAgentId, (assignedCounts.get(matchedAgentId) ?? 0) + 1);
          }
        }
        if (agentIssue) {
          results.unassigned++;
          results.assignmentIssues.push(agentIssue);
        }
        if (!parsedInterest) {
          results.interestFlagged++;
          results.interestIssues.push({ row: i, value: interestRaw });
        }
      } catch (e: any) {
        results.errors.push({ row: i, message: e.message || "Unknown error" });
        results.failed++;
      }
    }

    for (const [agentId, count] of assignedCounts) {
      await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
        userId: agentId,
        title: count === 1 ? "New lead assigned" : `${count} new leads assigned`,
        body: `${count === 1 ? "A lead was" : `${count} leads were`} imported and assigned to you.`,
        url: "/app/leads",
        tag: `lead-import-${timestamp}`,
      });
    }

    return results;
  },
});
