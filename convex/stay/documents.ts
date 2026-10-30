/**
 * SyncStay documents: leases, ID copies, inspection reports and other files
 * kept against a property or lease. Upload is the usual two steps: ask for an
 * upload URL, post the file to it, then save the storage id here.
 *
 * visibleToTenant / visibleToLandlord decide what the portals will show.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { getVisibleLease, getVisibleStayProperty, requireStay } from "./access";
import { getVisibleUnit, visibleStayProperties } from "./maintenance";

const kindValidator = v.union(
  v.literal("lease"),
  v.literal("id_copy"),
  v.literal("inspection"),
  v.literal("statement"),
  v.literal("other")
);

const MAX_BYTES = 25 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStay(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    stayPropertyId: v.id("stayProperties"),
    unitId: v.optional(v.id("stayUnits")),
    leaseId: v.optional(v.id("stayLeases")),
    name: v.string(),
    kind: kindValidator,
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    visibleToTenant: v.optional(v.boolean()),
    visibleToLandlord: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sp = await getVisibleStayProperty(ctx, access, args.stayPropertyId);
    if (args.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Files can be up to 25 MB");
    }
    if (!args.name.trim()) throw new ConvexError("Name the document");
    if (args.leaseId) {
      const lease = await getVisibleLease(ctx, access, args.leaseId);
      if (lease.stayPropertyId !== sp._id) throw new ConvexError("Lease not found");
    }
    if (args.unitId) {
      const { unit } = await getVisibleUnit(ctx, access, args.unitId);
      if (unit.stayPropertyId !== sp._id) throw new ConvexError("Unit not found");
    }
    return await ctx.db.insert("stayDocuments", {
      orgId: access.orgId,
      stayPropertyId: sp._id,
      unitId: args.unitId,
      leaseId: args.leaseId,
      name: args.name.trim(),
      kind: args.kind,
      storageId: args.storageId,
      mimeType: args.mimeType,
      size: args.size,
      visibleToTenant: args.visibleToTenant ?? false,
      visibleToLandlord: args.visibleToLandlord ?? false,
      uploadedByUserId: access.user._id,
      createdAt: Date.now(),
    });
  },
});

/** Documents for a lease, or for a property (its own and its leases'). */
export const list = query({
  args: {
    stayPropertyId: v.optional(v.id("stayProperties")),
    leaseId: v.optional(v.id("stayLeases")),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    let rows: Doc<"stayDocuments">[];
    if (args.leaseId) {
      await getVisibleLease(ctx, access, args.leaseId);
      rows = await ctx.db
        .query("stayDocuments")
        .withIndex("by_lease", (q) => q.eq("leaseId", args.leaseId!))
        .order("desc")
        .take(200);
    } else if (args.stayPropertyId) {
      await getVisibleStayProperty(ctx, access, args.stayPropertyId);
      rows = await ctx.db
        .query("stayDocuments")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", args.stayPropertyId!))
        .order("desc")
        .take(200);
    } else {
      const props = await visibleStayProperties(ctx, access);
      rows = (
        await ctx.db
          .query("stayDocuments")
          .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
          .order("desc")
          .take(300)
      ).filter((d) => props.has(d.stayPropertyId));
    }
    rows = rows.filter((d) => d.orgId === access.orgId);

    const names = new Map<string, string>();
    const out = [];
    for (const d of rows) {
      if (!names.has(d.uploadedByUserId)) {
        const u = await ctx.db.get(d.uploadedByUserId);
        names.set(d.uploadedByUserId, u?.fullName || u?.name || u?.email || "Unknown");
      }
      out.push({
        ...d,
        url: await ctx.storage.getUrl(d.storageId),
        uploadedByName: names.get(d.uploadedByUserId)!,
        canDelete: access.isDirector || d.uploadedByUserId === access.user._id,
      });
    }
    return out;
  },
});

export const downloadUrl = query({
  args: { id: v.id("stayDocuments") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const d = await ctx.db.get(args.id);
    if (!d || d.orgId !== access.orgId) throw new ConvexError("Document not found");
    await getVisibleStayProperty(ctx, access, d.stayPropertyId);
    return await ctx.storage.getUrl(d.storageId);
  },
});

export const setVisibility = mutation({
  args: {
    id: v.id("stayDocuments"),
    visibleToTenant: v.boolean(),
    visibleToLandlord: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const d = await ctx.db.get(args.id);
    if (!d || d.orgId !== access.orgId) throw new ConvexError("Document not found");
    await getVisibleStayProperty(ctx, access, d.stayPropertyId);
    await ctx.db.patch(d._id, {
      visibleToTenant: args.visibleToTenant,
      visibleToLandlord: args.visibleToLandlord,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("stayDocuments") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const d = await ctx.db.get(args.id);
    if (!d || d.orgId !== access.orgId) throw new ConvexError("Document not found");
    await getVisibleStayProperty(ctx, access, d.stayPropertyId);
    if (!access.isDirector && d.uploadedByUserId !== access.user._id) {
      throw new ConvexError("Only a director or the uploader can delete this");
    }
    await ctx.storage.delete(d.storageId);
    await ctx.db.delete(d._id);
  },
});
