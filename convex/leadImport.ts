import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg } from "./helpers";
import { checkRateLimit } from "./rateLimit";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/[^\d]/g, "");
  return hasPlus ? "+" + digits : digits;
}

const sourceValues = [
  "walk_in", "referral", "facebook", "whatsapp", "website", "property_portal", "other",
] as const;

const interestValues = ["rent", "buy"] as const;

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
          (l) => normalizePhone(l.phone) === normPhone
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
    }> = [];

    for (const lead of activeLeads) {
      if (args.email) {
        const normEmail = normalizeEmail(args.email);
        if (lead.email && normalizeEmail(lead.email) === normEmail) {
          matches.push({
            leadId: lead._id,
            fullName: lead.fullName,
            email: lead.email,
            phone: lead.phone,
            reason: "Email match",
          });
          continue;
        }
      }
      if (args.phone) {
        const normPhone = normalizePhone(args.phone);
        if (normalizePhone(lead.phone) === normPhone) {
          matches.push({
            leadId: lead._id,
            fullName: lead.fullName,
            email: lead.email,
            phone: lead.phone,
            reason: "Phone match",
          });
        }
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
    rows: v.array(
      v.object({
        fullName: v.string(),
        phone: v.string(),
        email: v.optional(v.string()),
        source: v.string(),
        interestType: v.string(),
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

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };

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
        const source = sourceValues.includes(row.source as any)
          ? (row.source as (typeof sourceValues)[number])
          : "other";
        const interestType = interestValues.includes(row.interestType as any)
          ? (row.interestType as (typeof interestValues)[number])
          : "buy";

        let duplicateLead = null;
        if (row.email) {
          const normEmail = normalizeEmail(row.email);
          duplicateLead = activeLeads.find(
            (l) => l.email && normalizeEmail(l.email) === normEmail
          );
        }
        if (!duplicateLead) {
          duplicateLead = activeLeads.find(
            (l) => normalizePhone(l.phone) === normalizedPhoneVal
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
            await ctx.db.patch(duplicateLead._id, {
              fullName: row.fullName.trim(),
              phone: row.phone.trim(),
              normalizedPhone: normalizedPhoneVal,
              email: row.email?.trim() || duplicateLead.email,
              source,
              interestType,
              budgetCurrency: row.budgetCurrency || duplicateLead.budgetCurrency,
              budgetMin: row.budgetMin ?? duplicateLead.budgetMin,
              budgetMax: row.budgetMax ?? duplicateLead.budgetMax,
              preferredAreas: row.preferredAreas
                ? row.preferredAreas.split(",").map((a) => a.trim()).filter(Boolean)
                : duplicateLead.preferredAreas,
              notes: row.notes?.trim() || duplicateLead.notes,
              updatedAt: timestamp,
            });
            results.updated++;
            continue;
          }
        }

        const contactId = await ctx.db.insert("contacts", {
          name: row.fullName.trim(),
          phone: row.phone.trim(),
          normalizedPhone: normalizedPhoneVal,
          email: row.email?.trim(),
          ownerUserIds: [user._id],
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
          interestType,
          budgetCurrency: row.budgetCurrency || undefined,
          budgetMin: row.budgetMin,
          budgetMax: row.budgetMax,
          preferredAreas: row.preferredAreas
            ? row.preferredAreas.split(",").map((a) => a.trim()).filter(Boolean)
            : [],
          notes: row.notes?.trim() || "",
          stageId: defaultStage._id,
          ownerUserId: user._id,
          orgId: user.orgId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        results.created++;
      } catch (e: any) {
        results.errors.push({ row: i, message: e.message || "Unknown error" });
        results.failed++;
      }
    }

    return results;
  },
});
