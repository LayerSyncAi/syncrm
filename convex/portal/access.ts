/**
 * Landlord and tenant portal access (BRD Stay §3).
 *
 * A portal account is a `users` row with portalKind, portalContactId and
 * portalOrgId set and NO orgId. Staff functions go through
 * getCurrentUserWithOrg, which rejects any user without an orgId, so a portal
 * login can never reach staff data. Portal functions go through
 * requirePortal instead and read only rows tied to the account's own contact.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers";
import { orgModules } from "../lib/modules";

export async function requirePortal(
  ctx: QueryCtx | MutationCtx,
  kind?: "landlord" | "tenant"
) {
  const user = await getCurrentUser(ctx);
  if (!user.portalKind || !user.portalContactId || !user.portalOrgId || user.orgId) {
    throw new ConvexError("Portal access only");
  }
  if (kind && user.portalKind !== kind) throw new ConvexError("Portal access only");
  const org = await ctx.db.get(user.portalOrgId);
  if (!org || org.deletingAt || !orgModules(org).includes("stay")) {
    throw new ConvexError("This portal is not available");
  }
  return {
    user,
    org,
    orgId: user.portalOrgId,
    contactId: user.portalContactId,
    kind: user.portalKind,
  };
}

export type PortalAccess = Awaited<ReturnType<typeof requirePortal>>;
