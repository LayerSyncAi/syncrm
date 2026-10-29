import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { getCurrentUserWithOrg } from "../helpers";
import { ModuleKey, userCanUseModule } from "./modules";

const MODULE_NAMES: Record<ModuleKey, string> = {
  crm: "SynCRM",
  stay: "Sync Stay",
  worth: "Sync Worth",
  finance: "Sync Finance",
  dev: "Sync Dev",
  media: "SyncMedia",
};

/**
 * The gate every module function goes through: a staff user of an org that
 * has `key` switched on, holding a role that opens it. Returns the user (with
 * orgId, as getCurrentUserWithOrg) and the org.
 *
 * Platform staff viewing an org pass as its admin for queries and are blocked
 * from mutations by getCurrentUserWithOrg. Portal users have no orgId and are
 * rejected there too.
 */
export async function requireModuleUser(ctx: QueryCtx | MutationCtx, key: ModuleKey) {
  const user = await getCurrentUserWithOrg(ctx);
  const org = await ctx.db.get(user.orgId);
  if (!org) throw new ConvexError("Organisation not found");
  if (!userCanUseModule(user, org, key)) {
    throw new ConvexError(`${MODULE_NAMES[key]} is not available to you`);
  }
  return { user, org };
}
