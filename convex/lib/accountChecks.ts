import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Why `email` cannot become a new staff login, or null when it is free.
 * Logins are global (one `users` row per email across every organisation),
 * so an address already used by a platform account, another agency or a
 * landlord/tenant portal login cannot be reused.
 *
 * `forOrgId` is the agency the login would join; an existing member of that
 * same agency gets a "reset their password instead" hint.
 */
export async function emailUnavailableReason(
  ctx: QueryCtx | MutationCtx,
  email: string,
  forOrgId?: Id<"organizations">
): Promise<string | null> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!existing) return null;
  if (existing.isPlatformAdmin) {
    return "This email belongs to a platform (LayerSync) account and cannot join an organization";
  }
  if (existing.orgId && existing.orgId !== forOrgId) {
    return "A user with this email already belongs to another organization";
  }
  if (existing.portalKind) {
    return "This email is already used for a landlord or tenant portal login";
  }
  if (existing.orgId) {
    return "This email already has a login in your agency. Reset their password instead.";
  }
  return "This email already has a SyncEstate login that is not part of an organization";
}

/** Throws a user-facing error when `email` cannot become a new staff login. */
export async function assertEmailAvailable(
  ctx: QueryCtx | MutationCtx,
  email: string,
  forOrgId?: Id<"organizations">
): Promise<void> {
  const reason = await emailUnavailableReason(ctx, email, forOrgId);
  if (reason) throw new ConvexError(reason);
}
