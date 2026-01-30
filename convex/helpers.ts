import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new ConvexError("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email!))
    .unique();
  if (!user || !user.isActive) {
    throw new ConvexError("User not active");
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return user;
}
