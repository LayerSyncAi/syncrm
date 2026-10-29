import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type NotifyArgs = {
  orgId: Id<"organizations">;
  module: "hub" | "crm" | "stay" | "worth" | "finance" | "dev" | "media";
  kind: string;
  title: string;
  body?: string;
  href?: string;
};

/**
 * Post an alert to one or more staff users' notification centre. Duplicate
 * ids are collapsed, so callers can pass e.g. [manager, director] freely.
 */
export async function notifyUsers(
  ctx: MutationCtx,
  userIds: ReadonlyArray<Id<"users"> | undefined | null>,
  args: NotifyArgs
): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(userIds.filter((id): id is Id<"users"> => !!id))];
  for (const userId of unique) {
    await ctx.db.insert("notifications", { ...args, userId, createdAt: now });
  }
}

/** Every active admin (director) of an org, for org-wide alerts. */
export async function orgAdminIds(
  ctx: MutationCtx,
  orgId: Id<"organizations">
): Promise<Id<"users">[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(500);
  return users.filter((u) => u.isActive && u.role === "admin").map((u) => u._id);
}
