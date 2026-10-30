/**
 * SyncWorth comparables database (VW-30..35): sale, rental and valuation
 * evidence private to the firm, and the comparables chosen for each job with
 * the valuer's adjustment (stored structured for the v2 AI).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { recordAudit } from "../logs";
import { WorthAccess, displayName, getVisibleJob, requireCap, requireWorker, requireWorth } from "./access";
import { auditActor } from "./jobs";
import { isEditableStatus, isIsoDate, normaliseSuburb } from "./lib";
import { worthCurrency } from "../schemas/worth";

const kind = v.union(v.literal("sale"), v.literal("rental"), v.literal("valuation"));

const editable = {
  kind,
  address: v.string(),
  suburb: v.string(),
  propertyType: v.string(),
  landSizeM2: v.optional(v.number()),
  buildingSizeM2: v.optional(v.number()),
  bedrooms: v.optional(v.number()),
  price: v.optional(v.number()),
  rent: v.optional(v.number()),
  forcedSaleValue: v.optional(v.number()),
  currency: worthCurrency,
  date: v.string(),
  sourceNote: v.optional(v.string()),
  notes: v.optional(v.string()),
  externalRef: v.optional(v.string()),
};

type EditableFields = {
  kind: Doc<"worthComparables">["kind"];
  address: string;
  suburb: string;
  propertyType: string;
  landSizeM2?: number;
  buildingSizeM2?: number;
  bedrooms?: number;
  price?: number;
  rent?: number;
  forcedSaleValue?: number;
  currency: Doc<"worthComparables">["currency"];
  date: string;
  sourceNote?: string;
  notes?: string;
  externalRef?: string;
};

/** Validate and tidy a comparable; throws a readable error. */
function cleanComparable(f: EditableFields, label = "") {
  const at = label ? `${label}: ` : "";
  const address = f.address.trim();
  const suburb = f.suburb.trim();
  if (!address) throw new ConvexError(`${at}address is required`);
  if (!suburb) throw new ConvexError(`${at}suburb is required`);
  if (!isIsoDate(f.date)) throw new ConvexError(`${at}enter the date as YYYY-MM-DD`);
  for (const n of [f.landSizeM2, f.buildingSizeM2, f.price, f.rent, f.forcedSaleValue, f.bedrooms]) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) throw new ConvexError(`${at}numbers must be positive`);
  }
  if (!(f.price && f.price > 0) && !(f.rent && f.rent > 0)) {
    throw new ConvexError(`${at}enter a price, value or rent`);
  }
  return {
    kind: f.kind,
    address,
    suburb,
    suburbKey: normaliseSuburb(suburb),
    propertyType: f.propertyType.trim() || "Other",
    landSizeM2: f.landSizeM2 || undefined,
    buildingSizeM2: f.buildingSizeM2 || undefined,
    bedrooms: f.bedrooms,
    price: f.price || undefined,
    rent: f.rent || undefined,
    forcedSaleValue: f.forcedSaleValue || undefined,
    currency: f.currency,
    date: f.date,
    sourceNote: f.sourceNote?.trim() || undefined,
    notes: f.notes?.trim() || undefined,
    externalRef: f.externalRef?.trim() || undefined,
  };
}

function requireEvidence(access: WorthAccess) {
  requireCap(access, "seesEvidence", "Comparables are open to the valuation team only");
}

function view(c: Doc<"worthComparables">, jobRef?: string) {
  return {
    _id: c._id,
    kind: c.kind,
    source: c.source,
    address: c.address,
    suburb: c.suburb,
    propertyType: c.propertyType,
    landSizeM2: c.landSizeM2,
    buildingSizeM2: c.buildingSizeM2,
    bedrooms: c.bedrooms,
    price: c.price,
    rent: c.rent,
    forcedSaleValue: c.forcedSaleValue,
    currency: c.currency,
    date: c.date,
    sourceNote: c.sourceNote,
    notes: c.notes,
    externalRef: c.externalRef,
    jobId: c.jobId,
    jobRef,
  };
}

