/**
 * Sync Estate Hub: the shared layer every module runs on.
 *
 * Owns which modules an organisation has (switched on by LayerSync platform
 * staff), the Sync Estate roles a user holds, agency settings, and the CRM's
 * headline figures for the director dashboard. Stay and Worth serve their own
 * figures from `stay/dashboard.hubSummary` and `worth/dashboard.hubSummary`.
 */
import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  getCurrentUserOptional,
  getCurrentUserWithOrg,
  getEffectiveOrgId,
  requireAdmin,
  requirePlatformAdmin,
} from "./helpers";
import { recordAudit } from "./logs";
import {
  ESTATE_ROLE_LABELS,
  HubFigure,
  ModuleKey,
  estateRoleValidator,
  moduleKeyValidator,
  orgModules,
  userCanUseModule,
  userModules,
} from "./lib/modules";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

/**
 * Everything the app shell needs to draw the Hub and the module switcher.
 * Null when signed out or when there is no organisation in scope.
 */
export const getContext = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUserOptional(ctx);
    if (!me) return null;
    const orgId = getEffectiveOrgId(me);
    if (!orgId) return null;
    const org = await ctx.db.get(orgId);
    if (!org) return null;
    // Platform staff viewing an org see it as its admin (helpers.ts).
    const viewer = me.orgId ? me : { ...me, role: "admin" as const };
    return {
      orgName: org.name,
      enabledModules: orgModules(org),
      myModules: userModules(viewer, org),
      estateRoles: me.estateRoles ?? [],
      isAdmin: viewer.role === "admin",
    };
  },
});

// =====================
// Modules (LayerSync platform staff)
// =====================

async function applyModules(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  modules: ModuleKey[],
  actor: { id?: Id<"users">; label: string }
) {
  const before = orgModules(org);
  const after = orgModules({ enabledModules: modules });
  await ctx.db.patch(org._id, { enabledModules: after, updatedAt: Date.now() });
  await recordAudit(ctx, {
    actorUserId: actor.id,
    actorLabel: actor.label,
    action: "org.modules_change",
    category: "system",
    description: `Modules changed by ${actor.label}: ${before.join(", ") || "none"} → ${after.join(", ") || "none"}`,
    targetType: "organization",
    targetId: org._id,
    targetLabel: org.name,
    metadata: { from: before, to: after },
    orgId: org._id,
  });
  return after;
}

/** HB-01: LayerSync switches modules on or off for an agency. */
export const setOrgModules = mutation({
  args: { orgId: v.id("organizations"), modules: v.array(moduleKeyValidator) },
  handler: async (ctx, args) => {
    const me = await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new ConvexError("Organisation not found");
    return applyModules(ctx, org, args.modules, {
      id: me._id,
      label: me.email ?? "LayerSync",
    });
  },
});

/**
 * CLI equivalent, for deployments without a platform admin yet:
 *   npx convex run hub:setOrgModulesCli '{"slug":"acme","modules":["crm","stay","worth","media"]}'
 */
export const setOrgModulesCli = internalMutation({
  args: { slug: v.string(), modules: v.array(moduleKeyValidator) },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim()))
      .unique();
    if (!org) throw new Error(`No organisation with slug "${args.slug}"`);
    return applyModules(ctx, org, args.modules, { label: "CLI" });
  },
});

// =====================
// Roles and agency settings (agency admin)
// =====================

/** HB-11: assign Sync Estate roles to a user of the admin's own org. */
export const adminSetEstateRoles = mutation({
  args: { userId: v.id("users"), roles: v.array(estateRoleValidator) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== admin.orgId) throw new ConvexError("User not found");
    const roles = [...new Set(args.roles)];
    const before = target.estateRoles ?? [];
    await ctx.db.patch(target._id, { estateRoles: roles, updatedAt: Date.now() });
    const label = (rs: readonly (keyof typeof ESTATE_ROLE_LABELS)[]) =>
      rs.map((r) => ESTATE_ROLE_LABELS[r]).join(", ") || "none";
    await recordAudit(ctx, {
      actorUserId: admin._id,
      actorLabel: admin.fullName || admin.name || admin.email,
      action: "user.estate_roles_change",
      category: "user",
      description: `Changed roles for ${target.email || "user"}: ${label(before)} → ${label(roles)}`,
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      metadata: { from: before, to: roles },
      orgId: admin.orgId,
    });
  },
});

/** HB-02: agency details printed on receipts, statements and reports. */
export const getOrgSettings = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const org = await ctx.db.get(user.orgId);
    if (!org) return null;
    return {
      name: org.name,
      defaultCurrency: org.defaultCurrency ?? "USD",
      address: org.address ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
      vatNumber: org.vatNumber ?? "",
    };
  },
});

export const updateOrgSettings = mutation({
  args: {
    name: v.string(),
    defaultCurrency: v.union(v.literal("USD"), v.literal("ZiG")),
    address: v.string(),
    phone: v.string(),
    email: v.string(),
    vatNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Agency name is required");
    const clean = (s: string) => s.trim() || undefined;
    await ctx.db.patch(admin.orgId, {
      name,
      defaultCurrency: args.defaultCurrency,
      address: clean(args.address),
      phone: clean(args.phone),
      email: clean(args.email),
      vatNumber: clean(args.vatNumber),
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorUserId: admin._id,
      actorLabel: admin.fullName || admin.name || admin.email,
      action: "org.settings_update",
      category: "system",
      description: "Updated agency settings",
      targetType: "organization",
      targetId: admin.orgId,
      targetLabel: name,
      orgId: admin.orgId,
    });
  },
});

// =====================
// Director dashboard: CRM figures
// =====================

function monthStartUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * HB-50 CRM figures: new leads this month, deals in pipeline, deals closed
 * this month. Null when the caller can't open the CRM, so the Hub can call
 * this unconditionally.
 */
export const crmSummary = query({
  args: {},
  handler: async (ctx): Promise<HubFigure[] | null> => {
    const me = await getCurrentUserOptional(ctx);
    if (!me) return null;
    const orgId = getEffectiveOrgId(me);
    if (!orgId) return null;
    const org = await ctx.db.get(orgId);
    const viewer = me.orgId ? me : { ...me, role: "admin" as const };
    if (!org || !userCanUseModule(viewer, org, "crm")) return null;

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const terminal = new Map(stages.map((s) => [s._id, s.isTerminal ? s.terminalOutcome : "open"]));
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    // Directors see the agency; anyone else sees their own book.
    const mine = viewer.role === "admin" && !viewer.agentMode
      ? leads
      : leads.filter((l) => l.ownerUserId === viewer._id);
    const since = monthStartUtc(Date.now());
    let newThisMonth = 0;
    let open = 0;
    let wonThisMonth = 0;
    for (const l of mine) {
      if (l.isArchived) continue;
      if (l.createdAt >= since) newThisMonth++;
      const outcome = terminal.get(l.stageId);
      if (outcome === "open") open++;
      if (outcome === "won" && (l.closedAt ?? 0) >= since) wonThisMonth++;
    }
    return [
      { label: "New leads this month", value: String(newThisMonth), href: "/app/leads" },
      { label: "Deals in pipeline", value: String(open), href: "/app/leads" },
      { label: "Deals closed this month", value: String(wonThisMonth), tone: "good", href: "/app/reports" },
    ];
  },
});
