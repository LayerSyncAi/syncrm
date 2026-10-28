/**
 * Sync Worth jobs: instructions (VW-01..04), assignment and tracking
 * (VW-10..13) and fees (VW-70..72).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { recordAudit } from "../logs";
import { notifyUsers } from "../lib/notify";
import { normalizePhone } from "../contacts";
import {
  WorthAccess,
  canSeeJob,
  canWorkJobPure,
  displayName,
  getVisibleJob,
  requireCap,
  requireWorth,
} from "./access";
import {
  STATUS_LABELS,
  WorthStatus,
  allocateReference,
  dueState,
  isIsoDate,
  isOpenStatus,
  localToday,
  nextStatus,
  formatMoney,
} from "./lib";
import { ensureSettings, listValuerUsers, readSettings } from "./settings";
import {
  worthCurrency,
  worthPartyType,
  worthPropertyClass,
  worthPurpose,
  worthStatus,
} from "../schemas/worth";

// =====================
// Shared helpers
// =====================

export function jobHref(id: Id<"worthJobs">) {
  return `/app/worth/jobs/${id}`;
}

/** Move a job to `status`, appending to its status log. */
export async function setStatus(
  ctx: MutationCtx,
  job: Doc<"worthJobs">,
  status: WorthStatus,
  byUserId: Id<"users"> | undefined,
  extra: Partial<Doc<"worthJobs">> = {}
) {
  const now = Date.now();
  const statusLog = job.status === status ? job.statusLog : [...job.statusLog, { status, at: now, byUserId }];
  await ctx.db.patch(job._id, { ...extra, status, statusLog, updatedAt: now });
}

export async function addSystemNote(
  ctx: MutationCtx,
  job: Pick<Doc<"worthJobs">, "_id" | "orgId">,
  body: string,
  byUserId?: Id<"users">
) {
  await ctx.db.insert("worthJobNotes", {
    orgId: job.orgId,
    jobId: job._id,
    kind: "system",
    body,
    byUserId,
    createdAt: Date.now(),
  });
}

export function auditActor(access: WorthAccess) {
  return { actorUserId: access.user._id, actorLabel: displayName(access.user) };
}

export async function userNames(ctx: QueryCtx, orgId: Id<"organizations">) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(500);
  return new Map(users.map((u) => [u._id as Id<"users">, displayName(u)]));
}

export async function jobsForCaller(ctx: QueryCtx, access: WorthAccess, status?: WorthStatus) {
  if (access.caps.seesAllJobs) {
    if (status) {
      return ctx.db
        .query("worthJobs")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status))
        .collect();
    }
    return ctx.db
      .query("worthJobs")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
  }
  const mine = await ctx.db
    .query("worthJobs")
    .withIndex("by_org_valuer", (q) => q.eq("orgId", access.orgId).eq("assignedValuerId", access.user._id))
    .collect();
  return status ? mine.filter((j) => j.status === status) : mine;
}

// =====================
// Queries
// =====================

export const list = query({
  args: {
    status: v.optional(v.union(worthStatus, v.literal("open"))),
    valuerId: v.optional(v.id("users")),
    q: v.optional(v.string()),
    mine: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const settings = await readSettings(ctx, access.orgId);
    const exact = args.status && args.status !== "open" ? args.status : undefined;
    let jobs = await jobsForCaller(ctx, access, exact);
    if (args.status === "open") jobs = jobs.filter((j) => isOpenStatus(j.status));
    if (args.valuerId) jobs = jobs.filter((j) => j.assignedValuerId === args.valuerId);
    if (args.mine) jobs = jobs.filter((j) => j.assignedValuerId === access.user._id);
    const q = args.q?.trim().toLowerCase();
    if (q) {
      jobs = jobs.filter((j) =>
        [j.reference, j.clientName, j.propertyAddress, j.suburb].some((s) => s.toLowerCase().includes(q))
      );
    }
    const names = await userNames(ctx, access.orgId);
    const today = localToday(Date.now());
    jobs.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.createdAt - a.createdAt);
    return jobs.slice(0, 500).map((j) => ({
      _id: j._id,
      reference: j.reference,
      clientName: j.clientName,
      propertyAddress: j.propertyAddress,
      suburb: j.suburb,
      purpose: j.purpose,
      propertyClass: j.propertyClass,
      status: j.status,
      receivedDate: j.receivedDate,
      dueDate: j.dueDate,
      fee: j.fee,
      currency: j.currency,
      assignedValuerId: j.assignedValuerId,
      valuerName: j.assignedValuerId ? names.get(j.assignedValuerId) ?? "Unknown" : null,
      dueFlag: dueState(j, today, settings.dueSoonDays),
      invoiced: !!j.invoicedAt,
      paid: !!j.paidAt,
      version: j.version,
    }));
  },
});

