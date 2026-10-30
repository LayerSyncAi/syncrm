/**
 * SyncWorth values, review and issue (VW-40..43, VW-50..63).
 *
 * The report is generated in the browser from `reportData`, so its figures
 * always come from the job record (VW-43). Issuing locks the job and keeps a
 * snapshot of the signed values in `worthReports`; a correction reopens the
 * job as the next numbered version and the old version stays on record.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { recordAudit } from "../logs";
import { notifyUsers } from "../lib/notify";
import {
  displayName,
  getVisibleJob,
  requireCap,
  requireWorker,
  requireWorth,
} from "./access";
import { addSystemNote, auditActor, jobHref, setStatus } from "./jobs";
import {
  CLASS_LABELS,
  VALUE_KEYS,
  WorthValues,
  hasAnyValue,
  isEditableStatus,
  localToday,
  nextStatus,
  normaliseSuburb,
} from "./lib";
import { getProfile, readSettings } from "./settings";
import { worthCalculations, worthMethod, worthNarrative, worthValues } from "../schemas/worth";

// =====================
// Values and write-up
// =====================

function checkValues(values: WorthValues) {
  for (const k of VALUE_KEYS) {
    const m = values[k];
    if (m && (!Number.isFinite(m.amount) || m.amount < 0)) throw new ConvexError("Values must be positive numbers");
  }
}

/** VW-40..42, VW-52: values, method, workings, calculators and narrative. */
export const saveValuation = mutation({
  args: {
    jobId: v.id("worthJobs"),
    values: worthValues,
    methods: v.array(worthMethod),
    workings: v.string(),
    calculations: v.optional(worthCalculations),
    narrative: worthNarrative,
    reportForm: v.union(v.literal("standard"), v.literal("short")),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    requireWorker(access, job);
    if (!isEditableStatus(job.status)) {
      throw new ConvexError("Values are locked while the job is in review, issued, on hold or cancelled");
    }
    checkValues(args.values);
    // Drop zero entries so "not needed for this purpose" reads as absent.
    const values: WorthValues = {};
    for (const k of VALUE_KEYS) {
      const m = args.values[k];
      if (m && m.amount > 0) values[k] = m;
    }
    const patch = {
      values,
      methods: [...new Set(args.methods)],
      workings: args.workings.trim() || undefined,
      calculations: args.calculations,
      narrative: {
        location: args.narrative.location?.trim() || undefined,
        description: args.narrative.description?.trim() || undefined,
        market: args.narrative.market?.trim() || undefined,
      },
      reportForm: args.reportForm,
    };
    const to = nextStatus(job.status, "start_draft");
    if (to && to !== job.status) {
      await setStatus(ctx, job, to, access.user._id, patch);
    } else {
      await ctx.db.patch(job._id, { ...patch, updatedAt: Date.now() });
    }
  },
});

async function signingValuerIds(ctx: QueryCtx, orgId: Id<"organizations">) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(500);
  return users.filter((u) => u.isActive && u.estateRoles?.includes("signing_valuer")).map((u) => u._id);
}

/** VW-60: the valuer submits the draft for review. */
export const submitForReview = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    requireWorker(access, job);
    const to = nextStatus(job.status, "submit");
    if (!to) throw new ConvexError("Only a draft can be submitted for review");
    if (!job.assignedValuerId) throw new ConvexError("Assign a valuer first");
    if (!hasAnyValue(job.values)) throw new ConvexError("Record at least one value before submitting");
    if (job.methods.length === 0) throw new ConvexError("Choose the valuation method");
    const inspection = await ctx.db
      .query("worthInspections")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .unique();
    if (inspection?.status !== "completed") throw new ConvexError("Complete the inspection before submitting");
    await setStatus(ctx, job, to, access.user._id, { submittedAt: Date.now() });
    await addSystemNote(ctx, job, "Submitted for review", access.user._id);
    const reviewers = (await signingValuerIds(ctx, access.orgId)).filter((id) => id !== access.user._id);
    await notifyUsers(ctx, reviewers, {
      orgId: access.orgId,
      module: "worth",
      kind: "worth.submitted",
      title: `${job.reference} is ready for review`,
      body: job.propertyAddress,
      href: jobHref(job._id),
    });
  },
});

