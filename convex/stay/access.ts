/**
 * SyncStay access rules (BRD Stay §3), enforced on the server:
 *  - director (org admin): everything.
 *  - property manager: properties assigned to them, and their tenants,
 *    leases, payments and requests. Can edit leases.
 *  - accounts clerk: sees every property, records payments and receipts,
 *    views arrears. Cannot edit leases.
 * A person can hold both staff roles; capabilities are the union.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireModuleUser } from "../lib/moduleAccess";
import { hasEstateRole } from "../lib/modules";

export type StayAccess = Awaited<ReturnType<typeof requireStay>>;

export async function requireStay(ctx: QueryCtx | MutationCtx) {
  const { user, org } = await requireModuleUser(ctx, "stay");
  // Agent Mode narrows an admin to their own work, as everywhere else.
  const isDirector = user.role === "admin" && !user.agentMode;
  const isAccounts = hasEstateRole(user, "accounts");
  const isManager = hasEstateRole(user, "property_manager") || user.role === "admin";
  return {
    user,
    org,
    orgId: user.orgId,
    isDirector,
    /** Sees every Stay property in the org. */
    seesAll: isDirector || isAccounts,
    canEditLeases: isDirector || isManager,
    canRecordPayments: true,
    /** Settings, imports and reversals. */
    canAdmin: isDirector,
  };
}

export function canSeeStayProperty(
  access: StayAccess,
  sp: Pick<Doc<"stayProperties">, "orgId" | "managerUserId"> | null
): boolean {
  if (!sp || sp.orgId !== access.orgId) return false;
  return access.seesAll || sp.managerUserId === access.user._id;
}

/** Load a Stay property the caller may see, or throw. */
export async function getVisibleStayProperty(
  ctx: QueryCtx | MutationCtx,
  access: StayAccess,
  id: Id<"stayProperties">
): Promise<Doc<"stayProperties">> {
  const sp = await ctx.db.get(id);
  if (!sp || !canSeeStayProperty(access, sp)) throw new ConvexError("Property not found");
  return sp;
}

/** Load a lease whose property the caller may see, or throw. */
export async function getVisibleLease(
  ctx: QueryCtx | MutationCtx,
  access: StayAccess,
  id: Id<"stayLeases">
): Promise<Doc<"stayLeases">> {
  const lease = await ctx.db.get(id);
  if (!lease || lease.orgId !== access.orgId) throw new ConvexError("Lease not found");
  if (!access.seesAll && lease.managerUserId !== access.user._id) {
    throw new ConvexError("Lease not found");
  }
  return lease;
}

export function requireLeaseEditor(access: StayAccess) {
  if (!access.canEditLeases) throw new ConvexError("Your role cannot edit leases");
}

export function requireStayAdmin(access: StayAccess) {
  if (!access.canAdmin) throw new ConvexError("Director access required");
}