/** Valuers who can take a job, with how many open jobs each holds (VW-10). */
export const valuers = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorth(ctx);
    const users = await listValuerUsers(ctx, access.orgId);
    return Promise.all(
      users.map(async (u) => {
        const jobs = await ctx.db
          .query("worthJobs")
          .withIndex("by_org_valuer", (q) => q.eq("orgId", access.orgId).eq("assignedValuerId", u._id))
          .collect();
        return {
          userId: u._id,
          name: displayName(u),
          isSigning: !!u.estateRoles?.includes("signing_valuer"),
          openJobs: jobs.filter((j) => isOpenStatus(j.status)).length,
        };
      })
    );
  },
});

export const get = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || !canSeeJob(access, job)) return null;
    const settings = await readSettings(ctx, access.orgId);
    const client = await ctx.db.get(job.clientContactId);
    const property = await ctx.db.get(job.propertyId);
    const names = await userNames(ctx, access.orgId);
    const name = (id?: Id<"users">) => (id ? names.get(id) ?? "Unknown" : null);
    const canWork = canWorkJobPure(access.caps, access.user._id, job);
    // Accounts see fees and invoice status only, never values.
    const valueFields = access.caps.seesValues
      ? {
          values: job.values,
          methods: job.methods,
          workings: job.workings ?? "",
          calculations: job.calculations ?? null,
          narrative: job.narrative,
        }
      : { values: {}, methods: [], workings: "", calculations: null, narrative: {} };
    return {
      _id: job._id,
      reference: job.reference,
      status: job.status,
      statusBeforeHold: job.statusBeforeHold,
      holdReason: job.holdReason,
      cancelReason: job.cancelReason,
      partyType: job.partyType,
      contactPerson: job.contactPerson ?? "",
      purpose: job.purpose,
      purposeNote: job.purposeNote ?? "",
      propertyClass: job.propertyClass,
      clientContactId: job.clientContactId,
      clientName: job.clientName,
      client: client
        ? {
            name: client.name,
            phone: client.phone ?? "",
            email: client.email ?? "",
            company: client.company ?? "",
            entityKind: client.entityKind,
          }
        : null,
      propertyId: job.propertyId,
      propertyAddress: job.propertyAddress,
      suburb: job.suburb,
      property: property
        ? {
            title: property.title,
            location: property.location,
            type: property.type,
            area: property.area,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
          }
        : null,
      fee: job.fee,
      currency: job.currency,
      receivedDate: job.receivedDate,
      dueDate: job.dueDate,
      dueFlag: dueState(job, localToday(Date.now()), settings.dueSoonDays),
      assignedValuerId: job.assignedValuerId,
      valuerName: name(job.assignedValuerId),
      preparedByName: name(job.preparedByUserId),
      signedByName: name(job.signedByUserId),
      reportForm: job.reportForm,
      submittedAt: job.submittedAt,
      returnComment: job.returnComment,
      version: job.version,
      correctionReason: job.correctionReason,
      issuedAt: job.issuedAt,
      issuedDate: job.issuedDate,
      currentReportId: job.currentReportId,
      invoicedAt: job.invoicedAt,
      paidAt: job.paidAt,
      statusLog: job.statusLog,
      createdAt: job.createdAt,
      ...valueFields,
      holdReportUntilPaid: settings.holdReportUntilPaid,
      caps: access.caps,
      canWork,
      me: access.user._id,
    };
  },
});

/** VW-02: pick an instructing party from the Hub's contacts. */
export const searchClients = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const q = args.q.trim().toLowerCase();
    const digits = normalizePhone(q);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (x) => x.eq("orgId", access.orgId))
      .take(5000);
    const hits = contacts.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (digits.length >= 4 && (c.normalizedPhone ?? "").includes(digits))
    );
    // Existing valuation clients first.
    hits.sort((a, b) => Number(!!b.isValuationClient) - Number(!!a.isValuationClient) || a.name.localeCompare(b.name));
    return hits.slice(0, 20).map((c) => ({
      _id: c._id,
      name: c.name,
      company: c.company ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      entityKind: c.entityKind,
      isValuationClient: !!c.isValuationClient,
    }));
  },
});

