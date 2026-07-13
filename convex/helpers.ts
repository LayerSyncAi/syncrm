import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  canAccessPropertyPrivatePure,
  canManagePropertyPure,
} from "./propertyAccessLib";

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

// =====================
// Property-level access control
// =====================

type AuthedUser = Doc<"users">;

/**
 * Returns true if `user` may see a property's PRIVATE data (documents, mandate
 * info, collaborator list). The property record itself stays discoverable in
 * the shared listing — this gate is only for sensitive attributes.
 *
 * Access is granted to:
 *  - admins (org-scoped) — they bypass agent-level restrictions,
 *  - the owning agent(s) (ownerUserIds),
 *  - explicitly authorised collaborators (propertyCollaborators),
 *  - legacy fallback: the creator, only while a property predates the
 *    ownership migration (no ownershipType / empty ownerUserIds).
 */
export async function canAccessPropertyPrivate(
  ctx: QueryCtx | MutationCtx,
  property: Doc<"properties"> | null,
  user: AuthedUser
): Promise<boolean> {
  if (!property) return false;

  // Fast path: admins / owners / un-migrated creator don't need a DB lookup.
  if (canAccessPropertyPrivatePure(property, user, false)) return true;

  // Otherwise the only remaining route is an explicit collaborator grant.
  const collab = await ctx.db
    .query("propertyCollaborators")
    .withIndex("by_property_agent", (q) =>
      q.eq("propertyId", property._id).eq("agentId", user._id)
    )
    .first();
  return canAccessPropertyPrivatePure(property, user, !!collab);
}

/**
 * Throws a ConvexError when the user cannot access the property's private data.
 * Use in mutations / queries that must hard-fail (uploads, deletes, etc.).
 */
export async function assertCanAccessPropertyPrivate(
  ctx: QueryCtx | MutationCtx,
  property: Doc<"properties"> | null,
  user: AuthedUser
): Promise<void> {
  const allowed = await canAccessPropertyPrivate(ctx, property, user);
  if (!allowed) {
    throw new ConvexError(
      "Access denied: you are not authorised to view this property's documents or mandate information"
    );
  }
}

/**
 * Whether `user` may manage a property: edit details, reassign ownership, and
 * add/remove collaborators. Admins and owners qualify; collaborators do not.
 */
export function canManageProperty(
  property: Doc<"properties"> | null,
  user: AuthedUser
): boolean {
  return canManagePropertyPure(property, user);
}
