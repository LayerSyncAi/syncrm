/**
 * Who may use developments and stand sales.
 *
 * The data is shared by two modules an agency pays for separately, so each
 * works on its own: SyncDev (inventory and sales) and SyncFinance (the
 * instalment money). Either opens it.
 *
 *  - SyncDev: every agent sees availability and can reserve a stand.
 *  - Directors, sales managers and accounts also price, sell, take payments
 *    and cancel. Accounts staff with SyncFinance do the same from Finance.
 *  - Reversing a payment is for directors and accounts.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserWithOrg } from "../helpers";
import { hasEstateRole, orgModules, userCanUseModule } from "../lib/modules";
import { recordAudit } from "../logs";
import { userLabel } from "../stay/shared";

type Ctx = QueryCtx | MutationCtx;

export type SalesAccess = Awaited<ReturnType<typeof requireSales>>;

export async function requireSales(ctx: Ctx) {
  const user = await getCurrentUserWithOrg(ctx);
  const org = await ctx.db.get(user.orgId);
  if (!org) throw new ConvexError("Organisation not found");
  const isDirector = user.role === "admin" && !user.agentMode;
  const isAccounts = hasEstateRole(user, "accounts");
  const viaDev = userCanUseModule(user, org, "dev");
  const viaFinance = userCanUseModule(user, org, "finance") && (user.role === "admin" || isAccounts);
  if (!viaDev && !viaFinance) throw new ConvexError("SyncDev is not available to you");
  const modules = orgModules(org);
  return {
    user,
    org,
    orgId: user.orgId,
    isDirector,
    /** Price, sell, take payments, cancel and charge interest. */
    canManage: user.role === "admin" || isAccounts || hasEstateRole(user, "sales_manager"),
    canReverse: isDirector || isAccounts,
    /** Payments go through the trust ledger when the agency has Finance. */
    financeOn: modules.includes("finance"),
    devOn: modules.includes("dev"),
  };
}

export function requireManage(access: SalesAccess) {
  if (!access.canManage) throw new ConvexError("Your role cannot change sales. Ask a director or sales manager.");
}

export async function getDevelopment(ctx: Ctx, orgId: Id<"organizations">, id: Id<"finDevelopments">): Promise<Doc<"finDevelopments">> {
  const d = await ctx.db.get(id);
  if (!d || d.orgId !== orgId) throw new ConvexError("Development not found");
  return d;
}

export async function devAudit(
  ctx: MutationCtx,
  access: { user: Doc<"users">; orgId: Id<"organizations"> },
  args: { action: string; description: string; targetType: string; targetId: string; targetLabel?: string; metadata?: Record<string, unknown> }
) {
  await recordAudit(ctx, { actorUserId: access.user._id, actorLabel: userLabel(access.user), category: "dev", orgId: access.orgId, ...args });
}