/** Contacts that already have this phone or email, to warn before creating a duplicate. */
export const findDuplicateClients = query({
  args: { phone: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const out = new Map<Id<"contacts">, Doc<"contacts">>();
    const phone = args.phone ? normalizePhone(args.phone) : "";
    if (phone.length >= 6) {
      const byPhone = await ctx.db
        .query("contacts")
        .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", phone))
        .take(20);
      for (const c of byPhone) if (c.orgId === access.orgId) out.set(c._id, c);
    }
    const email = args.email?.trim().toLowerCase();
    if (email && email.includes("@")) {
      const all = await ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .take(5000);
      for (const c of all) if (c.email?.trim().toLowerCase() === email) out.set(c._id, c);
    }
    return [...out.values()].slice(0, 5).map((c) => ({
      _id: c._id,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      company: c.company ?? "",
    }));
  },
});

/** VW-02: pick the property from the Hub's shared records. */
export const searchProperties = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const q = args.q.trim().toLowerCase();
    const props = await ctx.db
      .query("properties")
      .withIndex("by_org", (x) => x.eq("orgId", access.orgId))
      .take(5000);
    return props
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
      .slice(0, 20)
      .map((p) => ({ _id: p._id, title: p.title, location: p.location, type: p.type, area: p.area }));
  },
});

export const listNotes = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    await getVisibleJob(ctx, access, args.jobId);
    const notes = await ctx.db
      .query("worthJobNotes")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .take(300);
    const names = await userNames(ctx, access.orgId);
    return notes.map((n) => ({
      _id: n._id,
      kind: n.kind,
      body: n.body,
      createdAt: n.createdAt,
      byName: n.byUserId ? names.get(n.byUserId) ?? "Unknown" : "System",
    }));
  },
});

// =====================
// Instructions
// =====================

const newClientArgs = v.object({
  name: v.string(),
  entityKind: v.union(v.literal("individual"), v.literal("company")),
  company: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
});

const newPropertyArgs = v.object({
  address: v.string(),
  suburb: v.string(),
  type: v.union(
    v.literal("house"),
    v.literal("apartment"),
    v.literal("land"),
    v.literal("commercial"),
    v.literal("other")
  ),
  landSizeM2: v.optional(v.number()),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
});

function checkDates(received: string, due: string) {
  if (!isIsoDate(received) || !isIsoDate(due)) throw new ConvexError("Enter valid dates");
  if (due < received) throw new ConvexError("The due date cannot be before the date received");
}

function checkFee(fee: number) {
  if (!Number.isFinite(fee) || fee < 0) throw new ConvexError("Enter a valid fee");
}

async function resolveValuer(ctx: QueryCtx, access: WorthAccess, userId: Id<"users">) {
  const u = await ctx.db.get(userId);
  if (
    !u ||
    u.orgId !== access.orgId ||
    !u.isActive ||
    !(u.estateRoles?.includes("valuer") || u.estateRoles?.includes("signing_valuer"))
  ) {
    throw new ConvexError("Choose a valuer from your team");
  }
  return u;
}

