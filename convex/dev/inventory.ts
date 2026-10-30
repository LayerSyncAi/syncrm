/**
 * SyncDev stand inventory: every stand in a development and whether it is
 * available, reserved or sold. Selling a stand creates the buyer's sale and
 * payment plan (sales.ts), linked both ways; cancelling the sale puts the
 * stand back on the market.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { todayForOrg } from "../stay/shared";
import { isValidDate, formatAmount } from "../stay/ledger";
import { buildPlan, round2 } from "../finance/lib";
import { devAudit, getDevelopment, requireManage, requireSales } from "./access";
import { insertStand, upsertBuyer } from "./sales";
import { compareStandNumbers, effectiveStatus, parseStandNumbers } from "./lib";

async function getInventoryStand(ctx: Parameters<typeof todayForOrg>[0], orgId: Id<"organizations">, id: Id<"devStands">) {
  const s = await ctx.db.get(id);
  if (!s || s.orgId !== orgId) throw new ConvexError("Stand not found");
  return s;
}

/** A development's stands in natural order, with the buyer's position on sold ones. */
export const list = query({
  args: { developmentId: v.id("finDevelopments") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    const dev = await getDevelopment(ctx, access.orgId, args.developmentId);
    const today = await todayForOrg(ctx, access.orgId);
    const stands = await ctx.db
      .query("devStands")
      .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
      .collect();
    const sales = new Map(
      (
        await ctx.db
          .query("finStands")
          .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
          .collect()
      ).map((s) => [s._id as string, s])
    );
    return {
      development: { _id: dev._id, name: dev.name, location: dev.location ?? "", currency: dev.currency, moneyHeldBy: dev.moneyHeldBy, isActive: dev.isActive },
      role: { canManage: access.canManage, financeOn: access.financeOn, userId: access.user._id },
      // The agency's date, for plan and reservation defaults.
      today,
      stands: stands
        .map((s) => {
          const sale = s.saleId ? sales.get(s.saleId) : undefined;
          return {
            _id: s._id,
            number: s.number,
            sizeSqm: s.sizeSqm ?? null,
            price: s.price,
            status: effectiveStatus(s, today),
            reservedFor: effectiveStatus(s, today) === "reserved" ? s.reservedFor ?? null : null,
            notes: s.notes ?? "",
            sale: sale
              ? { _id: sale._id, buyerName: sale.buyerName, paidToDate: sale.paidToDate, balance: sale.balance, overdue: sale.overdue, status: sale.status }
              : null,
          };
        })
        .sort((a, b) => compareStandNumbers(a.number, b.number)),
    };
  },
});

/** Add stands in one go: "1-40", "A1-A12, B3". Numbers already there are skipped. */
export const add = mutation({
  args: { developmentId: v.id("finDevelopments"), numbers: v.string(), price: v.number(), sizeSqm: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const dev = await getDevelopment(ctx, access.orgId, args.developmentId);
    const parsed = parseStandNumbers(args.numbers);
    if ("error" in parsed) throw new ConvexError(parsed.error);
    const price = round2(args.price);
    if (!(price > 0)) throw new ConvexError("Enter the price");
    if (args.sizeSqm !== undefined && !(args.sizeSqm > 0)) throw new ConvexError("Size must be more than zero");
    const existing = new Set(
      (
        await ctx.db
          .query("devStands")
          .withIndex("by_development", (q) => q.eq("developmentId", dev._id))
          .collect()
      ).map((s) => s.number.toLowerCase())
    );
    const now = Date.now();
    let added = 0;
    const skipped: string[] = [];
    for (const number of parsed.numbers) {
      if (existing.has(number.toLowerCase())) {
        skipped.push(number);
        continue;
      }
      await ctx.db.insert("devStands", { orgId: access.orgId, developmentId: dev._id, number, sizeSqm: args.sizeSqm, price, status: "available", createdAt: now, updatedAt: now });
      added++;
    }
    await devAudit(ctx, access, {
      action: "dev.stands_add",
      description: `Added ${added} stands to ${dev.name} at ${formatAmount(price, dev.currency)}`,
      targetType: "finDevelopment",
      targetId: dev._id,
    });
    return { added, skipped };
  },
});

