import { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { NotificationModule } from "./modules";

type NotifyArgs = {
  orgId: Id<"organizations">;
  module: NotificationModule;
  kind: string;
  title: string;
  body?: string;
  href?: string;
};

/**
 * Post an alert to one or more staff users' notification centre. Duplicate
 * ids are collapsed, so callers can pass e.g. [manager, director] freely.
 * Every active recipient also gets a push on their phone and any browser
 * they subscribed; recipients who chose this module's alerts by email
 * (HB-61) get an email too. Both are sent after the transaction commits.
 */
export async function notifyUsers(
  ctx: MutationCtx,
  userIds: ReadonlyArray<Id<"users"> | undefined | null>,
  args: NotifyArgs
): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(userIds.filter((id): id is Id<"users"> => !!id))];
  const emailTo: string[] = [];
  for (const userId of unique) {
    await ctx.db.insert("notifications", { ...args, userId, createdAt: now });
    const user = await ctx.db.get(userId);
    if (!user?.isActive) continue;
    await ctx.scheduler.runAfter(0, internal.pushSender.sendToUser, {
      userId,
      title: args.title,
      body: args.body ?? "",
      url: args.href,
      // Same kind about the same record replaces the older push on the phone.
      tag: `${args.kind}:${args.href ?? ""}`,
    });
    if (user.email && user.emailAlertModules?.includes(args.module)) {
      emailTo.push(user.email);
    }
  }
  if (emailTo.length > 0) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendAlertEmails, {
      to: emailTo,
      orgId: args.orgId,
      module: args.module,
      kind: args.kind,
      title: args.title,
      body: args.body,
      href: args.href,
    });
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
