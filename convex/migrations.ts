import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Backfill the ownership model onto pre-existing properties.
 *
 * Run from the CLI / dashboard:
 *   npx convex run migrations:backfillPropertyOwnership
 *   # repeat until it reports { isDone: true } for very large tables
 *
 * Rule (per spec): assign to the creating agent if known, otherwise the
 * company.
 *   - creator is an active agent  -> ownershipType "agent",  owners [creator]
 *   - creator is an admin/unknown -> ownershipType "company", owners []
 *
 * Idempotent: a property that already has `ownershipType` is skipped, so the
 * job is safe to re-run.
 */
export const backfillPropertyOwnership = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 500);

    const all = await ctx.db.query("properties").collect();
    const pending = all.filter((p) => !p.ownershipType);

    let updated = 0;
    for (const property of pending) {
      if (updated >= batchSize) break;

      let ownershipType: "agent" | "company" = "company";
      let ownerUserIds: typeof property.ownerUserIds = [];

      if (property.createdByUserId) {
        const creator = await ctx.db.get(property.createdByUserId);
        if (creator && creator.isActive && creator.role === "agent") {
          ownershipType = "agent";
          ownerUserIds = [property.createdByUserId];
        }
      }

      await ctx.db.patch(property._id, { ownershipType, ownerUserIds });
      updated++;
    }

    const remaining = pending.length - updated;
    return {
      scanned: all.length,
      pending: pending.length,
      updated,
      remaining,
      isDone: remaining === 0,
    };
  },
});