/** VW-60: the signing valuer returns the report with comments. */
export const returnForChanges = mutation({
  args: { jobId: v.id("worthJobs"), comment: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canReview", "Only a signing valuer can review reports");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const comment = args.comment.trim();
    if (!comment) throw new ConvexError("Say what needs to change");
    const to = nextStatus(job.status, "return");
    if (!to) throw new ConvexError("This job is not in review");
    await setStatus(ctx, job, to, access.user._id, { returnComment: comment });
    await addSystemNote(ctx, job, `Returned for changes: ${comment}`, access.user._id);
    await notifyUsers(ctx, [job.assignedValuerId], {
      orgId: access.orgId,
      module: "worth",
      kind: "worth.returned",
      title: `${job.reference} returned for changes`,
      body: comment.slice(0, 200),
      href: jobHref(job._id),
    });
  },
});

/** The job's own valuation, added to the comparables database (VW-31). */
async function upsertOwnEvidence(ctx: MutationCtx, job: Doc<"worthJobs">, issuedDate: string) {
  const market = job.values.market;
  const rental = job.values.rental;
  const currency = market?.currency ?? rental?.currency;
  if (!currency) return;
  const inspection = await ctx.db
    .query("worthInspections")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .unique();
  const building = inspection?.buildingAreas.reduce((s, b) => s + b.areaM2, 0) ?? 0;
  const same = (m?: { amount: number; currency: string }) => (m && m.currency === currency ? m.amount : undefined);
  const fields = {
    kind: (market ? "valuation" : "rental") as "valuation" | "rental",
    address: job.propertyAddress,
    suburb: job.suburb || "Unknown",
    suburbKey: normaliseSuburb(job.suburb || "Unknown"),
    propertyType: inspection?.propertyType || CLASS_LABELS[job.propertyClass],
    landSizeM2: inspection?.landSizeM2,
    buildingSizeM2: building > 0 ? building : undefined,
    bedrooms: inspection?.accommodation.bedrooms,
    price: same(market),
    rent: same(rental),
    forcedSaleValue: same(job.values.forcedSale),
    currency,
    date: issuedDate,
    sourceNote: `Valuation ${job.reference} v${job.version}`,
    updatedAt: Date.now(),
  };
  const existing = await ctx.db
    .query("worthComparables")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const own = existing.find((c) => c.source === "own_valuation");
  if (own) {
    await ctx.db.patch(own._id, fields);
  } else {
    await ctx.db.insert("worthComparables", {
      orgId: job.orgId,
      ...fields,
      source: "own_valuation",
      jobId: job._id,
      createdAt: Date.now(),
    });
  }
}

