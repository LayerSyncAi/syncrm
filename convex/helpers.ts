import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get the current user from the authenticated session.
 *
 * In Convex Auth, when createOrUpdateUser returns a user ID, that ID is stored
 * in the authAccounts table. We look up the authAccount to get the userId,
 * then get the user.
 *
 * Returns null if:
 * - No authenticated session
 * - User not found in database
 * - User is not active
 */
export async function getCurrentUserOptional(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  // Debug logging in development
  const isDebug = process.env.NODE_ENV === "development" || process.env.CONVEX_DEBUG;
  if (isDebug) {
    console.log("[getCurrentUserOptional] Identity:", {
      hasIdentity: !!identity,
      subject: identity?.subject,
      tokenIdentifier: identity?.tokenIdentifier,
      email: identity?.email,
      issuer: identity?.issuer,
    });
  }

  if (!identity) {
    return null;
  }

  let user = null;

  // Strategy 1: Look up authAccount by providerAccountId
  // The tokenIdentifier format is "<provider>|<providerAccountId>"
  // For Password provider, providerAccountId is typically the email
  const tokenParts = identity.tokenIdentifier.split("|");
  const providerAccountId = tokenParts.length > 1 ? tokenParts.slice(1).join("|") : identity.tokenIdentifier;

  if (isDebug) {
    console.log("[getCurrentUserOptional] Looking up authAccount with providerAccountId:", providerAccountId);
  }

  // Try to find the auth account by providerAccountId
  let authAccount = await ctx.db
    .query("authAccounts")
    .filter((q) => q.eq(q.field("providerAccountId"), providerAccountId))
    .first();

  // If not found, try with email (for Password provider)
  if (!authAccount && identity.email) {
    authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("providerAccountId"), identity.email))
      .first();
  }

  if (authAccount?.userId) {
    // Found the auth account, get the user by ID
    user = await ctx.db.get(authAccount.userId as Id<"users">);
    if (isDebug) {
      console.log("[getCurrentUserOptional] Found user via authAccount:", {
        authAccountId: authAccount._id,
        userId: authAccount.userId,
        userFound: !!user,
        userEmail: user?.email,
        userIsActive: user?.isActive,
      });
    }
  }

  // Strategy 2: Try to find user by email if we have one and didn't find via authAccount
  if (!user && identity.email) {
    user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();
    if (isDebug) {
      console.log("[getCurrentUserOptional] Fallback lookup by email:", {
        email: identity.email,
        userFound: !!user,
        userIsActive: user?.isActive,
      });
    }
  }

  // Strategy 3: If we still have no user but identity is valid, scan authAccounts
  // to find any account matching this session (expensive, but helps debug)
  if (!user && isDebug) {
    const allAccounts = await ctx.db.query("authAccounts").collect();
    console.log("[getCurrentUserOptional] Debug - All authAccounts:", allAccounts.map(a => ({
      id: a._id,
      userId: a.userId,
      provider: (a as Record<string, unknown>).provider,
      providerAccountId: (a as Record<string, unknown>).providerAccountId,
    })));
  }

  if (!user) {
    if (isDebug) {
      console.log("[getCurrentUserOptional] No user found for identity");
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
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }

  const user = await getCurrentUserOptional(ctx);
  if (!user) {
    throw new ConvexError("User not found or not active");
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