/** VW-32: search by suburb, type, size, value and date. */
export const search = query({
  args: {
    kind: v.optional(kind),
    suburb: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    minSize: v.optional(v.number()),
    maxSize: v.optional(v.number()),
    sizeBasis: v.optional(v.union(v.literal("land"), v.literal("building"))),
    minValue: v.optional(v.number()),
    maxValue: v.optional(v.number()),
    currency: v.optional(worthCurrency),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireEvidence(access);
    const from = args.from && isIsoDate(args.from) ? args.from : "0000-00-00";
    const to = args.to && isIsoDate(args.to) ? args.to : "9999-12-31";
    // Newest first through the date index; the remaining filters run in
    // memory, which is fine at the size of one firm's evidence.
    const rows = await ctx.db
      .query("worthComparables")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", from).lte("date", to))
      .order("desc")
      .take(5000);
    const suburb = args.suburb ? normaliseSuburb(args.suburb) : "";
    const type = args.propertyType?.trim().toLowerCase() ?? "";
    const basis = args.sizeBasis ?? "building";
    const hits = rows.filter((c) => {
      if (args.kind && c.kind !== args.kind) return false;
      if (suburb && !c.suburbKey.includes(suburb)) return false;
      if (type && !c.propertyType.toLowerCase().includes(type)) return false;
      if (args.currency && c.currency !== args.currency) return false;
      const size = basis === "land" ? c.landSizeM2 : c.buildingSizeM2;
      if (args.minSize !== undefined && (size ?? -1) < args.minSize) return false;
      if (args.maxSize !== undefined && (size ?? Infinity) > args.maxSize) return false;
      const value = c.kind === "rental" ? c.rent : c.price ?? c.rent;
      if (args.minValue !== undefined && (value ?? -1) < args.minValue) return false;
      if (args.maxValue !== undefined && (value ?? Infinity) > args.maxValue) return false;
      return true;
    });
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
    const page = hits.slice(0, limit);
    const refs = new Map<Id<"worthJobs">, string>();
    for (const c of page) {
      if (c.jobId && !refs.has(c.jobId)) {
        const job = await ctx.db.get(c.jobId);
        if (job) refs.set(c.jobId, job.reference);
      }
    }
    return {
      total: hits.length,
      items: page.map((c) => view(c, c.jobId ? refs.get(c.jobId) : undefined)),
      canEdit: access.caps.canEditEvidence,
    };
  },
});