/** VW-01..03: log an instruction and allocate its reference. */
export const create = mutation({
  args: {
    clientContactId: v.optional(v.id("contacts")),
    newClient: v.optional(newClientArgs),
    partyType: worthPartyType,
    contactPerson: v.optional(v.string()),
    purpose: worthPurpose,
    purposeNote: v.optional(v.string()),
    propertyId: v.optional(v.id("properties")),
    newProperty: v.optional(newPropertyArgs),
    propertyClass: worthPropertyClass,
    fee: v.number(),
    currency: worthCurrency,
    receivedDate: v.string(),
    dueDate: v.string(),
    assignedValuerId: v.optional(v.id("users")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageJobs", "Your role cannot log instructions");
    checkDates(args.receivedDate, args.dueDate);
    checkFee(args.fee);
    const now = Date.now();
    const me = access.user._id;

    // Instructing party: an existing Hub contact or a new one.
    let client: Doc<"contacts">;
    if (args.clientContactId) {
      const c = await ctx.db.get(args.clientContactId);
      if (!c || c.orgId !== access.orgId) throw new ConvexError("Client not found");
      if (!c.isValuationClient) await ctx.db.patch(c._id, { isValuationClient: true, updatedAt: now });
      client = c;
    } else if (args.newClient) {
      const n = args.newClient;
      const name = n.name.trim();
      if (!name) throw new ConvexError("Client name is required");
      const phone = n.phone?.trim() || undefined;
      const id = await ctx.db.insert("contacts", {
        name,
        phone,
        normalizedPhone: phone ? normalizePhone(phone) : undefined,
        email: n.email?.trim() || undefined,
        company: n.company?.trim() || undefined,
        entityKind: n.entityKind,
        isValuationClient: true,
        isBuyerTenant: false,
        ownerUserIds: [me],
        createdByUserId: me,
        orgId: access.orgId,
        createdAt: now,
        updatedAt: now,
      });
      client = (await ctx.db.get(id))!;
    } else {
      throw new ConvexError("Choose or add the instructing party");
    }

    // Property: an existing Hub property or a new off-market record.
    let property: Doc<"properties">;
    if (args.propertyId) {
      const p = await ctx.db.get(args.propertyId);
      if (!p || p.orgId !== access.orgId) throw new ConvexError("Property not found");
      property = p;
    } else if (args.newProperty) {
      const n = args.newProperty;
      const address = n.address.trim();
      if (!address) throw new ConvexError("Property address is required");
      const id = await ctx.db.insert("properties", {
        title: address,
        type: n.type,
        listingType: "sale",
        price: 0,
        currency: args.currency,
        location: n.suburb.trim(),
        area: n.landSizeM2 ?? 0,
        bedrooms: n.bedrooms,
        bathrooms: n.bathrooms,
        status: "off_market",
        description: "",
        images: [],
        ownershipType: "company",
        ownerUserIds: [],
        createdByUserId: me,
        orgId: access.orgId,
        createdAt: now,
        updatedAt: now,
      });
      property = (await ctx.db.get(id))!;
    } else {
      throw new ConvexError("Choose or add the property");
    }

    let valuerId: Id<"users"> | undefined;
    if (args.assignedValuerId) valuerId = (await resolveValuer(ctx, access, args.assignedValuerId))._id;

    const settings = await ensureSettings(ctx, access.orgId);
    // References run per calendar year of logging, so the counter never goes backwards.
    const year = Number(localToday(now).slice(0, 4));
    const useRef = allocateReference(
      { prefix: settings.referencePrefix, seqYear: settings.seqYear, nextSeq: settings.nextSeq },
      Math.max(year, settings.seqYear)
    );
    await ctx.db.patch(settings._id, { seqYear: useRef.seqYear, nextSeq: useRef.nextSeq, updatedAt: now });

    const status: WorthStatus = valuerId ? "assigned" : "new";
    const statusLog: Doc<"worthJobs">["statusLog"] = [{ status: "new", at: now, byUserId: me }];
    if (valuerId) statusLog.push({ status: "assigned", at: now, byUserId: me });
    const jobId = await ctx.db.insert("worthJobs", {
      orgId: access.orgId,
      reference: useRef.reference,
      clientContactId: client._id,
      partyType: args.partyType,
      contactPerson: args.contactPerson?.trim() || undefined,
      purpose: args.purpose,
      purposeNote: args.purposeNote?.trim() || undefined,
      propertyId: property._id,
      propertyClass: args.propertyClass,
      clientName: client.company && client.entityKind === "company" ? client.company : client.name,
      propertyAddress: property.title,
      suburb: property.location,
      fee: args.fee,
      currency: args.currency,
      receivedDate: args.receivedDate,
      dueDate: args.dueDate,
      status,
      statusLog,
      assignedValuerId: valuerId,
      values: {},
      methods: [],
      narrative: {},
      reportForm: "standard",
      version: 1,
      createdByUserId: me,
      createdAt: now,
      updatedAt: now,
    });
    const job = { _id: jobId, orgId: access.orgId };
    await addSystemNote(ctx, job, `Instruction logged as ${useRef.reference}`, me);
    if (args.note?.trim()) {
      await ctx.db.insert("worthJobNotes", {
        orgId: access.orgId,
        jobId,
        kind: "note",
        body: args.note.trim(),
        byUserId: me,
        createdAt: now,
      });
    }
    if (valuerId && valuerId !== me) {
      await notifyUsers(ctx, [valuerId], {
        orgId: access.orgId,
        module: "worth",
        kind: "worth.assigned",
        title: `Valuation ${useRef.reference} assigned to you`,
        body: `${property.title}, due ${args.dueDate}`,
        href: jobHref(jobId),
      });
    }
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.job_create",
      category: "worth",
      description: `Logged valuation instruction ${useRef.reference}`,
      targetType: "worthJob",
      targetId: jobId,
      targetLabel: useRef.reference,
      orgId: access.orgId,
      metadata: { fee: args.fee, currency: args.currency },
    });
    return { jobId, reference: useRef.reference };
  },
});

