import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { requireAdmin } from "./helpers";
import { Doc, Id } from "./_generated/dataModel";

// =====================
// Internal write helpers
// =====================

/**
 * Insert an audit log entry directly from any mutation context. Use this from
 * within mutations so the audit trail is written transactionally with the
 * change being logged.
 */
export async function recordAudit(
  ctx: MutationCtx,
  args: {
    actorUserId?: Id<"users">;
    actorLabel?: string;
    action: string;
    category:
      | "auth"
      | "user"
      | "lead"
      | "property"
      | "email"
      | "system"
      | "other";
    description: string;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    metadata?: Record<string, unknown>;
    orgId?: Id<"organizations">;
  }
): Promise<Id<"auditLogs">> {
  return await ctx.db.insert("auditLogs", {
    actorUserId: args.actorUserId,
    actorLabel: args.actorLabel,
    action: args.action,
    category: args.category,
    description: args.description,
    targetType: args.targetType,
    targetId: args.targetId,
    targetLabel: args.targetLabel,
    metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
    orgId: args.orgId,
    createdAt: Date.now(),
  });
}

// =====================
// Internal mutations callable from actions (sendEmail wrapper, etc.)
// =====================

export const recordEmailInternal = internalMutation({
  args: {
    to: v.string(),
    from: v.string(),
    subject: v.string(),
    kind: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("dev_logged")
    ),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    triggeredByUserId: v.optional(v.id("users")),
    triggeredByLabel: v.optional(v.string()),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("emailLogs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const recordAuditInternal = internalMutation({
  args: {
    actorUserId: v.optional(v.id("users")),
    actorLabel: v.optional(v.string()),
    action: v.string(),
    category: v.union(
      v.literal("auth"),
      v.literal("user"),
      v.literal("lead"),
      v.literal("property"),
      v.literal("email"),
      v.literal("system"),
      v.literal("other")
    ),
    description: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    metadata: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// =====================
// Public mutation: lets an authenticated user record a login event from the
// client when their session is established. Stays scoped to the calling user.
// =====================

export const recordLogin = mutation({
  handler: async (ctx) => {
    const { getAuthUserId } = await import("@convex-dev/auth/server");
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const user = await ctx.db.get(userId);
    if (!user || !user.isActive) return;

    await recordAudit(ctx, {
      actorUserId: user._id,
      actorLabel: user.fullName || user.name || user.email,
      action: "user.login",
      category: "auth",
      description: `${user.fullName || user.name || user.email || "Someone"} signed in`,
      targetType: "user",
      targetId: user._id,
      targetLabel: user.email,
      orgId: user.orgId,
    });
  },
});

// =====================
// Admin queries
// =====================

const PAGE_LIMIT = 200;

export const adminListAuditLogs = query({
  args: {
    category: v.optional(
      v.union(
        v.literal("auth"),
        v.literal("user"),
        v.literal("lead"),
        v.literal("property"),
        v.literal("email"),
        v.literal("system"),
        v.literal("other")
      )
    ),
    actorUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? PAGE_LIMIT, 500);

    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_created", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .take(limit * 2); // overfetch a bit for in-memory filtering

    const filtered = rows.filter((r) => {
      if (args.category && r.category !== args.category) return false;
      if (args.actorUserId && r.actorUserId !== args.actorUserId) return false;
      return true;
    });

    return filtered.slice(0, limit);
  },
});

export const adminListEmailLogs = query({
  args: {
    kind: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("sent"),
        v.literal("failed"),
        v.literal("dev_logged")
      )
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? PAGE_LIMIT, 500);

    const rows = await ctx.db
      .query("emailLogs")
      .withIndex("by_org_created", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .take(limit * 2);

    const needle = args.search?.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (args.kind && r.kind !== args.kind) return false;
      if (args.status && r.status !== args.status) return false;
      if (needle) {
        const hay = `${r.to} ${r.from} ${r.subject} ${r.kind}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    return filtered.slice(0, limit) as Doc<"emailLogs">[];
  },
});

export const adminLogsSummary = query({
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    // Cheap-ish counters via a bounded scan of the most recent rows. For
    // larger volumes we'd add dedicated aggregate tables — fine for now.
    const recentAudits = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_created", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .take(500);
    const recentEmails = await ctx.db
      .query("emailLogs")
      .withIndex("by_org_created", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .take(500);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return {
      auditCount: recentAudits.length,
      emailCount: recentEmails.length,
      audits24h: recentAudits.filter((r) => r.createdAt >= dayAgo).length,
      emails24h: recentEmails.filter((r) => r.createdAt >= dayAgo).length,
      failedEmails24h: recentEmails.filter(
        (r) => r.createdAt >= dayAgo && r.status === "failed"
      ).length,
    };
  },
});
