/**
 * Data migrations for SyncDev. Run from the CLI; each is safe to re-run.
 *
 *   npx convex run dev/migrations:linkInventory
 *   # repeat until isDone is true
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Give every sale made before SyncDev existed (in Finance's Instalments or
 * by import) its inventory stand, so the stand grid shows it. Live sales
 * mark their stand sold; cancelled ones leave it available.
 */
export const linkInventory = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.batchSize ?? 200, 1), 500);
    const pending = (await ctx.db.query("finStands").collect()).filter((s) => !s.devStandId);
    let linked = 0;
    for (const sale of pending.slice(0, limit)) {
      const stands = await ctx.db
        .query("devStands")
        .withIndex("by_development", (q) => q.eq("developmentId", sale.developmentId))
        .collect();
      let stand = stands.find((s) => s.number.toLowerCase() === sale.standNumber.toLowerCase());
      const now = Date.now();
      const live = sale.status !== "cancelled";
      if (!stand) {
        const id = await ctx.db.insert("devStands", {
          orgId: sale.orgId,
          developmentId: sale.developmentId,
          number: sale.standNumber,
          price: sale.price,
          status: live ? "sold" : "available",
          saleId: live ? sale._id : undefined,
          createdAt: now,
          updatedAt: now,
        });
        stand = (await ctx.db.get(id))!;
      } else if (live && stand.status !== "sold") {
        await ctx.db.patch(stand._id, { status: "sold", saleId: sale._id, reservedFor: undefined, updatedAt: now });
      }
      await ctx.db.patch(sale._id, { devStandId: stand._id });
      linked++;
    }
    return { linked, remaining: pending.length - linked, isDone: pending.length - linked === 0 };
  },
});
