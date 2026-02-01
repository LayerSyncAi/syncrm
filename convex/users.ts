import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin, getCurrentUserOptional } from "./helpers";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMe = query({
  handler: async (ctx) => {
    return getCurrentUserOptional(ctx);
  },
});

// Debug query to understand auth state - helps diagnose user lookup issues
export const debugAuthState = query({
  handler: async (ctx) => {
    // Use the canonical getAuthUserId from Convex Auth
    const userId = await getAuthUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();

    // Get user if we have a userId
    let user = null;
    if (userId) {
      user = await ctx.db.get(userId);
    }

    // Get all users for comparison
    const allUsers = await ctx.db.query("users").collect();
    const allUsersInfo = allUsers.map((u) => ({
      id: u._id,
      email: u.email,
      isActive: u.isActive,
      role: u.role,
    }));

    return {
      // The key info - what getAuthUserId returns
      authUserId: userId,
      userFound: !!user,
      user: user ? {
        id: user._id,
        email: user.email,
        isActive: user.isActive,
        role: user.role,
      } : null,
      // Identity info for comparison
      identity: identity ? {
        subject: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        email: identity.email,
        issuer: identity.issuer,
      } : null,
      // All users in DB
      allUsers: allUsersInfo,
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
    await requireAdmin(ctx);
    return ctx.db.query("users").collect();
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
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      return existing._id;
    }
    const timestamp = Date.now();
    return ctx.db.insert("users", {
      email: args.email,
      fullName: args.fullName,
      role: args.role,
      isActive: args.isActive,
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
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// Admin function to change user role
export const adminSetUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const currentAdmin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Prevent demoting self if last admin
    if (
      currentAdmin._id === args.userId &&
      args.role === "agent" &&
      targetUser.role === "admin"
    ) {
      // Count admins
      const allUsers = await ctx.db.query("users").collect();
      const adminCount = allUsers.filter(
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

// Get count of active admins
export const getAdminCount = query({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const allUsers = await ctx.db.query("users").collect();
    return allUsers.filter((u) => u.role === "admin" && u.isActive).length;
  },
});