/** VW-60..62: the signing valuer approves and issues. The job locks. */
export const issue = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canIssue", "Only a signing valuer can issue a report");
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (nextStatus(job.status, "issue") !== "issued") throw new ConvexError("Only a report in review can be issued");
    if (!hasAnyValue(job.values)) throw new ConvexError("The report has no values");
    const profile = await getProfile(ctx, access.orgId, access.user._id);
    if (!profile?.registrationNumber) {
      throw new ConvexError("Add your registration number in Worth settings before issuing");
    }
    const now = Date.now();
    const issuedDate = localToday(now);
    if (job.currentReportId) await ctx.db.patch(job.currentReportId, { supersededAt: now });
    const preparedByUserId = job.assignedValuerId ?? access.user._id;
    const reportId = await ctx.db.insert("worthReports", {
      orgId: access.orgId,
      jobId: job._id,
      version: job.version,
      issuedAt: now,
      issuedDate,
      preparedByUserId,
      signedByUserId: access.user._id,
      values: job.values,
      methods: job.methods,
      correctionReason: job.correctionReason,
      sends: [],
      createdAt: now,
    });
    await setStatus(ctx, job, "issued", access.user._id, {
      issuedAt: now,
      issuedDate,
      preparedByUserId,
      signedByUserId: access.user._id,
      currentReportId: reportId,
      returnComment: undefined,
      dueAlert: undefined,
    });
    await upsertOwnEvidence(ctx, job, issuedDate);
    await addSystemNote(ctx, job, `Version ${job.version} signed and issued`, access.user._id);
    await notifyUsers(ctx, [job.assignedValuerId, job.createdByUserId].filter((id) => id !== access.user._id), {
      orgId: access.orgId,
      module: "worth",
      kind: "worth.issued",
      title: `${job.reference} issued`,
      body: job.propertyAddress,
      href: jobHref(job._id),
    });
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.report_issue",
      category: "worth",
      description: `Signed and issued ${job.reference} version ${job.version}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
      metadata: { version: job.version, values: job.values },
    });
    return { reportId };
  },
});

/** VW-62: reopen an issued report as a new numbered version, with a reason. */
export const startCorrection = mutation({
  args: { jobId: v.id("worthJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canReview", "Only a signing valuer can correct an issued report");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give the reason for the correction");
    const to = nextStatus(job.status, "correct");
    if (!to) throw new ConvexError("Only an issued report can be corrected");
    const version = job.version + 1;
    await setStatus(ctx, job, to, access.user._id, { version, correctionReason: reason, submittedAt: undefined });
    await addSystemNote(ctx, job, `Version ${version} started: ${reason}`, access.user._id);
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.report_new_version",
      category: "worth",
      description: `Reopened ${job.reference} as version ${version}: ${reason}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
      metadata: { fromVersion: job.version, toVersion: version, reason },
    });
  },
});

/** Store the PDF generated at issue. Allowed once per version. */
export const attachReportPdf = mutation({
  args: { reportId: v.id("worthReports"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report || report.orgId !== access.orgId) throw new ConvexError("Report not found");
    await getVisibleJob(ctx, access, report.jobId);
    if (!(access.caps.canIssue || access.caps.canSendReports)) throw new ConvexError("Your role cannot attach reports");
    if (report.pdfStorageId) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("This version already has its PDF");
    }
    await ctx.db.patch(report._id, { pdfStorageId: args.storageId });
  },
});

