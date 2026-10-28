/**
 * Platform administration — for LayerSync staff, who sit ABOVE individual
 * organisations rather than inside them.
 *
 * A platform admin is a `users` row with `isPlatformAdmin: true` and NO
 * `orgId`, so they never appear in a client's user list. They can open any
 * organisation in a read-only view (`platformViewOrgId`, enforced in
 * helpers.getCurrentUserWithOrg) and purge an organisation that is no longer
 * a customer.
 *
 * Bootstrapping the first platform admin is done from the CLI:
 *   npx convex run platform:grantPlatformAdminCli '{"email":"ops@example.com","fullName":"Ops"}' --prod
 */
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc, Id, TableNames } from "./_generated/dataModel";
import { requirePlatformAdmin } from "./helpers";
import { recordAudit } from "./logs";
import { orgModules } from "./lib/modules";
import { rebuildPasswordAccount, getTempPassword } from "./lib/authReconcile";
import { RATE_LIMITS } from "./rateLimit";
import {
  PURGE_BATCH_SIZE,
  PURGE_TABLE_ORDER,
  isStorageRef,
  normalizeEmail,
  purgeConfirmPhrase,
  rateLimitKeysForUser,
  type PurgeTable,
} from "./platformLib";

const COUNT_CAP = 1000;

async function countByOrg(
  ctx: { db: MutationCtx["db"] } | { db: Parameters<typeof requirePlatformAdmin>[0]["db"] },
  table: "users" | "leads" | "contacts" | "properties",
  orgId: Id<"organizations">
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(COUNT_CAP + 1);
  return rows.length;
}

// =====================
// Queries
// =====================

/** Every organisation on this deployment, with headline counts. */
export const listOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlatformAdmin(ctx);
    const orgs = await ctx.db.query("organizations").collect();
    orgs.sort((a, b) => a.name.localeCompare(b.name));

    const result = [];
    for (const org of orgs) {
      const [users, leads, contacts, properties, lastAudit] = await Promise.all([
        countByOrg(ctx, "users", org._id),
        countByOrg(ctx, "leads", org._id),
        countByOrg(ctx, "contacts", org._id),
        countByOrg(ctx, "properties", org._id),
        ctx.db
          .query("auditLogs")
          .withIndex("by_org_created", (q) => q.eq("orgId", org._id))
          .order("desc")
          .first(),
      ]);
      result.push({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        deletingAt: org.deletingAt,
        enabledModules: orgModules(org),
        counts: { users, leads, contacts, properties },
        countCap: COUNT_CAP,
        lastActivityAt: lastAudit?.createdAt ?? null,
        isViewing: me.platformViewOrgId === org._id,
      });
    }
    return result;
  },
});

/** Platform admin accounts (never members of an organisation). */
export const listPlatformAdmins = query({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlatformAdmin(ctx);
    const admins = await ctx.db
      .query("users")
      .withIndex("by_platform_admin", (q) => q.eq("isPlatformAdmin", true))
      .collect();
    return admins
      .map((u) => ({
        _id: u._id,
        email: u.email ?? "",
        fullName: u.fullName || u.name || "",
        isActive: u.isActive,
        createdAt: u.createdAt,
        isMe: u._id === me._id,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
});

/** The organisation the caller currently has open in platform view, if any. */
export const getViewContext = query({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlatformAdmin(ctx);
    if (!me.platformViewOrgId) return null;
    const org = await ctx.db.get(me.platformViewOrgId);
    return org ? { orgId: org._id, name: org.name, slug: org.slug } : null;
  },
});

// =====================
// Read-only organisation view
// =====================

export const setViewOrg = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const me = await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new ConvexError("Organisation not found");
    if (org.deletingAt) throw new ConvexError("This organisation is being deleted");

    await ctx.db.patch(me._id, { platformViewOrgId: args.orgId, updatedAt: Date.now() });

    // Transparency: the client's own Logs page shows that platform support
    // opened their organisation.
    await recordAudit(ctx, {
      actorUserId: me._id,
      actorLabel: me.fullName || me.name || me.email,
      action: "platform.view_org",
      category: "system",
      description: `Platform support (${me.email ?? "LayerSync"}) opened this organisation in read-only view`,
      targetType: "organization",
      targetId: org._id,
      targetLabel: org.name,
      orgId: org._id,
    });
    return { orgId: org._id, name: org.name };
  },
});

