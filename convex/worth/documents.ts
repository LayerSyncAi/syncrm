/**
 * Supporting documents on a valuation job (VW-23): title deed, plans, lease,
 * rates statement. Kept while the job exists; issued jobs keep theirs locked.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getVisibleJob, requireWorker, requireWorth } from "./access";
import { displayName } from "./access";

const MAX_BYTES = 15 * 1024 * 1024;

const kind = v.union(
  v.literal("title_deed"),
  v.literal("plans"),
  v.literal("lease"),
  v.literal("rates_statement"),
  v.literal("other")
);

export const list = query({
  args: { jobId: v.id("worthJobs") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    await getVisibleJob(ctx, access, args.jobId);
    if (!access.caps.seesValues) return [];
    const docs = await ctx.db
      .query("worthDocuments")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
    return Promise.all(
      docs.map(async (d) => {
        const by = await ctx.db.get(d.uploadedByUserId);
        return {
          _id: d._id,
          name: d.name,
          kind: d.kind,
          mimeType: d.mimeType,
          size: d.size,
          createdAt: d.createdAt,
          uploadedBy: displayName(by),
          url: await ctx.storage.getUrl(d.storageId),
        };
      })
    );
  },
});

export const add = mutation({
  args: {
    jobId: v.id("worthJobs"),
    name: v.string(),
    kind,
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const job = await getVisibleJob(ctx, access, args.jobId);
    // The admin who logged the job often holds the title deed, so they can attach too.
    if (!access.caps.canManageJobs) requireWorker(access, job);
    if (job.status === "issued" || job.status === "cancelled") {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("This job is closed");
    }
    if (args.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Files must be 15 MB or smaller");
    }
    await ctx.db.insert("worthDocuments", {
      orgId: job.orgId,
      jobId: job._id,
      name: args.name.trim() || "Document",
      kind: args.kind,
      storageId: args.storageId,
      mimeType: args.mimeType,
      size: args.size,
      uploadedByUserId: access.user._id,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { documentId: v.id("worthDocuments") },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.orgId !== access.orgId) throw new ConvexError("Document not found");
    const job = await getVisibleJob(ctx, access, doc.jobId);
    if (!access.caps.canManageJobs) requireWorker(access, job);
    if (job.status === "issued") throw new ConvexError("Documents on an issued job are kept");
    await ctx.db.delete(doc._id);
    await ctx.storage.delete(doc.storageId);
  },
});
