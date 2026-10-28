/**
 * Sync Worth inspection (VW-20..22), filled in on a phone at the property and
 * saved as a draft until complete. Photos are compressed in the browser
 * before upload and stored against the inspection.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { getVisibleJob, requireWorker, requireWorth } from "./access";
import { addSystemNote, setStatus } from "./jobs";
import { isEditableStatus, isIsoDate, nextStatus } from "./lib";

const MAX_PHOTOS = 60;

const fields = {
  inspectionDate: v.optional(v.string()),
  attendees: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  construction: v.object({
    walls: v.optional(v.string()),
    roof: v.optional(v.string()),
    floors: v.optional(v.string()),
    ceilings: v.optional(v.string()),
    windows: v.optional(v.string()),
    yearBuilt: v.optional(v.number()),
    storeys: v.optional(v.number()),
  }),
  condition: v.optional(
    v.union(v.literal("excellent"), v.literal("good"), v.literal("fair"), v.literal("poor"))
  ),
  accommodation: v.object({
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    ensuites: v.optional(v.number()),
    lounges: v.optional(v.number()),
    diningRooms: v.optional(v.number()),
    kitchens: v.optional(v.number()),
    studies: v.optional(v.number()),
    garages: v.optional(v.number()),
    carports: v.optional(v.number()),
    staffQuarters: v.optional(v.number()),
    other: v.optional(v.string()),
  }),
  services: v.object({
    municipalWater: v.optional(v.boolean()),
    borehole: v.optional(v.boolean()),
    electricity: v.optional(v.boolean()),
    solar: v.optional(v.boolean()),
    sewer: v.optional(v.boolean()),
    septicTank: v.optional(v.boolean()),
    tarredRoad: v.optional(v.boolean()),
    boundaryWall: v.optional(v.boolean()),
    electricFence: v.optional(v.boolean()),
    pool: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }),
  landSizeM2: v.optional(v.number()),
  buildingAreas: v.array(v.object({ name: v.string(), areaM2: v.number() })),
  notes: v.optional(v.string()),
};

async function editableJob(ctx: MutationCtx, jobId: Doc<"worthJobs">["_id"]) {
  const access = await requireWorth(ctx);
  const job = await getVisibleJob(ctx, access, jobId);
  requireWorker(access, job);
  if (!isEditableStatus(job.status)) {
    throw new ConvexError("The inspection is locked while the job is in review, issued, on hold or cancelled");
  }
  return { access, job };
}

async function inspectionFor(ctx: MutationCtx, job: Doc<"worthJobs">) {
  return ctx.db
    .query("worthInspections")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .unique();
}

export const get = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    if (!access.caps.seesValues) return null;
    const row = await ctx.db
      .query("worthInspections")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .unique();
    if (!row) return null;
    const photos = await Promise.all(
      row.photos.map(async (p) => ({ ...p, url: await ctx.storage.getUrl(p.storageId) }))
    );
    return { ...row, photos };
  },
});

/** VW-22: save as a draft and finish later. */
export const save = mutation({
  args: { jobId: v.id("worthJobs"), ...fields },
  handler: async (ctx, args) => {
    const { access, job } = await editableJob(ctx, args.jobId);
    const { jobId, ...data } = args;
    if (data.inspectionDate && !isIsoDate(data.inspectionDate)) throw new ConvexError("Enter a valid inspection date");
    const nums = [data.landSizeM2, ...data.buildingAreas.map((b) => b.areaM2)];
    if (nums.some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) {
      throw new ConvexError("Sizes must be positive numbers");
    }
    const clean = {
      ...data,
      attendees: data.attendees?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      buildingAreas: data.buildingAreas
        .map((b) => ({ name: b.name.trim(), areaM2: b.areaM2 }))
        .filter((b) => b.name || b.areaM2 > 0),
    };
    const now = Date.now();
    const existing = await inspectionFor(ctx, job);
    if (existing) {
      await ctx.db.patch(existing._id, { ...clean, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("worthInspections", {
      orgId: job.orgId,
      jobId,
      ...clean,
      photos: [],
      status: "draft",
      inspectorUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Mark the inspection complete; the job moves to Inspected. */
export const complete = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const { access, job } = await editableJob(ctx, args.jobId);
    const row = await inspectionFor(ctx, job);
    if (!row) throw new ConvexError("Save the inspection first");
    if (!row.inspectionDate) throw new ConvexError("Enter the inspection date");
    const to = nextStatus(job.status, "complete_inspection", { hasValuer: !!job.assignedValuerId });
    if (!to) throw new ConvexError("Assign a valuer before completing the inspection");
    await ctx.db.patch(row._id, { status: "completed", completedAt: Date.now(), updatedAt: Date.now() });
    if (to !== job.status) await setStatus(ctx, job, to, access.user._id);
    await addSystemNote(ctx, job, `Inspection completed (${row.inspectionDate})`, access.user._id);
  },
});

/** Reopen a completed inspection to correct it (the job keeps its status). */
export const reopen = mutation({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const { job } = await editableJob(ctx, args.jobId);
    const row = await inspectionFor(ctx, job);
    if (row) await ctx.db.patch(row._id, { status: "draft", updatedAt: Date.now() });
  },
});

/** VW-21: attach an uploaded (already compressed) photo. */
export const addPhoto = mutation({
  args: { jobId: v.id("worthJobs"), storageId: v.id("_storage"), caption: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { access, job } = await editableJob(ctx, args.jobId);
    let row = await inspectionFor(ctx, job);
    const now = Date.now();
    if (!row) {
      const id = await ctx.db.insert("worthInspections", {
        orgId: job.orgId,
        jobId: job._id,
        construction: {},
        accommodation: {},
        services: {},
        buildingAreas: [],
        photos: [],
        status: "draft",
        inspectorUserId: access.user._id,
        createdAt: now,
        updatedAt: now,
      });
      row = (await ctx.db.get(id))!;
    }
    if (row.photos.length >= MAX_PHOTOS) throw new ConvexError(`Up to ${MAX_PHOTOS} photos per inspection`);
    await ctx.db.patch(row._id, {
      photos: [...row.photos, { storageId: args.storageId, caption: args.caption?.trim() || undefined }],
      updatedAt: now,
    });
  },
});

export const updatePhotoCaption = mutation({
  args: { jobId: v.id("worthJobs"), storageId: v.id("_storage"), caption: v.string() },
  handler: async (ctx, args) => {
    const { job } = await editableJob(ctx, args.jobId);
    const row = await inspectionFor(ctx, job);
    if (!row) return;
    await ctx.db.patch(row._id, {
      photos: row.photos.map((p) =>
        p.storageId === args.storageId ? { ...p, caption: args.caption.trim() || undefined } : p
      ),
      updatedAt: Date.now(),
    });
  },
});

export const removePhoto = mutation({
  args: { jobId: v.id("worthJobs"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { job } = await editableJob(ctx, args.jobId);
    const row = await inspectionFor(ctx, job);
    if (!row || !row.photos.some((p) => p.storageId === args.storageId)) return;
    await ctx.db.patch(row._id, {
      photos: row.photos.filter((p) => p.storageId !== args.storageId),
      updatedAt: Date.now(),
    });
    await ctx.storage.delete(args.storageId);
  },
});
