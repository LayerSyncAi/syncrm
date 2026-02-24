import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin, getCurrentUserOptional, getCurrentUserWithOrg } from "./helpers";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMe = query({
  handler: async (ctx) => {
    return getCurrentUserOptional(ctx);
  },
});

// Debug query to understand auth state - helps diagnose user lookup issues
export const debugAuthState = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();

    let user = null;
    if (userId) {
      user = await ctx.db.get(userId);
    }

    return {
      authUserId: userId,
      userFound: !!user,
      user: user ? {
        id: user._id,
        email: user.email,
        isActive: user.isActive,
        role: user.role,
        orgId: user.orgId,
      } : null,
      identity: identity ? {
        subject: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        email: identity.email,
        issuer: identity.issuer,
      } : null,
    };
  },
});

export const getMeRequired = query({
  handler: async (ctx) => {
    return getCurrentUser(ctx);
  },
});

export const adminListUsers = query({
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const allUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return allUsers;
  },
});

export const adminCreateUser = mutation({
  args: {
    email: v.string(),
    fullName: v.string(),
    role: v.union(v.literal("admin"), v.literal("agent")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      if (existing.orgId && existing.orgId !== admin.orgId) {
        throw new Error("A user with this email already belongs to another organization");
      }
      return existing._id;
    }
    const timestamp = Date.now();
    return ctx.db.insert("users", {
      email: args.email,
      fullName: args.fullName,
      role: args.role,
      isActive: args.isActive,
      orgId: admin.orgId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const adminSetUserActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.orgId !== admin.orgId) {
      throw new Error("User not found");
    }
    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const adminSetUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const currentAdmin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.orgId !== currentAdmin.orgId) {
      throw new Error("User not found");
    }

    // Prevent demoting self if last admin in the org
    if (
      currentAdmin._id === args.userId &&
      args.role === "agent" &&
      targetUser.role === "admin"
    ) {
      const orgUsers = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("orgId", currentAdmin.orgId))
        .collect();
      const adminCount = orgUsers.filter(
        (u) => u.role === "admin" && u.isActive
      ).length;

      if (adminCount <= 1) {
        throw new Error(
          "Cannot remove admin role. You are the last admin. Promote another user first."
        );
      }
    }

    await ctx.db.patch(args.userId, {
      role: args.role,
      updatedAt: Date.now(),
    });
  },
});

export const getAdminCount = query({
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return orgUsers.filter((u) => u.role === "admin" && u.isActive).length;
  },
});

export const listActiveUsers = query({
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return orgUsers
      .filter((u) => u.isActive)
      .map((u) => ({
        _id: u._id,
        name: u.fullName || u.name || u.email || "Unknown",
        email: u.email,
        role: u.role,
      }));
  },
});

export const listForAssignment = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return orgUsers
      .filter((u) => u.isActive)
      .map((u) => ({
        _id: u._id,
        name: u.fullName || u.name || u.email || "Unknown",
      }));
  },
});

export const updateMyTimezone = mutation({
  args: {
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    // Validate timezone string using Intl
    try {
      Intl.DateTimeFormat(undefined, { timeZone: args.timezone });
    } catch {
      throw new Error("Invalid timezone");
    }
    await ctx.db.patch(user._id, {
      timezone: args.timezone,
      updatedAt: Date.now(),
    });
  },
});

export const adminUpdateUserTimezone = mutation({
  args: {
    userId: v.id("users"),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.orgId !== admin.orgId) {
      throw new Error("User not found");
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: args.timezone });
    } catch {
      throw new Error("Invalid timezone");
    }
    await ctx.db.patch(args.userId, {
      timezone: args.timezone,
      updatedAt: Date.now(),
    });
  },
});

export const listAll = query({
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return orgUsers
      .filter((u) => u.isActive)
      .map((u) => ({
        _id: u._id,
        fullName: u.fullName,
        name: u.name,
        email: u.email,
        role: u.role,
      }));
  },
});