/** Edit instruction details. The fee is audited; issued jobs keep everything but the fee. */
export const updateInstruction = mutation({
  args: {
    jobId: v.id("worthJobs"),
    partyType: worthPartyType,
    contactPerson: v.optional(v.string()),
    purpose: worthPurpose,
    purposeNote: v.optional(v.string()),
    propertyClass: worthPropertyClass,
    fee: v.number(),
    currency: worthCurrency,
    receivedDate: v.string(),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    const feeChanged = args.fee !== job.fee || args.currency !== job.currency;
    const detailsChanged =
      args.partyType !== job.partyType ||
      (args.contactPerson?.trim() || undefined) !== job.contactPerson ||
      args.purpose !== job.purpose ||
      (args.purposeNote?.trim() || undefined) !== job.purposeNote ||
      args.propertyClass !== job.propertyClass ||
      args.receivedDate !== job.receivedDate ||
      args.dueDate !== job.dueDate;
    if (feeChanged) requireCap(access, "canEditFee", "Your role cannot change fees");
    if (detailsChanged) {
      requireCap(access, "canManageJobs", "Your role cannot edit instructions");
      if (job.status === "issued" || job.status === "cancelled") {
        throw new ConvexError("This job is closed; only its fee can change");
      }
      checkDates(args.receivedDate, args.dueDate);
    }
    if (feeChanged) checkFee(args.fee);
    if (!feeChanged && !detailsChanged) return;
    const patch: Partial<Doc<"worthJobs">> = { updatedAt: Date.now() };
    if (detailsChanged) {
      Object.assign(patch, {
        partyType: args.partyType,
        contactPerson: args.contactPerson?.trim() || undefined,
        purpose: args.purpose,
        purposeNote: args.purposeNote?.trim() || undefined,
        propertyClass: args.propertyClass,
        receivedDate: args.receivedDate,
        dueDate: args.dueDate,
      });
      // A new due date earns a fresh reminder.
      if (args.dueDate !== job.dueDate) patch.dueAlert = undefined;
    }
    if (feeChanged) Object.assign(patch, { fee: args.fee, currency: args.currency });
    await ctx.db.patch(job._id, patch);
    if (feeChanged) {
      const from = formatMoney(job.fee, job.currency);
      const to = formatMoney(args.fee, args.currency);
      await addSystemNote(ctx, job, `Fee changed from ${from} to ${to}`, access.user._id);
      await recordAudit(ctx, {
        ...auditActor(access),
        action: "worth.fee_change",
        category: "worth",
        description: `Changed fee on ${job.reference} from ${from} to ${to}`,
        targetType: "worthJob",
        targetId: job._id,
        targetLabel: job.reference,
        orgId: access.orgId,
        metadata: { from: { fee: job.fee, currency: job.currency }, to: { fee: args.fee, currency: args.currency } },
      });
    }
    if (detailsChanged && args.dueDate !== job.dueDate) {
      await addSystemNote(ctx, job, `Due date moved from ${job.dueDate} to ${args.dueDate}`, access.user._id);
    }
  },
});

/** VW-10: assign or reassign the valuer. */
export const assign = mutation({
  args: { jobId: v.id("worthJobs"), valuerId: v.id("users") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageJobs", "Your role cannot assign jobs");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const to = nextStatus(job.status, "assign");
    if (!to) throw new ConvexError(`A ${STATUS_LABELS[job.status].toLowerCase()} job cannot be reassigned`);
    const valuer = await resolveValuer(ctx, access, args.valuerId);
    if (job.assignedValuerId === valuer._id) return;
    await setStatus(ctx, job, to, access.user._id, { assignedValuerId: valuer._id, dueAlert: undefined });
    await addSystemNote(ctx, job, `Assigned to ${displayName(valuer)}`, access.user._id);
    if (valuer._id !== access.user._id) {
      await notifyUsers(ctx, [valuer._id], {
        orgId: access.orgId,
        module: "worth",
        kind: "worth.assigned",
        title: `Valuation ${job.reference} assigned to you`,
        body: `${job.propertyAddress}, due ${job.dueDate}`,
        href: jobHref(job._id),
      });
    }
  },
});

