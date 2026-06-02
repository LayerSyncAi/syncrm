import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, requireAdmin, assertOrgAccess } from "./helpers";

// List marketing expenses for the org, optionally scoped to a single property.
// Org-scoped read available to any authenticated member.
export const listExpenses = query({
  args: { propertyId: v.optional(v.id("properties")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);

    let expenses = await ctx.db
      .query("marketingExpenses")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();

    if (args.propertyId) {
      expenses = expenses.filter((e) => e.propertyId === args.propertyId);
    }

    // Enrich with property title and creator name for display.
    const [properties, users] = await Promise.all([
      ctx.db.query("properties").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);
    const propertyMap = new Map(properties.map((p) => [p._id, p]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return expenses
      .sort((a, b) => b.spentAt - a.spentAt)
      .map((e) => {
        const property = e.propertyId ? propertyMap.get(e.propertyId) : null;
        const creator = userMap.get(e.createdByUserId);
        return {
          ...e,
          propertyTitle: property?.title ?? null,
          createdByName: creator?.fullName || creator?.name || creator?.email || "Unknown",
        };
      });
  },
});

export const createExpense = mutation({
  args: {
    propertyId: v.optional(v.id("properties")),
    channel: v.string(),
    amount: v.number(),
    currency: v.string(),
    spentAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    if (args.amount < 0) {
      throw new Error("Amount cannot be negative");
    }

    if (args.propertyId) {
      const property = await ctx.db.get(args.propertyId);
      if (!property) throw new Error("Property not found");
      assertOrgAccess(property, admin.orgId);
    }

    return ctx.db.insert("marketingExpenses", {
      propertyId: args.propertyId,
      channel: args.channel.trim(),
      amount: args.amount,
      currency: args.currency.trim() || "USD",
      spentAt: args.spentAt,
      note: args.note?.trim() || undefined,
      createdByUserId: admin._id,
      orgId: admin.orgId,
      createdAt: Date.now(),
    });
  },
});

export const deleteExpense = mutation({
  args: { expenseId: v.id("marketingExpenses") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Marketing expense not found");
    assertOrgAccess(expense, admin.orgId);
    await ctx.db.delete(args.expenseId);
  },
});
