/**
 * Data migrations for SyncFinance. Run from the CLI; each is safe to re-run.
 *
 *   npx convex run finance/migrations:rebuildAccountMonths '{"orgId":"..."}'
 *   # repeat with the returned cursor until isDone is true
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { round2 } from "./lib";

/**
 * Rebuild the per-month account totals (finAccountMonths) from the lines,
 * one account per call. Use after restoring data or if totals ever drift.
 */
export const rebuildAccountMonths = internalMutation({
  args: { orgId: v.id("organizations"), cursor: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("finAccounts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const i = args.cursor ?? 0;
    const account = accounts[i];
    if (!account) return { isDone: true, cursor: i };
    const old = await ctx.db
      .query("finAccountMonths")
      .withIndex("by_account_month", (q) => q.eq("accountId", account._id))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
    const lines = await ctx.db
      .query("finLines")
      .withIndex("by_account_date", (q) => q.eq("accountId", account._id))
      .collect();
    const byMonth = new Map<string, number>();
    for (const l of lines) byMonth.set(l.date.slice(0, 7), round2((byMonth.get(l.date.slice(0, 7)) ?? 0) + l.amount));
    for (const [month, net] of byMonth) await ctx.db.insert("finAccountMonths", { orgId: args.orgId, accountId: account._id, month, net });
    return { isDone: i + 1 >= accounts.length, cursor: i + 1, account: account.name, months: byMonth.size };
  },
});