/** VW-04: put on hold with a reason. */
export const hold = mutation({
  args: { jobId: v.id("worthJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageJobs", "Your role cannot put jobs on hold");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    if (!nextStatus(job.status, "hold")) throw new ConvexError("This job cannot be put on hold");
    await setStatus(ctx, job, "on_hold", access.user._id, { statusBeforeHold: job.status, holdReason: reason });
    await addSystemNote(ctx, job, `Put on hold: ${reason}`, access.user._id);
  },
});

export const resume = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageJobs", "Your role cannot resume jobs");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const to = nextStatus(job.status, "resume", { statusBeforeHold: job.statusBeforeHold });
    if (!to) throw new ConvexError("This job is not on hold");
    await setStatus(ctx, job, to, access.user._id, { statusBeforeHold: undefined, holdReason: undefined });
    await addSystemNote(ctx, job, `Resumed (${STATUS_LABELS[to]})`, access.user._id);
  },
});

/** VW-04: cancel with a reason. The job stays on record. */
export const cancel = mutation({
  args: { jobId: v.id("worthJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageJobs", "Your role cannot cancel jobs");
    const job = await getVisibleJob(ctx, access, args.jobId);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Give a reason");
    if (!nextStatus(job.status, "cancel")) throw new ConvexError("This job cannot be cancelled");
    await setStatus(ctx, job, "cancelled", access.user._id, { cancelReason: reason });
    await addSystemNote(ctx, job, `Cancelled: ${reason}`, access.user._id);
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.job_cancel",
      category: "worth",
      description: `Cancelled valuation ${job.reference}: ${reason}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
    });
  },
});

/** VW-13: a note on the job's activity log. */
export const addNote = mutation({
  args: {
    jobId: v.id("worthJobs"),
    kind: v.union(v.literal("note"), v.literal("call"), v.literal("client_query"), v.literal("access")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write a note first");
    if (body.length > 4000) throw new ConvexError("Keep notes under 4,000 characters");
    await ctx.db.insert("worthJobNotes", {
      orgId: access.orgId,
      jobId: job._id,
      kind: args.kind,
      body,
      byUserId: access.user._id,
      createdAt: Date.now(),
    });
  },
});

// =====================
// Fees (VW-71)
// =====================

export const markInvoiced = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageFees", "Only accounts or a director can raise invoices");
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (job.status === "cancelled") throw new ConvexError("This job was cancelled");
    if (job.invoicedAt) return;
    await ctx.db.patch(job._id, { invoicedAt: Date.now(), updatedAt: Date.now() });
    await addSystemNote(ctx, job, `Fee invoice raised for ${formatMoney(job.fee, job.currency)}`, access.user._id);
    await recordAudit(ctx, {
      ...auditActor(access),
      action: "worth.fee_invoiced",
      category: "worth",
      description: `Raised fee invoice for ${job.reference}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
      metadata: { fee: job.fee, currency: job.currency },
    });
  },
});

export const setPaid = mutation({
  args: { jobId: v.id("worthJobs"), paid: v.boolean() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "canManageFees", "Only accounts or a director can record payment");
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (args.paid === !!job.paidAt) return;
    const now = Date.now();
    await ctx.db.patch(job._id, {
      paidAt: args.paid ? now : undefined,
      // Paying an uninvoiced fee implies the invoice.
      invoicedAt: args.paid ? job.invoicedAt ?? now : job.invoicedAt,
      updatedAt: now,
    });
    await addSystemNote(ctx, job, args.paid ? "Fee marked paid" : "Fee marked unpaid", access.user._id);
    await recordAudit(ctx, {
      ...auditActor(access),
      action: args.paid ? "worth.fee_paid" : "worth.fee_unpaid",
      category: "worth",
      description: `Marked fee for ${job.reference} ${args.paid ? "paid" : "unpaid"}`,
      targetType: "worthJob",
      targetId: job._id,
      targetLabel: job.reference,
      orgId: access.orgId,
      metadata: { fee: job.fee, currency: job.currency },
    });
  },
});
