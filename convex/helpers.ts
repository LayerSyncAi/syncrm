import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get the current user from the authenticated session using Convex Auth's getAuthUserId.
 *
 * This is the correct way to get the current user in Convex Auth:
 * 1. getAuthUserId returns the user ID that was returned from createOrUpdateUser
 * 2. This ID is a document ID in our "users" table
 * 3. We can directly fetch the user document with ctx.db.get(userId)
 *
 * Returns null if:
 * - No authenticated session
 * - User not found in database
 * - User is not active
 */
export async function getCurrentUserOptional(ctx: QueryCtx | MutationCtx) {
  // Use getAuthUserId from @convex-dev/auth/server - this is the canonical way
  const userId = await getAuthUserId(ctx);

  // Debug logging in development
  const isDebug = process.env.NODE_ENV === "development" || process.env.CONVEX_DEBUG;
  if (isDebug) {
    console.log("[getCurrentUserOptional] getAuthUserId returned:", userId);
  }

  if (!userId) {
    if (isDebug) {
      console.log("[getCurrentUserOptional] No userId from getAuthUserId - user not authenticated");
    }
    return null;
  }

  // Fetch the user document directly by ID
  // The userId from getAuthUserId is the same ID returned by createOrUpdateUser
  const user = await ctx.db.get(userId);

  if (isDebug) {
    console.log("[getCurrentUserOptional] User lookup result:", {
      userId,
      userFound: !!user,
      userEmail: user?.email,
      userIsActive: user?.isActive,
    });
  }

  if (!user) {
    if (isDebug) {
      console.log("[getCurrentUserOptional] No user found for userId:", userId);
    }
    return null;
  }

  if (!user.isActive) {
    if (isDebug) {
      console.log("[getCurrentUserOptional] User found but not active:", user._id);
    }
    return null;
  }

  return user;
}

/**
 * Get the current user, throwing an error if not authenticated or not active.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Unauthorized");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("User not found");
  }

  if (!user.isActive) {
    throw new ConvexError("User account is not active");
  }

  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return user;
}