export const exitViewOrg = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlatformAdmin(ctx);
    if (me.platformViewOrgId) {
      await ctx.db.patch(me._id, { platformViewOrgId: undefined, updatedAt: Date.now() });
    }
  },
});

// =====================
// Granting / revoking platform admins
// =====================

export const getPlatformAdminForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.isActive || !user.isPlatformAdmin) return null;
    return { _id: user._id, label: user.fullName || user.name || user.email };
  },
});

/**
 * Flag an existing org-less account, or create a new one, as a platform admin.
 * Shared by the UI action and the CLI bootstrap. A new account gets the
 * deployment's temporary password and must reset it on first sign-in.
 */
export const grantPlatformAdminInternal = internalMutation({
  args: {
    email: v.string(),
    fullName: v.optional(v.string()),
    passwordHash: v.string(),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Please enter a valid email address");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const now = Date.now();
    let userId: Id<"users">;
    let created = false;
    if (existing) {
      if (existing.orgId) {
        throw new ConvexError(
          "That email belongs to a user inside an organisation. Platform admins must be separate accounts with no organisation membership."
        );
      }
      if (existing.isPlatformAdmin && existing.isActive) {
        return { userId: existing._id, created: false, alreadyAdmin: true };
      }
      await ctx.db.patch(existing._id, {
        isPlatformAdmin: true,
        isActive: true,
        role: "admin",
        showOnboardingInterface: false,
        updatedAt: now,
      });
      userId = existing._id;
    } else {
      const fullName = args.fullName?.trim() || email.split("@")[0];
      userId = await ctx.db.insert("users", {
        email,
        name: fullName,
        fullName,
        role: "admin",
        isActive: true,
        isPlatformAdmin: true,
        resetPasswordOnNextLogin: true,
        showOnboardingInterface: false,
        createdAt: now,
        updatedAt: now,
      });
      created = true;
      // Clean password account (purges any orphan rows for this email first).
      await rebuildPasswordAccount(ctx, { email, liveUserId: userId, passwordHash: args.passwordHash });
    }

    const actor = args.actorUserId ? await ctx.db.get(args.actorUserId) : null;
    await recordAudit(ctx, {
      actorUserId: actor?._id,
      actorLabel: actor ? actor.fullName || actor.name || actor.email : "CLI",
      action: "platform.grant_admin",
      category: "system",
      description: `${created ? "Created" : "Granted"} platform admin ${email}`,
      targetType: "user",
      targetId: userId,
      targetLabel: email,
    });

    return { userId, created, alreadyAdmin: false };
  },
});

/** UI entry point: an existing platform admin grants another. */
export const grantPlatformAdmin = action({
  args: { email: v.string(), fullName: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; created: boolean; alreadyAdmin: boolean; tempPasswordHint: string | null }> => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new ConvexError("Unauthorized");
    const caller = await ctx.runQuery(internal.platform.getPlatformAdminForAction, { userId: callerId });
    if (!caller) throw new ConvexError("Platform access required");

    const tempPassword = getTempPassword();
    const passwordHash = await new Scrypt().hash(tempPassword);
    const result = await ctx.runMutation(internal.platform.grantPlatformAdminInternal, {
      email: args.email,
      fullName: args.fullName,
      passwordHash,
      actorUserId: caller._id,
    });
    return { ...result, tempPasswordHint: result.created ? tempPassword : null };
  },
});

/**
 * CLI bootstrap (no signed-in caller):
 *   npx convex run platform:grantPlatformAdminCli '{"email":"ops@example.com","fullName":"Ops"}' --prod
 */
export const grantPlatformAdminCli = internalAction({
  args: { email: v.string(), fullName: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; created: boolean; alreadyAdmin: boolean; tempPasswordHint: string | null }> => {
    const tempPassword = getTempPassword();
    const passwordHash = await new Scrypt().hash(tempPassword);
    const result = await ctx.runMutation(internal.platform.grantPlatformAdminInternal, {
      email: args.email,
      fullName: args.fullName,
      passwordHash,
    });
    return { ...result, tempPasswordHint: result.created ? tempPassword : null };
  },
});

