import { query } from "./_generated/server";
import { getCurrentUser } from "./helpers";

// Legal acceptances are written atomically during sign-up by
// organizations.setupOrganization. This module exposes a read for surfacing a
// user's acceptance history (e.g. an admin/settings view or a re-acceptance
// prompt when LEGAL_VERSIONS changes).

/** The current user's acceptance records, newest first. */
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
