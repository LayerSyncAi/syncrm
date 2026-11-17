/**
 * Organisation onboarding — LayerSync staff (platform admins) set up a new
 * agency from the Platform page: the organisation, its modules, its logo and
 * colours (optionally white-labelled), and its first owner login with a
 * temporary password. The owner signs in on the normal sign-in page, is made
 * to choose their own password, and lands in a ready-to-use agency.
 *
 * Everything for one organisation is written in a single mutation, so a
 * failed create leaves nothing half-made behind.
 */
import { action, internalMutation, mutation, query, ActionCtx, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { requirePlatformAdmin } from "./helpers";
import { recordAudit } from "./logs";
import { moduleKeyValidator, orgModules } from "./lib/modules";
import { rebuildPasswordAccount, randomPassword } from "./lib/authReconcile";
import { assertEmailAvailable, emailUnavailableReason } from "./lib/accountChecks";
import { seedOrgDefaults } from "./lib/orgDefaults";
import {
  isDarkEnoughForSidebar,
  isHexColor,
  isValidSlug,
  onboardingErrors,
  MIN_PASSWORD_LENGTH,
  SIDEBAR_TOO_LIGHT,
} from "./lib/onboardingRules";
import { isStorageRef, normalizeEmail } from "./platformLib";
import { sendStaffSignInEmail } from "./email";
import { resolveOne } from "./branding";

const currencyValidator = v.union(v.literal("USD"), v.literal("ZiG"));

function actorLabel(user: Pick<Doc<"users">, "fullName" | "name" | "email"> | null): string | undefined {
  return user ? user.fullName || user.name || user.email : undefined;
}

async function requirePlatformCaller(ctx: ActionCtx): Promise<{ _id: Id<"users"> }> {
  const callerId = await getAuthUserId(ctx);
  if (!callerId) throw new ConvexError("Unauthorized");
  const caller = await ctx.runQuery(internal.platform.getPlatformAdminForAction, { userId: callerId });
  if (!caller) throw new ConvexError("Platform access required");
  return caller;
}

async function deleteStorageQuietly(ctx: MutationCtx, ref: string | undefined) {
  if (!isStorageRef(ref)) return;
  try {
    await ctx.storage.delete(ref as Id<"_storage">);
  } catch {
    // Already gone.
  }
}

// =====================
// Wizard helpers
// =====================

/** Upload URL for logos. The org-scoped storage.generateUploadUrl refuses platform admins. */
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Live checks for the wizard: is the web address free, can this email be the owner's login? */
export const checkAvailability = query({
  args: { slug: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    let slugTaken = false;
    if (args.slug && isValidSlug(args.slug)) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
        .first();
      slugTaken = !!existing;
    }
    const email = args.email ? normalizeEmail(args.email) : "";
    const emailProblem = email ? await emailUnavailableReason(ctx, email) : null;
    return { slugTaken, emailProblem };
  },
});

// =====================
// Create
// =====================