/** VW-63: email the issued report to the client and record when. */
export const sendReport = mutation({
  args: { jobId: v.id("worthJobs"), to: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canSendReports", "Your role cannot send reports");
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (job.status !== "issued" || !job.currentReportId) throw new ConvexError("Only an issued report can be sent");
    const to = args.to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ConvexError("Enter a valid email address");
    const settings = await readSettings(ctx, access.orgId);
    if (settings.holdReportUntilPaid && !job.paidAt) {
      throw new ConvexError("The agency holds reports until the fee is paid");
    }
    const report = await ctx.db.get(job.currentReportId);
    if (!report) throw new ConvexError("Report not found");
    if (!report.pdfStorageId) throw new ConvexError("Generate the report PDF before sending");
    const now = Date.now();
    await ctx.db.patch(report._id, { sends: [...report.sends, { to, at: now, byUserId: access.user._id }] });
    await ctx.scheduler.runAfter(0, internal.worth.emails.sendReportEmail, {
      reportId: report._id,
      to,
      byUserId: access.user._id,
      message: args.message?.trim() || undefined,
    });
    await addSystemNote(ctx, job, `Report version ${report.version} emailed to ${to}`, access.user._id);
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.report_sent",
      category: "worth",
      description: `Emailed ${job.reference} version ${report.version} to ${to}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
    });
  },
});

// =====================
// Report data and history
// =====================

async function profileView(ctx: QueryCtx, orgId: Id<"organizations">, userId?: Id<"users">) {
  if (!userId) return null;
  const u = await ctx.db.get(userId);
  const p = await getProfile(ctx, orgId, userId);
  return {
    name: displayName(u),
    registrationNumber: p?.registrationNumber ?? "",
    qualifications: p?.qualifications ?? "",
    signatureUrl: p?.signatureStorageId ? await ctx.storage.getUrl(p.signatureStorageId) : null,
  };
}

/** Everything the report PDF is built from (VW-50). Values come from the job. */
export const reportData = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (!access.caps.seesValues) throw new ConvexError("Your role cannot open valuation reports");
    const org = await ctx.db.get(access.orgId);
    const settings = await readSettings(ctx, access.orgId);
    const client = await ctx.db.get(job.clientContactId);
    const property = await ctx.db.get(job.propertyId);
    const inspection = await ctx.db
      .query("worthInspections")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .unique();
    const photos = inspection
      ? await Promise.all(
          inspection.photos.map(async (p) => ({ caption: p.caption ?? "", url: await ctx.storage.getUrl(p.storageId) }))
        )
      : [];
    const links = await ctx.db
      .query("worthJobComparables")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const comparables = [];
    for (const l of links) {
      const c = await ctx.db.get(l.comparableId);
      if (c) comparables.push({ ...c, adjustmentPct: l.adjustmentPct, adjustmentNote: l.note ?? "" });
    }
    return {
      org: {
        name: org?.name ?? "",
        address: org?.address ?? "",
        phone: org?.phone ?? "",
        email: org?.email ?? "",
      },
      wording: {
        assumptions: settings.assumptions,
        limitingConditions: settings.limitingConditions,
        disclaimer: settings.disclaimer,
      },
      job: {
        reference: job.reference,
        status: job.status,
        version: job.version,
        correctionReason: job.correctionReason ?? "",
        partyType: job.partyType,
        contactPerson: job.contactPerson ?? "",
        purpose: job.purpose,
        purposeNote: job.purposeNote ?? "",
        propertyClass: job.propertyClass,
        clientName: job.clientName,
        propertyAddress: job.propertyAddress,
        suburb: job.suburb,
        receivedDate: job.receivedDate,
        issuedDate: job.status === "issued" ? job.issuedDate ?? null : null,
        values: job.values,
        methods: job.methods,
        workings: job.workings ?? "",
        calculations: job.calculations ?? null,
        narrative: job.narrative,
        reportForm: job.reportForm,
        fee: job.fee,
        currency: job.currency,
      },
      client: client
        ? { name: client.name, company: client.company ?? "", email: client.email ?? "", phone: client.phone ?? "" }
        : null,
      property: property ? { type: property.type, area: property.area, location: property.location } : null,
      inspection: inspection ? { ...inspection, photos } : null,
      comparables,
      preparedBy: await profileView(ctx, access.orgId, job.preparedByUserId ?? job.assignedValuerId),
      signedBy: job.status === "issued" ? await profileView(ctx, access.orgId, job.signedByUserId) : null,
    };
  },
});

export const listReports = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (!access.caps.seesValues) return [];
    const reports = await ctx.db
      .query("worthReports")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const out = [];
    for (const r of reports.sort((a, b) => b.version - a.version)) {
      const signer = await ctx.db.get(r.signedByUserId);
      const sends = [];
      for (const s of r.sends) sends.push({ to: s.to, at: s.at, by: displayName(await ctx.db.get(s.byUserId)) });
      out.push({
        _id: r._id,
        version: r.version,
        issuedDate: r.issuedDate,
        issuedAt: r.issuedAt,
        signedBy: displayName(signer),
        correctionReason: r.correctionReason,
        values: r.values,
        pdfUrl: r.pdfStorageId ? await ctx.storage.getUrl(r.pdfStorageId) : null,
        sends,
        superseded: !!r.supersededAt,
      });
    }
    return out;
  },
});

/** BRD §9: log every view of an issued report by non-valuation staff. */
export const logReportView = mutation({
  args: { jobId: v.id("worthJobs"), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (access.caps.isValuationStaff) return;
    if (job.status !== "issued" && args.version === undefined) return;
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.report_view",
      category: "worth",
      description: `Viewed issued report ${job.reference}${args.version ? ` version ${args.version}` : ""}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
    });
  },
});