export const revokePlatformAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requirePlatformAdmin(ctx);
    if (args.userId === me._id) {
      throw new ConvexError("You cannot revoke your own platform access");
    }
    const target = await ctx.db.get(args.userId);
    if (!target || !target.isPlatformAdmin) {
      throw new ConvexError("That user is not a platform admin");
    }
    const admins = await ctx.db
      .query("users")
      .withIndex("by_platform_admin", (q) => q.eq("isPlatformAdmin", true))
      .collect();
    if (admins.filter((a) => a.isActive).length <= 1) {
      throw new ConvexError("At least one active platform admin must remain");
    }
    // A platform account has no org to fall back to, so revoking means
    // deactivating the login as well.
    await ctx.db.patch(target._id, {
      isPlatformAdmin: undefined,
      platformViewOrgId: undefined,
      isActive: false,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorUserId: me._id,
      actorLabel: me.fullName || me.name || me.email,
      action: "platform.revoke_admin",
      category: "system",
      description: `Revoked platform admin ${target.email ?? target._id}`,
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
    });
  },
});

// =====================
// Organisation purge
// =====================

async function beginPurge(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  actor: { _id?: Id<"users">; label: string }
) {
  if (org.deletingAt) {
    // Already in progress — just make sure the job is running.
    await ctx.scheduler.runAfter(0, internal.platform.purgeOrganizationBatch, {
      orgId: org._id,
      requestedBy: actor._id,
    });
    return { orgId: org._id, alreadyDeleting: true };
  }
  await ctx.db.patch(org._id, { deletingAt: Date.now(), updatedAt: Date.now() });
  await recordAudit(ctx, {
    actorUserId: actor._id,
    actorLabel: actor.label,
    action: "org.purge_started",
    category: "system",
    description: `Started deleting organisation "${org.name}" (${org.slug}) and all of its data`,
    targetType: "organization",
    targetId: org._id,
    targetLabel: org.name,
    metadata: { orgId: org._id, name: org.name, slug: org.slug },
  });
  await ctx.scheduler.runAfter(0, internal.platform.purgeOrganizationBatch, {
    orgId: org._id,
    requestedBy: actor._id,
  });
  return { orgId: org._id, alreadyDeleting: false };
}

/** UI entry point. The caller must type the slug to confirm. */
export const purgeOrganization = mutation({
  args: { orgId: v.id("organizations"), confirmSlug: v.string() },
  handler: async (ctx, args) => {
    const me = await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new ConvexError("Organisation not found");
    if (args.confirmSlug.trim() !== org.slug) {
      throw new ConvexError(`Type the organisation slug "${org.slug}" to confirm`);
    }
    if (me.platformViewOrgId === org._id) {
      throw new ConvexError("Exit the organisation view before deleting it");
    }
    return beginPurge(ctx, org, { _id: me._id, label: me.fullName || me.name || me.email || "platform" });
  },
});

/**
 * CLI twin:
 *   npx convex run platform:purgeOrganizationBySlug '{"slug":"tagiv","confirm":"DELETE tagiv"}' --prod
 */
export const purgeOrganizationBySlug = internalMutation({
  args: { slug: v.string(), confirm: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim()))
      .unique();
    if (!org) throw new Error(`No organisation with slug "${args.slug}"`);
    if (args.confirm !== purgeConfirmPhrase(org.slug)) {
      throw new Error(`Pass confirm: "${purgeConfirmPhrase(org.slug)}" to delete ${org.name}`);
    }
    return beginPurge(ctx, org, { label: "CLI" });
  },
});

type OrgRow = Doc<TableNames>;

