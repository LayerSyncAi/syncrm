import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUser, requireAdmin, getCurrentUserOptional, getCurrentUserWithOrg } from "./helpers";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";

/** Default temporary password for admin-created users */
const DEFAULT_TEMP_PASSWORD = "1234";

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

// Internal mutation to create a user record + auth account atomically
export const adminCreateUserInternal = internalMutation({
  args: {
    email: v.string(),
    fullName: v.string(),
    role: v.union(v.literal("admin"), v.literal("agent")),
    isActive: v.boolean(),
    adminId: v.id("users"),
    orgId: v.id("organizations"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for existing user
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      if (existing.orgId && existing.orgId !== args.orgId) {
        throw new Error("A user with this email already belongs to another organization");
      }
      return { userId: existing._id, alreadyExisted: true };
    }

    const timestamp = Date.now();
    const userId = await ctx.db.insert("users", {
      email: args.email,
      fullName: args.fullName,
      name: args.fullName,
      role: args.role,
      isActive: args.isActive,
      orgId: args.orgId,
      resetPasswordOnNextLogin: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Create an auth account so the user can sign in with the temp password
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: args.email,
      secret: args.passwordHash,
    });

    console.log(
      `[Admin] User created by admin ${args.adminId}: ${args.email} (${args.role}), resetPasswordOnNextLogin=true`
    );

    return { userId, alreadyExisted: false };
  },
});

// Action: Admin creates a user with a hashed temp password
export const adminCreateUser = action({
  args: {
    email: v.string(),
    fullName: v.string(),
    role: v.union(v.literal("admin"), v.literal("agent")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<string> => {
    // Verify caller is admin
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.runQuery(internal.users.getAdminForAction, { userId: adminId });
    if (!admin) throw new Error("Admin access required");

    // Hash the default temp password using Scrypt (same as @convex-dev/auth Password provider)
    const passwordHash = await new Scrypt().hash(DEFAULT_TEMP_PASSWORD);

    const result = await ctx.runMutation(internal.users.adminCreateUserInternal, {
      email: args.email.trim().toLowerCase(),
      fullName: args.fullName.trim(),
      role: args.role,
      isActive: args.isActive,
      adminId: admin._id,
      orgId: admin.orgId,
      passwordHash,
    });

    return result.userId;
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

// Internal query used by actions to verify admin status
export const getAdminForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.isActive || user.role !== "admin" || !user.orgId) {
      return null;
    }
    return { _id: user._id, orgId: user.orgId };
  },
});

// Internal mutation to reset a user's password to the temp password
export const adminResetUserPasswordInternal = internalMutation({
  args: {
    adminId: v.id("users"),
    targetUserId: v.id("users"),
    orgId: v.id("organizations"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser || targetUser.orgId !== args.orgId) {
      throw new Error("User not found");
    }

    // Find the auth account for this user
    const account = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), args.targetUserId))
      .first();

    const now = Date.now();

    if (account) {
      // Update existing auth account password
      await ctx.db.patch(account._id, {
        secret: args.passwordHash,
      });
    } else {
      // Create auth account if it doesn't exist (e.g., user was created before this feature)
      await ctx.db.insert("authAccounts", {
        userId: args.targetUserId,
        provider: "password",
        providerAccountId: targetUser.email!,
        secret: args.passwordHash,
      });
    }

    // Set the forced reset flag
    await ctx.db.patch(args.targetUserId, {
      resetPasswordOnNextLogin: true,
      updatedAt: now,
    });

    console.log(
      `[Admin] Password reset by admin ${args.adminId} for user ${args.targetUserId}, resetPasswordOnNextLogin=true`
    );

    return { success: true };
  },
});

// Action: Admin resets a user's password to the default temp password
export const adminResetUserPassword = action({
  args: {
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Verify caller is admin
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.runQuery(internal.users.getAdminForAction, { userId: adminId });
    if (!admin) throw new Error("Admin access required");

    // Hash the default temp password using Scrypt
    const passwordHash = await new Scrypt().hash(DEFAULT_TEMP_PASSWORD);

    const result = await ctx.runMutation(internal.users.adminResetUserPasswordInternal, {
      adminId: admin._id,
      targetUserId: args.targetUserId,
      orgId: admin.orgId,
      passwordHash,
    });

    return result;
  },
});

// Internal mutation to update user's password after forced change
export const forceChangePasswordInternal = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Find the auth account
    const account = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!account) {
      throw new Error("No auth account found for user");
    }

    const now = Date.now();

    // Update password
    await ctx.db.patch(account._id, {
      secret: args.passwordHash,
    });

    // Clear forced reset flag and set password updated timestamp
    await ctx.db.patch(args.userId, {
      resetPasswordOnNextLogin: false,
      passwordUpdatedAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

// Action: User changes their own password (forced reset flow)
export const forceChangePassword = action({
  args: {
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Verify user is authenticated
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Validate password
    if (!args.newPassword || args.newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    // Hash the new password using Scrypt (compatible with @convex-dev/auth)
    const passwordHash = await new Scrypt().hash(args.newPassword);

    await ctx.runMutation(internal.users.forceChangePasswordInternal, {
      userId,
      passwordHash,
    });

    return { success: true };
  },
});
