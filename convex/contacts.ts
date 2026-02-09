import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, assertOrgAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function canAccessContact(
  ctx: any,
  contactId: Id<"contacts">,
  userId: Id<"users">,
  isAdmin: boolean,
  userOrgId: Id<"organizations">
) {
  const contact = await ctx.db.get(contactId);
  if (!contact) return null;
  if (contact.orgId && contact.orgId !== userOrgId) return null;
  if (isAdmin) return contact;
  if (contact.ownerUserIds.includes(userId)) return contact;
  return null;
}

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    ownerUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const timestamp = Date.now();

    let owners: Id<"users">[];
    if (user.role === "admin" && args.ownerUserIds && args.ownerUserIds.length > 0) {
      owners = args.ownerUserIds;
    } else {
      owners = [user._id];
    }

    return ctx.db.insert("contacts", {
      name: args.name,
      phone: args.phone,
      normalizedPhone: normalizePhone(args.phone),
      email: args.email,
      company: args.company,
      notes: args.notes,
      ownerUserIds: owners,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const list = query({
  args: {
    q: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const filtered = contacts.filter((contact) => {
      if (user.role !== "admin") {
        if (!contact.ownerUserIds.includes(user._id)) {
          return false;
        }
      }

      if (user.role === "admin" && args.ownerUserId) {
        if (!contact.ownerUserIds.includes(args.ownerUserId)) {
          return false;
        }
      }

      if (args.q) {
        const search = args.q.toLowerCase();
        const nameMatch = contact.name.toLowerCase().includes(search);
        const phoneMatch = contact.phone.includes(search) || contact.normalizedPhone.includes(normalizePhone(search));
        const emailMatch = contact.email?.toLowerCase().includes(search);
        const companyMatch = contact.company?.toLowerCase().includes(search);
        if (!nameMatch && !phoneMatch && !emailMatch && !companyMatch) {
          return false;
        }
      }

      return true;
    });

    return filtered.map((contact) => {
      const ownerNames = contact.ownerUserIds.map((ownerId) => {
        const owner = userMap.get(ownerId);
        return owner?.fullName || owner?.name || owner?.email || "Unknown";
      });
      return {
        ...contact,
        ownerNames,
      };
    });
  },
});

export const getById = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) return null;

    const ownerIds = contact.ownerUserIds;
    const allIds = [...ownerIds];
    if (!allIds.some(id => id === contact.createdByUserId)) {
      allIds.push(contact.createdByUserId);
    }
    const userDocs = await Promise.all(allIds.map(id => ctx.db.get(id)));
    const userMap: Map<string, { fullName?: string; name?: string; email?: string }> = new Map();
    for (const u of userDocs) {
      if (u) userMap.set(u._id as string, u as any);
    }

    const owners = ownerIds.map((ownerId: Id<"users">) => {
      const owner = userMap.get(ownerId as string);
      return {
        _id: ownerId,
        name: owner?.fullName || owner?.name || owner?.email || "Unknown",
      };
    });

    const createdBy = userMap.get(contact.createdByUserId as string);

    return {
      ...contact,
      owners,
      createdByName: createdBy?.fullName || createdBy?.name || createdBy?.email || "Unknown",
    };
  },
});

export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    ownerUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) {
      updates.phone = args.phone;
      updates.normalizedPhone = normalizePhone(args.phone);
    }
    if (args.email !== undefined) updates.email = args.email;
    if (args.company !== undefined) updates.company = args.company;
    if (args.notes !== undefined) updates.notes = args.notes;

    if (user.role === "admin" && args.ownerUserIds !== undefined) {
      if (args.ownerUserIds.length === 0) {
        throw new Error("Contact must have at least one owner");
      }
      updates.ownerUserIds = args.ownerUserIds;
    }

    await ctx.db.patch(args.contactId, updates);
  },
});

export const remove = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    await ctx.db.delete(args.contactId);
  },
});

export const addOwner = mutation({
  args: {
    contactId: v.id("contacts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    if (contact.ownerUserIds.includes(args.userId)) {
      return;
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || !targetUser.isActive || targetUser.orgId !== user.orgId) {
      throw new Error("User not found or inactive");
    }

    await ctx.db.patch(args.contactId, {
      ownerUserIds: [...contact.ownerUserIds, args.userId],
      updatedAt: Date.now(),
    });
  },
});

export const removeOwner = mutation({
  args: {
    contactId: v.id("contacts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const contact = await canAccessContact(
      ctx,
      args.contactId,
      user._id,
      user.role === "admin",
      user.orgId
    );
    if (!contact) {
      throw new Error("Contact not found or access denied");
    }

    if (contact.ownerUserIds.length <= 1) {
      throw new Error("Contact must have at least one owner");
    }

    if (!contact.ownerUserIds.includes(args.userId)) {
      return;
    }

    await ctx.db.patch(args.contactId, {
      ownerUserIds: contact.ownerUserIds.filter((id: Id<"users">) => id !== args.userId),
      updatedAt: Date.now(),
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    const accessible = contacts.filter((contact) => {
      if (user.role === "admin") return true;
      return contact.ownerUserIds.includes(user._id);
    });

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      total: accessible.length,
      newThisWeek: accessible.filter((c) => c.createdAt >= oneWeekAgo).length,
    };
  },
});