export const create = mutation({
  args: editable,
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canEditEvidence", "Your role cannot add comparables");
    const now = Date.now();
    return ctx.db.insert("worthComparables", {
      orgId: access.orgId,
      ...cleanComparable(args),
      source: "manual",
      createdByUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function editableComparable(ctx: MutationCtx, access: WorthAccess, id: Id<"worthComparables">) {
  requireCap(access, "canEditEvidence", "Your role cannot edit comparables");
  const c = await ctx.db.get(id);
  if (!c || c.orgId !== access.orgId) throw new ConvexError("Comparable not found");
  // Evidence from the firm's own issued valuations follows the job, not edits.
  if (c.source === "own_valuation") throw new ConvexError("Evidence from an issued valuation cannot be edited");
  return c;
}

export const update = mutation({
  args: { comparableId: v.id("worthComparables"), ...editable },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const { comparableId, ...fields } = args;
    const c = await editableComparable(ctx, access, comparableId);
    await ctx.db.patch(c._id, { ...cleanComparable(fields), updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { comparableId: v.id("worthComparables") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const c = await editableComparable(ctx, access, args.comparableId);
    const used = await ctx.db
      .query("worthJobComparables")
      .withIndex("by_comparable", (q) => q.eq("comparableId", c._id))
      .first();
    if (used) throw new ConvexError("This comparable is used on a job and is kept as evidence");
    await ctx.db.delete(c._id);
  },
});

/** VW-34: import comparables and past valuations parsed from Excel in the browser. */
export const importBatch = mutation({
  args: { rows: v.array(v.object({ rowNumber: v.number(), ...editable })) },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canEditEvidence", "Your role cannot import comparables");
    if (args.rows.length > 200) throw new ConvexError("Import at most 200 rows at a time");
    const now = Date.now();
    const errors: Array<{ rowNumber: number; message: string }> = [];
    let imported = 0;
    for (const { rowNumber, ...row } of args.rows) {
      try {
        const clean = cleanComparable(row, `Row ${rowNumber}`);
        await ctx.db.insert("worthComparables", {
          orgId: access.orgId,
          ...clean,
          source: "import",
          createdByUserId: access.user._id,
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      } catch (e) {
        errors.push({ rowNumber, message: e instanceof ConvexError ? String(e.data) : "Invalid row" });
      }
    }
    if (imported > 0) {
      await recordAudit(ctx, {
        ...auditActor(access),
        action: "worth.comparables_import",
        category: "worth",
        description: `Imported ${imported} comparables from a spreadsheet`,
        orgId: access.orgId,
        metadata: { imported, rejected: errors.length },
      });
    }
    return { imported, errors };
  },
});

/**
 * VW-35: add the agency's closed CRM deals as evidence. Reads deal
 * commissions (each is a won deal with its property and value) and skips
 * deals already pulled in.
 */
export const importCrmSales = mutation({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canEditEvidence", "Your role cannot add comparables");
    const deals = await ctx.db
      .query("dealCommissions")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .take(2000);
    const now = Date.now();
    let added = 0;
    for (const d of deals) {
      if (!d.propertyId || !(d.dealCurrency === "USD" || d.dealCurrency === "ZiG") || d.dealValue <= 0) continue;
      const seen = await ctx.db
        .query("worthComparables")
        .withIndex("by_crm_lead", (q) => q.eq("crmLeadId", d.leadId))
        .first();
      if (seen) continue;
      const property = await ctx.db.get(d.propertyId);
      const lead = await ctx.db.get(d.leadId);
      if (!property || !lead || property.orgId !== access.orgId) continue;
      const isRent = lead.interestType === "rent" || property.listingType === "rent";
      const date = new Date(lead.closedAt ?? d.createdAt).toISOString().slice(0, 10);
      await ctx.db.insert("worthComparables", {
        orgId: access.orgId,
        kind: isRent ? "rental" : "sale",
        source: "crm_sale",
        address: property.title,
        suburb: property.location || "Unknown",
        suburbKey: normaliseSuburb(property.location || "Unknown"),
        propertyType: property.type,
        landSizeM2: property.area || undefined,
        bedrooms: property.bedrooms,
        price: isRent ? undefined : d.dealValue,
        rent: isRent ? d.dealValue : undefined,
        currency: d.dealCurrency,
        date,
        sourceNote: "Closed deal in SynCRM",
        crmLeadId: d.leadId,
        createdByUserId: access.user._id,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
    return { added };
  },
});

// =====================
// Comparables on a job (VW-33)
// =====================

export const listForJob = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (!access.caps.seesValues) return [];
    const links = await ctx.db
      .query("worthJobComparables")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const out = [];
    for (const l of links) {
      const c = await ctx.db.get(l.comparableId);
      if (!c) continue;
      const by = await ctx.db.get(l.addedByUserId);
      out.push({
        linkId: l._id,
        adjustmentPct: l.adjustmentPct,
        note: l.note ?? "",
        addedBy: displayName(by),
        comparable: view(c),
      });
    }
    return out;
  },
});

async function workableJob(ctx: MutationCtx, jobId: Id<"worthJobs">) {
  const access = await requireWorth(ctx);
  const job = await getVisibleJob(ctx, access, jobId);
  requireWorker(access, job);
  if (!isEditableStatus(job.status)) throw new ConvexError("Evidence is locked while the job is in review or closed");
  return { access, job };
}

function checkAdjustment(pct: number) {
  if (!Number.isFinite(pct) || pct < -90 || pct > 300) throw new ConvexError("Adjustment must be between -90% and 300%");
}

export const addToJob = mutation({
  args: {
    jobId: v.id("worthJobs"),
    comparableId: v.id("worthComparables"),
    adjustmentPct: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { access, job } = await workableJob(ctx, args.jobId);
    const c = await ctx.db.get(args.comparableId);
    if (!c || c.orgId !== access.orgId) throw new ConvexError("Comparable not found");
    if (c.jobId === job._id) throw new ConvexError("A job cannot use its own valuation as evidence");
    const existing = await ctx.db
      .query("worthJobComparables")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    if (existing.some((l) => l.comparableId === c._id)) return;
    if (existing.length >= 30) throw new ConvexError("Up to 30 comparables per job");
    checkAdjustment(args.adjustmentPct ?? 0);
    await ctx.db.insert("worthJobComparables", {
      orgId: access.orgId,
      jobId: job._id,
      comparableId: c._id,
      adjustmentPct: args.adjustmentPct ?? 0,
      note: args.note?.trim() || undefined,
      addedByUserId: access.user._id,
      createdAt: Date.now(),
    });
  },
});

export const updateOnJob = mutation({
  args: { linkId: v.id("worthJobComparables"), adjustmentPct: v.number(), note: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError("Comparable not found");
    await workableJob(ctx, link.jobId);
    checkAdjustment(args.adjustmentPct);
    await ctx.db.patch(link._id, { adjustmentPct: args.adjustmentPct, note: args.note.trim() || undefined });
  },
});

export const removeFromJob = mutation({
  args: { linkId: v.id("worthJobComparables") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) return;
    await workableJob(ctx, link.jobId);
    await ctx.db.delete(link._id);
  },
});