export const createOrganizationInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    defaultCurrency: v.optional(currencyValidator),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    isDemo: v.boolean(),
    modules: v.array(moduleKeyValidator),
    whiteLabel: v.boolean(),
    logoRef: v.optional(v.string()),
    logoOnDarkRef: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    sidebarColor: v.optional(v.string()),
    ownerFullName: v.string(),
    ownerEmail: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const slugOwner = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (slugOwner) throw new ConvexError(`The web address "${args.slug}" is already taken`);
    await assertEmailAvailable(ctx, args.ownerEmail);

    const now = Date.now();
    const modules = [...new Set(args.modules)];
    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      slug: args.slug,
      enabledModules: modules,
      defaultCurrency: args.defaultCurrency,
      email: args.contactEmail || undefined,
      phone: args.contactPhone || undefined,
      whiteLabel: args.whiteLabel,
      isDemo: args.isDemo || undefined,
      onboardedBy: args.actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    if (args.logoRef || args.logoOnDarkRef || args.primaryColor || args.sidebarColor) {
      await ctx.db.insert("orgBranding", {
        orgId,
        logoRef: args.logoRef,
        logoOnDarkRef: args.logoOnDarkRef,
        accent: args.primaryColor,
        sidebarColor: args.sidebarColor,
        createdAt: now,
        updatedAt: now,
      });
    }

    const ownerId = await ctx.db.insert("users", {
      email: args.ownerEmail,
      fullName: args.ownerFullName,
      name: args.ownerFullName,
      role: "admin",
      isActive: true,
      orgId,
      resetPasswordOnNextLogin: true,
      showOnboardingInterface: true,
      createdAt: now,
      updatedAt: now,
    });
    await rebuildPasswordAccount(ctx, { email: args.ownerEmail, liveUserId: ownerId, passwordHash: args.passwordHash });

    await seedOrgDefaults(ctx, { orgId, ownerId, modules });

    const actor = await ctx.db.get(args.actorUserId);
    const label = actorLabel(actor);
    // Both entries land in the new agency's own Logs page.
    await recordAudit(ctx, {
      actorUserId: args.actorUserId,
      actorLabel: label,
      action: "org.create",
      category: "system",
      description: `LayerSync (${actor?.email ?? "platform"}) set up ${args.name}${args.isDemo ? " as a demo organisation" : ""}`,
      targetType: "organization",
      targetId: orgId,
      targetLabel: args.name,
      metadata: { modules, whiteLabel: args.whiteLabel, isDemo: args.isDemo },
      orgId,
    });
    await recordAudit(ctx, {
      actorUserId: args.actorUserId,
      actorLabel: label,
      action: "user.create",
      category: "user",
      description: `Created the owner login for ${args.ownerFullName} (${args.ownerEmail}) as admin`,
      targetType: "user",
      targetId: ownerId,
      targetLabel: args.ownerEmail,
      orgId,
    });

    return { orgId, ownerId };
  },
});

/**
 * Create an organisation and its owner. Logos arrive as storage ids already
 * uploaded with generateLogoUploadUrl; they are deleted again if the create
 * fails, so a rejected attempt leaves no orphan files.
 *
 * The temporary password is returned to the platform admin (who chose or
 * generated it) so they can hand it over; the owner must change it on first
 * sign-in.
 */