/** Fetch up to `n` rows of an org-scoped table through its org index. */
function fetchOrgRows(
  ctx: MutationCtx,
  table: PurgeTable,
  orgId: Id<"organizations">,
  n: number
): Promise<OrgRow[]> {
  switch (table) {
    case "auditLogs":
    case "emailLogs":
      return ctx.db.query(table).withIndex("by_org_created", (q) => q.eq("orgId", orgId)).take(n);
    case "brochures":
      return ctx.db.query(table).withIndex("by_org_owner", (q) => q.eq("orgId", orgId)).take(n);
    case "copilotChats":
    case "pushSubscriptions":
    case "users":
      // Reached through the org's users (see purgeUserRows).
      return Promise.resolve([]);
    default:
      return ctx.db.query(table).withIndex("by_org", (q) => q.eq("orgId", orgId)).take(n);
  }
}

/** Storage files owned by a row, which must go before the row does. */
function storageRefsFor(table: PurgeTable, row: OrgRow): string[] {
  switch (table) {
    case "documents":
      return [(row as Doc<"documents">).storageId];
    case "viewingForms": {
      const f = row as Doc<"viewingForms">;
      return [f.clientSignatureId, f.negotiatorSignatureId, f.sellerSignatureId].filter(
        (id): id is Id<"_storage"> => !!id
      );
    }
    case "orgBranding": {
      const b = row as Doc<"orgBranding">;
      return [b.logoRef, b.logoOnDarkRef].filter(isStorageRef);
    }
    case "brochures":
      return (row as Doc<"brochures">).photos.filter(isStorageRef);
    case "stayDocuments":
      return [(row as Doc<"stayDocuments">).storageId];
    case "stayMaintenance":
      return (row as Doc<"stayMaintenance">).photos;
    case "stayInspections":
      return (row as Doc<"stayInspections">).rooms.flatMap((r) => r.photos);
    case "worthDocuments":
      return [(row as Doc<"worthDocuments">).storageId];
    case "worthInspections":
      return (row as Doc<"worthInspections">).photos.map((p) => p.storageId);
    case "worthReports": {
      const id = (row as Doc<"worthReports">).pdfStorageId;
      return id ? [id] : [];
    }
    case "worthValuerProfiles": {
      const id = (row as Doc<"worthValuerProfiles">).signatureStorageId;
      return id ? [id] : [];
    }
    default:
      return [];
  }
}

async function deleteStorageQuietly(ctx: MutationCtx, ref: string) {
  try {
    await ctx.storage.delete(ref as Id<"_storage">);
  } catch {
    // Already gone or not a storage id — the row is deleted regardless.
  }
}

/**
 * Delete everything keyed by a user rather than by org: auth rows, reset
 * tokens, reminders, rate limits, push subscriptions, copilot chats — then the
 * user. Returns the number of documents deleted, stopping once `budget` is
 * spent (the next invocation resumes; every lookup is re-run so it is safe).
 */
async function purgeUserRows(ctx: MutationCtx, user: Doc<"users">, budget: number): Promise<number> {
  let deleted = 0;
  const spend = async (id: Id<TableNames>) => {
    await ctx.db.delete(id);
    deleted++;
  };
  const left = () => budget - deleted;
  if (left() <= 0) return 0;

  const userKeyed = [
    ctx.db.query("copilotChats").withIndex("by_user", (q) => q.eq("userId", user._id)),
    ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", user._id)),
    ctx.db.query("expoPushTokens").withIndex("by_user", (q) => q.eq("userId", user._id)),
    ctx.db.query("passwordResetTokens").withIndex("by_user", (q) => q.eq("userId", user._id)),
    ctx.db.query("activityReminders").withIndex("by_user_digest", (q) => q.eq("userId", user._id)),
  ] as const;
  for (const q of userKeyed) {
    if (left() <= 0) return deleted;
    const rows = await q.take(left());
    for (const row of rows) await spend(row._id);
  }

  for (const key of rateLimitKeysForUser(user._id, Object.keys(RATE_LIMITS))) {
    if (left() <= 0) return deleted;
    const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (row) await spend(row._id);
  }

  // Auth rows (@convex-dev/auth). Order: verification codes → accounts,
  // refresh tokens → sessions, so nothing is left dangling.
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
    .take(Math.max(left(), 1));
  for (const account of accounts) {
    if (left() <= 0) return deleted;
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(left());
    for (const code of codes) await spend(code._id);
    if (left() <= 0) return deleted;
    await spend(account._id);
  }
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", user._id))
    .take(Math.max(left(), 1));
  for (const session of sessions) {
    if (left() <= 0) return deleted;
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(left());
    for (const token of tokens) await spend(token._id);
    if (left() <= 0) return deleted;
    await spend(session._id);
  }

  if (left() <= 0) return deleted;
  await spend(user._id);
  return deleted;
}

