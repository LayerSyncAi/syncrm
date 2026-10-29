import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUserWithOrg,
  assertOrgAccess,
  canAccessPropertyPrivate,
  assertCanAccessPropertyPrivate,
  canManageProperty,
} from "./helpers";
import { recordAudit } from "./logs";
import { canAccessContact } from "./contacts";

const folderValidator = v.union(
  v.literal("mandates_to_sell"),
  v.literal("contracts"),
  v.literal("id_copies"),
  v.literal("proof_of_funds"),
  v.literal("lead_documentation")
);

/**
 * Upload a document linked to a lead, property or contact.
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
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const parents = [args.leadId, args.propertyId, args.contactId].filter(Boolean).length;
    if (parents === 0) {
      throw new Error("Document must be linked to a lead, property or contact");
    }
    if (parents > 1) {
      throw new Error("Document can only be linked to one record");
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
      // Only owners, authorised collaborators and admins may attach documents
      // to a property — uploading is a privileged action, not just viewing.
      await assertCanAccessPropertyPrivate(ctx, property, user);
    }
    if (args.contactId) {
      const contact = await canAccessContact(ctx, args.contactId, user._id, user.role === "admin", user.orgId);
      if (!contact) throw new Error("Contact not found");
    }

    return ctx.db.insert("documents", {
      name: args.name,
      folder: args.folder,
      storageId: args.storageId,
      mimeType: args.mimeType,
      size: args.size,
      leadId: args.leadId,
      propertyId: args.propertyId,
      contactId: args.contactId,
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

    const property = await ctx.db.get(args.propertyId);
    if (!property) return [];
    if (property.orgId && property.orgId !== user.orgId) return [];

    // Access control: only owners, authorised collaborators and admins may see
    // a property's documents (or even that any exist). Everyone else gets an
    // empty list — no metadata, no count, no indication of private documents.
    if (!(await canAccessPropertyPrivate(ctx, property, user))) {
      return [];
    }

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
 * List documents for a contact (HB-40). Only the contact's agents and admins
 * see them, the same people who can open the contact.
 */
export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(ctx, args.contactId, user._id, user.role === "admin", user.orgId);
    if (!contact) return [];

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .take(500);

    return await Promise.all(
      docs
        .filter((d) => d.orgId === user.orgId)
        .map(async (doc) => ({ ...doc, url: await ctx.storage.getUrl(doc.storageId) }))
    );
  },
});

/**
 * Record that an admin viewed a property's private documents via their admin
 * bypass (i.e. they are neither an owner nor a collaborator). Called from the
 * UI when the documents tab opens. No-op for owners/collaborators and for
 * non-admins. Queries can't write, so this audit hook is a thin mutation.
 */
export const logAdminPropertyDocumentAccess = mutation({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (user.role !== "admin") return;

    const property = await ctx.db.get(args.propertyId);
    if (!property) return;
    if (property.orgId && property.orgId !== user.orgId) return;

    // Only log the privileged bypass: an admin who is NOT an owner.
    const owners = property.ownerUserIds ?? [];
    if (owners.some((id) => id === user._id)) return;
    const collab = await ctx.db
      .query("propertyCollaborators")
      .withIndex("by_property_agent", (q) =>
        q.eq("propertyId", args.propertyId).eq("agentId", user._id)
      )
      .first();
    if (collab) return;

    // Avoid log spam: skip if this admin already has a recent access record
    // for this property (within the last hour).
    const HOUR = 60 * 60 * 1000;
    const recent = await ctx.db
      .query("auditLogs")
      .withIndex("by_actor", (q) => q.eq("actorUserId", user._id))
      .order("desc")
      .take(25);
    const alreadyLogged = recent.some(
      (r) =>
        r.action === "property.documents_admin_access" &&
        r.targetId === args.propertyId &&
        Date.now() - r.createdAt < HOUR
    );
    if (alreadyLogged) return;

    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "property.documents_admin_access",
      category: "property",
      description: `Admin viewed private documents for "${property.title}"`,
      targetType: "property",
      targetId: args.propertyId,
      targetLabel: property.title,
      orgId: user.orgId,
    });
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

    // For property documents, enforce property-level access: the uploader, an
    // owner/manager, or an admin may delete. Collaborators may delete what
    // they uploaded.
    if (doc.propertyId) {
      const property = await ctx.db.get(doc.propertyId);
      await assertCanAccessPropertyPrivate(ctx, property, user);
      const isUploader = doc.uploadedByUserId === user._id;
      if (!isUploader && !canManageProperty(property, user)) {
        throw new Error("You are not authorised to delete this document");
      }
    }
    if (doc.contactId) {
      const contact = await canAccessContact(ctx, doc.contactId, user._id, user.role === "admin", user.orgId);
      if (!contact) throw new Error("You are not authorised to delete this document");
    }

    // Delete the stored file
    await ctx.storage.delete(doc.storageId);
    // Delete the document record
    await ctx.db.delete(args.documentId);
  },
});