export const createOrganization = action({
  args: {
    name: v.string(),
    slug: v.string(),
    defaultCurrency: v.optional(currencyValidator),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    isDemo: v.boolean(),
    modules: v.array(moduleKeyValidator),
    whiteLabel: v.boolean(),
    logoStorageId: v.optional(v.id("_storage")),
    logoOnDarkStorageId: v.optional(v.id("_storage")),
    primaryColor: v.optional(v.string()),
    sidebarColor: v.optional(v.string()),
    ownerFullName: v.string(),
    ownerEmail: v.string(),
    /** Empty or absent: a random one is generated. */
    password: v.optional(v.string()),
    sendEmail: v.boolean(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    orgId: Id<"organizations">;
    slug: string;
    orgName: string;
    ownerEmail: string;
    tempPassword: string;
    emailed: boolean;
  }> => {
    const caller = await requirePlatformCaller(ctx);

    const name = args.name.trim();
    const slug = args.slug.trim().toLowerCase();
    const ownerEmail = normalizeEmail(args.ownerEmail);
    const ownerFullName = args.ownerFullName.trim();
    const password = args.password?.trim() ? args.password : "";
    const primaryColor = args.primaryColor?.trim() || undefined;
    const sidebarColor = args.sidebarColor?.trim() || undefined;

    const logoRefs = [args.logoStorageId, args.logoOnDarkStorageId].filter((x): x is Id<"_storage"> => !!x);
    const cleanUp = async () => {
      for (const id of logoRefs) {
        try {
          await ctx.storage.delete(id);
        } catch {
          // Already gone.
        }
      }
    };

    const errors = onboardingErrors({
      name,
      slug,
      modules: args.modules,
      primaryColor,
      sidebarColor,
      ownerFullName,
      ownerEmail,
      password,
    });
    const firstError = Object.values(errors)[0];
    if (firstError) {
      await cleanUp();
      throw new ConvexError(firstError);
    }

    const tempPassword = password || randomPassword();
    const passwordHash = await new Scrypt().hash(tempPassword);

    let created: { orgId: Id<"organizations">; ownerId: Id<"users"> };
    try {
      created = await ctx.runMutation(internal.onboarding.createOrganizationInternal, {
        actorUserId: caller._id,
        name,
        slug,
        defaultCurrency: args.defaultCurrency,
        contactEmail: args.contactEmail?.trim() || undefined,
        contactPhone: args.contactPhone?.trim() || undefined,
        isDemo: args.isDemo,
        modules: args.modules,
        whiteLabel: args.whiteLabel,
        logoRef: args.logoStorageId,
        logoOnDarkRef: args.logoOnDarkStorageId,
        primaryColor,
        sidebarColor,
        ownerFullName,
        ownerEmail,
        passwordHash,
      });
    } catch (err) {
      await cleanUp();
      throw err;
    }

    const emailed = args.sendEmail
      ? await sendStaffSignInEmail(
          ctx,
          { to: ownerEmail, fullName: ownerFullName, orgName: name, password: tempPassword, reason: "invite" },
          { triggeredByUserId: caller._id, relatedType: "user", relatedId: created.ownerId, orgId: created.orgId }
        )
      : false;

    return { orgId: created.orgId, slug, orgName: name, ownerEmail, tempPassword, emailed };
  },
});

// =====================
// Edit
// =====================

/** Everything the Edit organisation page shows. */
export const getOrganization = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) return null;
    const branding = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    const admins = (
      await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect()
    )
      .filter((u) => u.role === "admin")
      .map((u) => ({
        _id: u._id,
        fullName: u.fullName || u.name || "",
        email: u.email ?? "",
        isActive: u.isActive,
        mustChangePassword: !!u.resetPasswordOnNextLogin,
        createdAt: u.createdAt,
      }))
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      deletingAt: org.deletingAt,
      defaultCurrency: org.defaultCurrency,
      enabledModules: orgModules(org),
      whiteLabel: !!org.whiteLabel,
      isDemo: !!org.isDemo,
      primaryColor: branding?.accent,
      sidebarColor: branding?.sidebarColor,
      logoUrl: await resolveOne(ctx, branding?.logoRef),
      logoOnDarkUrl: await resolveOne(ctx, branding?.logoOnDarkRef),
      admins,
    };
  },
});

/**
 * Change an organisation's name, flags or branding. For colours and logos,
 * `null` clears the value; a new logo replaces (and deletes) the old file.
 */
