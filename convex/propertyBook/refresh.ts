"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const AGENCY_DELAY_MS = 2000;
const REFRESH_MAX_LISTINGS = 200;

export const refreshAllTracked = internalAction({
  args: {},
  handler: async (ctx): Promise<{ agencies: number; patched: number; errors: number }> => {
    if (process.env.PB_IMPORT_DISABLED === "true") {
      return { agencies: 0, patched: 0, errors: 0 };
    }
    const tracked = await ctx.runQuery(
      internal.propertyBook.listActiveTracked,
      {}
    );

    let patchedTotal = 0;
    let errorTotal = 0;

    for (const agency of tracked) {
      try {
        const result: {
          listings: Array<{
            pbRefCode: string;
            price: number;
            currency: string;
            status: "available";
          }>;
        } = await ctx.runAction(
          internal.propertyBook.scraper.fetchAgencyListings,
          { slug: agency.slug, maxListings: REFRESH_MAX_LISTINGS }
        );
        const entries = result.listings.map((l) => ({
          pbRefCode: l.pbRefCode,
          price: l.price,
          currency: l.currency,
          status: l.status,
        }));
        const { patched } = await ctx.runMutation(
          internal.propertyBook.applyRefresh,
          { orgId: agency.orgId, entries }
        );
        patchedTotal += patched;
        await ctx.runMutation(
          internal.propertyBook.markAgencyRefreshResult,
          {
            id: agency._id,
            status: "ok",
            error: undefined,
          }
        );
      } catch (e: unknown) {
        errorTotal++;
        await ctx.runMutation(
          internal.propertyBook.markAgencyRefreshResult,
          {
            id: agency._id,
            status: "error",
            error: (e as Error).message || "unknown",
          }
        );
      }
      await new Promise((r) => setTimeout(r, AGENCY_DELAY_MS));
    }

    return { agencies: tracked.length, patched: patchedTotal, errors: errorTotal };
  },
});