/** Change a stand's number, price, size or notes. A sold stand's price is the sale's. */
export const update = mutation({
  args: { standId: v.id("devStands"), number: v.optional(v.string()), price: v.optional(v.number()), sizeSqm: v.optional(v.union(v.number(), v.null())), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getInventoryStand(ctx, access.orgId, args.standId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.number !== undefined) {
      const number = args.number.trim();
      if (!number) throw new ConvexError("Enter the stand number");
      if (s.status === "sold") throw new ConvexError("A sold stand keeps its number");
      const clash = (
        await ctx.db
          .query("devStands")
          .withIndex("by_development", (q) => q.eq("developmentId", s.developmentId))
          .collect()
      ).some((x) => x._id !== s._id && x.number.toLowerCase() === number.toLowerCase());
      if (clash) throw new ConvexError(`Stand ${number} already exists`);
      patch.number = number;
    }
    if (args.price !== undefined) {
      if (s.status === "sold") throw new ConvexError("The price of a sold stand is set on the sale");
      if (!(args.price > 0)) throw new ConvexError("Enter the price");
      patch.price = round2(args.price);
    }
    if (args.sizeSqm !== undefined) patch.sizeSqm = args.sizeSqm ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    await ctx.db.patch(s._id, patch);
  },
});

/** Hold a stand for someone. Any SyncDev user can, so agents can act on the spot. */
export const reserve = mutation({
  args: { standId: v.id("devStands"), name: v.string(), phone: v.optional(v.string()), until: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    const s = await getInventoryStand(ctx, access.orgId, args.standId);
    const today = await todayForOrg(ctx, access.orgId);
    if (effectiveStatus(s, today) !== "available") throw new ConvexError(`Stand ${s.number} is not available`);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Who is it reserved for?");
    if (args.until && (!isValidDate(args.until) || args.until < today)) throw new ConvexError("Pick a date from today on");
    await ctx.db.patch(s._id, {
      status: "reserved",
      reservedFor: { name, phone: args.phone?.trim() || undefined, until: args.until || undefined, byUserId: access.user._id },
      updatedAt: Date.now(),
    });
    await devAudit(ctx, access, { action: "dev.stand_reserve", description: `Reserved stand ${s.number} for ${name}`, targetType: "devStand", targetId: s._id });
  },
});

export const release = mutation({
  args: { standId: v.id("devStands") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    const s = await getInventoryStand(ctx, access.orgId, args.standId);
    if (s.status !== "reserved") return;
    // The person who reserved it, or anyone who manages sales.
    if (!access.canManage && s.reservedFor?.byUserId !== access.user._id) throw new ConvexError("Only the person who reserved it or a sales manager can release it");
    await ctx.db.patch(s._id, { status: "available", reservedFor: undefined, updatedAt: Date.now() });
    await devAudit(ctx, access, { action: "dev.stand_release", description: `Released stand ${s.number}`, targetType: "devStand", targetId: s._id });
  },
});

/** Remove a stand added by mistake. Never one that has been sold. */
export const remove = mutation({
  args: { standId: v.id("devStands") },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getInventoryStand(ctx, access.orgId, args.standId);
    const everSold = (
      await ctx.db
        .query("finStands")
        .withIndex("by_development", (q) => q.eq("developmentId", s.developmentId))
        .collect()
    ).some((x) => x.devStandId === s._id);
    if (s.status === "sold" || everSold) throw new ConvexError("A stand that has been sold keeps its record");
    await ctx.db.delete(s._id);
    await devAudit(ctx, access, { action: "dev.stand_remove", description: `Removed stand ${s.number}`, targetType: "devStand", targetId: s._id });
  },
});

/**
 * Sell a stand: the buyer (an existing contact or a new one) and the plan,
 * as an even plan or typed rows. The price defaults to the stand's.
 */
export const sell = mutation({
  args: {
    standId: v.id("devStands"),
    buyerContactId: v.optional(v.id("contacts")),
    buyerName: v.string(),
    buyerEmail: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    price: v.optional(v.number()),
    plan: v.optional(v.object({ deposit: v.number(), depositDue: v.string(), count: v.number(), firstDue: v.string() })),
    schedule: v.optional(v.array(v.object({ dueDate: v.string(), amount: v.number(), label: v.string() }))),
  },
  handler: async (ctx, args) => {
    const access = await requireSales(ctx);
    requireManage(access);
    const s = await getInventoryStand(ctx, access.orgId, args.standId);
    if (s.status === "sold") throw new ConvexError(`Stand ${s.number} is already sold`);
    const price = round2(args.price ?? s.price);
    const rows = args.schedule ?? (args.plan ? buildPlan(price, args.plan.deposit, args.plan.depositDue, args.plan.count, args.plan.firstDue) : []);
    const buyerContactId = await upsertBuyer(ctx, access, { contactId: args.buyerContactId, name: args.buyerName, email: args.buyerEmail, phone: args.buyerPhone });
    const saleId = await insertStand(ctx, access, {
      developmentId: s.developmentId,
      standNumber: s.number,
      buyerContactId,
      buyerName: args.buyerName,
      buyerEmail: args.buyerEmail,
      buyerPhone: args.buyerPhone,
      price,
      schedule: rows,
    });
    await devAudit(ctx, access, { action: "dev.sale_create", description: `Stand ${s.number} sold to ${args.buyerName.trim()}`, targetType: "finStand", targetId: saleId });
    return saleId;
  },
});