export const updateOrganization = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
    whiteLabel: v.optional(v.boolean()),
    defaultCurrency: v.optional(currencyValidator),
    primaryColor: v.optional(v.union(v.string(), v.null())),
    sidebarColor: v.optional(v.union(v.string(), v.null())),
    logo: v.optional(v.union(v.id("_storage"), v.null())),
    logoOnDark: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new ConvexError("Organisation not found");
    if (org.deletingAt) throw new ConvexError("This organisation is being deleted");

    const now = Date.now();
    const changes: string[] = [];

    const orgPatch: Partial<Doc<"organizations">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new ConvexError("Enter the organisation's name");
      if (name !== org.name) {
        orgPatch.name = name;
        changes.push(`renamed to ${name}`);
      }
    }
    if (args.isDemo !== undefined && args.isDemo !== !!org.isDemo) {
      orgPatch.isDemo = args.isDemo;
      changes.push(args.isDemo ? "marked as demo" : "no longer a demo");
    }
    if (args.whiteLabel !== undefined && args.whiteLabel !== !!org.whiteLabel) {
      orgPatch.whiteLabel = args.whiteLabel;
      changes.push(args.whiteLabel ? "white label on" : "white label off");
    }
    if (args.defaultCurrency !== undefined && args.defaultCurrency !== org.defaultCurrency) {
      orgPatch.defaultCurrency = args.defaultCurrency;
      changes.push(`currency ${args.defaultCurrency}`);
    }
    if (Object.keys(orgPatch).length > 0) {
      await ctx.db.patch(org._id, { ...orgPatch, updatedAt: now });
    }

    for (const color of [args.primaryColor, args.sidebarColor]) {
      if (typeof color === "string" && !isHexColor(color)) {
        throw new ConvexError("Use a hex colour such as #1f5fad");
      }
    }
    if (typeof args.sidebarColor === "string" && !isDarkEnoughForSidebar(args.sidebarColor)) {
      throw new ConvexError(SIDEBAR_TOO_LIGHT);
    }

    const brandingTouched =
      args.primaryColor !== undefined ||
      args.sidebarColor !== undefined ||
      args.logo !== undefined ||
      args.logoOnDark !== undefined;
    if (brandingTouched) {
      const existing = await ctx.db
        .query("orgBranding")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .unique();
      const patch: Partial<Doc<"orgBranding">> = {};
      if (args.primaryColor !== undefined) {
        patch.accent = args.primaryColor ?? undefined;
        changes.push(args.primaryColor ? `primary colour ${args.primaryColor}` : "primary colour cleared");
      }
      if (args.sidebarColor !== undefined) {
        patch.sidebarColor = args.sidebarColor ?? undefined;
        changes.push(args.sidebarColor ? `sidebar colour ${args.sidebarColor}` : "sidebar colour cleared");
      }
      if (args.logo !== undefined) {
        if (existing?.logoRef !== args.logo) await deleteStorageQuietly(ctx, existing?.logoRef);
        patch.logoRef = args.logo ?? undefined;
        changes.push(args.logo ? "logo replaced" : "logo removed");
      }
      if (args.logoOnDark !== undefined) {
        if (existing?.logoOnDarkRef !== args.logoOnDark) await deleteStorageQuietly(ctx, existing?.logoOnDarkRef);
        patch.logoOnDarkRef = args.logoOnDark ?? undefined;
        changes.push(args.logoOnDark ? "dark-background logo replaced" : "dark-background logo removed");
      }
      if (existing) {
        await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
      } else {
        await ctx.db.insert("orgBranding", { orgId: org._id, ...patch, createdAt: now, updatedAt: now });
      }
    }

    if (changes.length > 0) {
      await recordAudit(ctx, {
        actorUserId: me._id,
        actorLabel: actorLabel(me),
        action: "org.update_by_platform",
        category: "system",
        description: `LayerSync (${me.email ?? "platform"}) updated the organisation: ${changes.join(", ")}`,
        targetType: "organization",
        targetId: org._id,
        targetLabel: orgPatch.name ?? org.name,
        orgId: org._id,
      });
    }
    return { changed: changes.length };
  },
});

// =====================
// Owner password
// =====================

export const resetMemberPasswordInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    orgId: v.id("organizations"),
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== args.orgId) throw new ConvexError("User not found");
    if (!target.email) throw new ConvexError("This user has no email, so a password cannot be set");

    await rebuildPasswordAccount(ctx, { email: target.email, liveUserId: target._id, passwordHash: args.passwordHash });
    await ctx.db.patch(target._id, { resetPasswordOnNextLogin: true, isActive: true, updatedAt: Date.now() });

    const actor = await ctx.db.get(args.actorUserId);
    await recordAudit(ctx, {
      actorUserId: args.actorUserId,
      actorLabel: actorLabel(actor),
      action: "user.password_reset_by_platform",
      category: "user",
      description: `LayerSync (${actor?.email ?? "platform"}) issued a temporary password for ${target.email}`,
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      orgId: args.orgId,
    });
    return { email: target.email };
  },
});

/** Give one of an organisation's admins a new temporary password (they must change it on sign-in). */
export const resetMemberPassword = action({
  args: { orgId: v.id("organizations"), userId: v.id("users"), password: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ email: string; tempPassword: string }> => {
    const caller = await requirePlatformCaller(ctx);
    const password = args.password?.trim() ? args.password : "";
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      throw new ConvexError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const tempPassword = password || randomPassword();
    const passwordHash = await new Scrypt().hash(tempPassword);
    const { email } = await ctx.runMutation(internal.onboarding.resetMemberPasswordInternal, {
      actorUserId: caller._id,
      orgId: args.orgId,
      userId: args.userId,
      passwordHash,
    });
    return { email, tempPassword };
  },
});
