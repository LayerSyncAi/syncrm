import { query } from "../_generated/server";
import { getCurrentUserOptional } from "../helpers";
import { resolveOne } from "../branding";

/**
 * Who the portal is for: drawn by the portal shell. Null for anyone who is
 * not a portal user, so the shell can send staff back to the main app.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOptional(ctx);
    if (!user?.portalKind || !user.portalOrgId || !user.portalContactId) return null;
    const [org, contact] = await Promise.all([
      ctx.db.get(user.portalOrgId),
      ctx.db.get(user.portalContactId),
    ]);
    if (!org || !contact) return null;
    const branding = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    return {
      kind: user.portalKind,
      name: contact.name,
      orgName: org.name,
      orgPhone: org.phone ?? null,
      orgEmail: org.email ?? null,
      // For receipts and statements printed from the portal.
      logoUrl: (await resolveOne(ctx, branding?.logoRef)) ?? null,
    };
  },
});
