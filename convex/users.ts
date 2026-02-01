import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin, getCurrentUserOptional } from "./helpers";
import { Id } from "./_generated/dataModel";

export const getMe = query({
  handler: async (ctx) => {
    return getCurrentUserOptional(ctx);
  },
});

// Debug query to understand auth state - helps diagnose user lookup issues
export const debugAuthState = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        hasIdentity: false,
        identity: null,
        authAccounts: [],
        matchingUser: null,
        allUsers: [],
      };
    }

    // Get identity details
    const identityInfo = {
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      issuer: identity.issuer,
      name: identity.name,
    };

    // Get all auth accounts to see what's in the DB
    const authAccounts = await ctx.db.query("authAccounts").collect();
    const authAccountsInfo = authAccounts.map((a) => ({
      id: a._id,
      userId: a.userId,
      provider: (a as Record<string, unknown>).provider,
      providerAccountId: (a as Record<string, unknown>).providerAccountId,
    }));

    // Try to find matching authAccount
    const tokenParts = identity.tokenIdentifier.split("|");
    const providerAccountId = tokenParts.length > 1 ? tokenParts.slice(1).join("|") : identity.tokenIdentifier;

    let matchingAccount = authAccounts.find(
      (a) => (a as Record<string, unknown>).providerAccountId === providerAccountId
    );
    if (!matchingAccount && identity.email) {
      matchingAccount = authAccounts.find(
        (a) => (a as Record<string, unknown>).providerAccountId === identity.email
      );
    }

    let matchingUser = null;
    if (matchingAccount?.userId) {
      matchingUser = await ctx.db.get(matchingAccount.userId as Id<"users">);
    }

    // Also try by email
    let userByEmail = null;
    if (identity.email) {
      userByEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .unique();
    }

    // Get all users for debugging
    const allUsers = await ctx.db.query("users").collect();
    const allUsersInfo = allUsers.map((u) => ({
      id: u._id,
      email: u.email,
      isActive: u.isActive,
      role: u.role,
    }));

    return {
      hasIdentity: true,
      identity: identityInfo,
      authAccounts: authAccountsInfo,
      matchingAccount: matchingAccount ? {
        id: matchingAccount._id,
        userId: matchingAccount.userId,
      } : null,
      matchingUser: matchingUser ? {
        id: matchingUser._id,
        email: matchingUser.email,
        isActive: matchingUser.isActive,
      } : null,
      userByEmail: userByEmail ? {
        id: userByEmail._id,
        email: userByEmail.email,
        isActive: userByEmail.isActive,
      } : null,
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
