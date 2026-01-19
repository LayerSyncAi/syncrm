import { mutation, query } from "convex/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin } from "./helpers";

export const getMe = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user;
  },
});

export const adminListUsers = query({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("users").collect();
  },
});

export const adminCreateUser = mutation({
  args: {
    email: v.string(),
    fullName: v.string(),
    role: v.union(v.literal("admin"), v.literal("agent")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      return existing._id;
    }
    const timestamp = Date.now();
    return ctx.db.insert("users", {
      email: args.email,
      fullName: args.fullName,
      role: args.role,
      isActive: args.isActive,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const adminSetUserActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});
