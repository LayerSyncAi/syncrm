import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";

const folderValidator = v.union(
  v.literal("mandates_to_sell"),
  v.literal("contracts"),
  v.literal("id_copies"),
  v.literal("proof_of_funds"),
  v.literal("lead_documentation")
);

/**
 * Upload a document linked to a lead or property.
 */
export const upload = mutation({
  args: {
    name: v.string(),
    folder: folderValidator,
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    leadId: v.optional(v.id("leads")),
    propertyId: v.optional(v.id("properties")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    if (!args.leadId && !args.propertyId) {
      throw new Error("Document must be linked to a lead or property");
    }
    if (args.leadId && args.propertyId) {
      throw new Error("Document cannot be linked to both a lead and a property");
    }

    // Verify the parent entity exists and belongs to the same org
    if (args.leadId) {
      const lead = await ctx.db.get(args.leadId);
      if (!lead) throw new Error("Lead not found");
      assertOrgAccess(lead, user.orgId);
    }
    if (args.propertyId) {
      const property = await ctx.db.get(args.propertyId);
      if (!property) throw new Error("Property not found");
      assertOrgAccess(property, user.orgId);
    }

    return ctx.db.insert("documents", {
      name: args.name,
      folder: args.folder,
      storageId: args.storageId,
      mimeType: args.mimeType,
      size: args.size,
      leadId: args.leadId,
      propertyId: args.propertyId,
      uploadedByUserId: user._id,
      orgId: user.orgId,
      createdAt: Date.now(),
    });
  },
});

/**
 * List documents for a lead.
 */
export const listByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();

    // Filter by org
    const filtered = docs.filter(
      (d) => !d.orgId || d.orgId === user.orgId
    );

    // Resolve storage URLs
    const withUrls = await Promise.all(
      filtered.map(async (doc) => {
        const url = await ctx.storage.getUrl(doc.storageId);
        return { ...doc, url };
      })
    );

    return withUrls;
  },
});

/**
 * List documents for a property.
 */
export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    const filtered = docs.filter(
      (d) => !d.orgId || d.orgId === user.orgId
    );

    const withUrls = await Promise.all(
      filtered.map(async (doc) => {
        const url = await ctx.storage.getUrl(doc.storageId);
        return { ...doc, url };
      })
    );

    return withUrls;
  },
});

/**
 * Delete a document and its stored file.
 */
export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    assertOrgAccess(doc, user.orgId);

    // Delete the stored file
    await ctx.storage.delete(doc.storageId);
    // Delete the document record
    await ctx.db.delete(args.documentId);
  },
});
