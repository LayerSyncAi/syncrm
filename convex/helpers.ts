import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/**
 * Get the current user from the authenticated session using Convex Auth's getAuthUserId.
 * Returns null if not authenticated, user not found, or user is not active.
 */
export async function getCurrentUserOptional(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user || !user.isActive) return null;

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

/**
 * Get the current user with their orgId, ensuring they belong to an org.
 * Returns the user object (which includes orgId).
 */
export async function getCurrentUserWithOrg(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user.orgId) {
    throw new ConvexError("User is not associated with an organization");
  }
  return user as typeof user & { orgId: Id<"organizations"> };
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserWithOrg(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return user;
}

/**
 * Effective-admin for DATA VISIBILITY: a real admin who has toggled into Agent
 * Mode is treated as a normal agent, so they see only their own work. This never
 * affects hard permission gates — requireAdmin and access checks stay on the
 * real role; Agent Mode is a focus/visibility preference, not a privilege drop.
 */
export function isEffectiveAdmin(user: {
  role: "admin" | "agent";
  agentMode?: boolean;
}): boolean {
  return user.role === "admin" && !user.agentMode;
}

/**
 * Verify that a record belongs to the same org as the current user.
 * Throws if the record's orgId doesn't match the user's orgId.
 */
export function assertOrgAccess(
  record: { orgId?: Id<"organizations"> } | null,
  userOrgId: Id<"organizations">
): void {
  if (!record) return;
  // Records without an orgId are legacy/global - allow access
  if (!record.orgId) return;
  if (record.orgId !== userOrgId) {
    throw new ConvexError("Access denied: record belongs to a different organization");
  }
}