/**
 * One step of the purge. Deletes up to PURGE_BATCH_SIZE documents, then
 * reschedules itself until a full pass finds nothing left, at which point the
 * organisation row itself is removed. Idempotent and safe to re-run.
 */
export const purgeOrganizationBatch = internalMutation({
  args: {
    orgId: v.id("organizations"),
    requestedBy: v.optional(v.id("users")),
    totalDeleted: v.optional(v.number()),
    pass: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) return { done: true, totalDeleted: args.totalDeleted ?? 0 };
    if (!org.deletingAt) {
      throw new Error("Organisation is not marked for deletion; refusing to purge");
    }
    const now = Date.now();
    let budget = PURGE_BATCH_SIZE;
    let deleted = 0;

    // Lock everyone out and detach any platform viewer before data disappears.
    const staff = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(500);
    // Landlord/tenant portal accounts have no orgId; they hang off portalOrgId.
    const portalUsers = await ctx.db
      .query("users")
      .withIndex("by_portal_org", (q) => q.eq("portalOrgId", args.orgId))
      .take(500);
    const users = [...staff, ...portalUsers];
    for (const u of users) {
      if (u.isActive) await ctx.db.patch(u._id, { isActive: false, updatedAt: now });
    }
    const viewers = await ctx.db
      .query("users")
      .withIndex("by_platform_admin", (q) => q.eq("isPlatformAdmin", true))
      .collect();
    for (const viewer of viewers) {
      if (viewer.platformViewOrgId === args.orgId) {
        await ctx.db.patch(viewer._id, { platformViewOrgId: undefined, updatedAt: now });
      }
    }

    // Org-scoped tables, in dependency order.
    for (const table of PURGE_TABLE_ORDER) {
      if (budget <= 0) break;
      const rows = await fetchOrgRows(ctx, table, args.orgId, budget);
      for (const row of rows) {
        for (const ref of storageRefsFor(table, row)) await deleteStorageQuietly(ctx, ref);
        await ctx.db.delete(row._id);
        budget--;
        deleted++;
      }
    }

    // Then everything hanging off the org's users, and the users themselves.
    for (const u of users) {
      if (budget <= 0) break;
      const n = await purgeUserRows(ctx, u, budget);
      budget -= n;
      deleted += n;
    }

    const totalDeleted = (args.totalDeleted ?? 0) + deleted;
    const pass = (args.pass ?? 0) + 1;

    if (deleted === 0) {
      await ctx.db.delete(org._id);
      const actor = args.requestedBy ? await ctx.db.get(args.requestedBy) : null;
      await recordAudit(ctx, {
        actorUserId: actor?._id,
        actorLabel: actor ? actor.fullName || actor.name || actor.email : "CLI",
        action: "org.purged",
        category: "system",
        description: `Deleted organisation "${org.name}" (${org.slug}) and ${totalDeleted} related documents`,
        targetType: "organization",
        targetId: org._id,
        targetLabel: org.name,
        metadata: {
          orgId: org._id,
          name: org.name,
          slug: org.slug,
          totalDeleted,
          passes: pass,
          note: "Rows without an orgId (legacy/global) are not touched; property image files referenced by URL only are left in storage.",
        },
      });
      console.log(`[Platform] Purged organisation ${org.slug}: ${totalDeleted} documents in ${pass} passes`);
      return { done: true, totalDeleted };
    }

    await ctx.scheduler.runAfter(0, internal.platform.purgeOrganizationBatch, {
      orgId: args.orgId,
      requestedBy: args.requestedBy,
      totalDeleted,
      pass,
    });
    return { done: false, totalDeleted, deletedThisPass: deleted };
  },
});
