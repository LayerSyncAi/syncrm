import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";

const documentType = v.union(v.literal("privacy"), v.literal("terms"));

/**
 * Record the current user's acceptance of one or more versioned legal
 * documents. Called immediately after sign-up. Stores user, document type,
 * version, and timestamp for an auditable acceptance trail.
 */
export const recordAcceptance = mutation({
  args: {
    acceptances: v.array(
      v.object({ documentType, version: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const acceptedAt = Date.now();
    for (const a of args.acceptances) {
      await ctx.db.insert("legalAcceptances", {
        userId: user._id,
        documentType: a.documentType,
        version: a.version,
        acceptedAt,
        orgId: user.orgId,
      });
    }
  },
});

/** The current user's most recent acceptance per document type. */
export const myAcceptances = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const rows = await ctx.db
      .query("legalAcceptances")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.sort((a, b) => b.acceptedAt - a.acceptedAt);
  },
});
