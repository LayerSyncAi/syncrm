/**
 * SyncWorth agency settings (standard report wording, hold-until-paid) and
 * valuer profiles (registration number, qualifications, scanned signature).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { recordAudit } from "../logs";
import { displayName, requireWorth } from "./access";

export const DEFAULT_ASSUMPTIONS = [
  "The property is valued with vacant possession unless stated otherwise.",
  "Title is assumed to be good and marketable, free of encumbrances, restrictions or servitudes that would affect value, other than those noted.",
  "The property and its use comply with planning, building and environmental regulations.",
  "Building areas are measured on site or taken from plans supplied, and are approximate.",
  "Services connected to the property are assumed to be in working order.",
].join("\n");

export const DEFAULT_LIMITING_CONDITIONS = [
  "This report is for the stated purpose and for the use of the instructing party only. No responsibility is accepted to any third party.",
  "No structural survey was carried out and services were not tested. The valuation assumes no latent defects.",
  "The valuation is valid at the date of valuation only. Values may change with market conditions.",
  "Neither the whole nor any part of this report may be published without the written consent of the valuer.",
].join("\n");

export const DEFAULT_DISCLAIMER =
  "The values stated are the opinion of the signing valuer, based on the information available at the date of valuation.";

type SettingsView = Omit<Doc<"worthSettings">, "_id" | "_creationTime" | "orgId"> & { exists: boolean };

export function settingsDefaults(): Omit<SettingsView, "exists" | "updatedAt"> {
  return {
    referencePrefix: "VAL",
    seqYear: 0,
    nextSeq: 1,
    assumptions: DEFAULT_ASSUMPTIONS,
    limitingConditions: DEFAULT_LIMITING_CONDITIONS,
    disclaimer: DEFAULT_DISCLAIMER,
    holdReportUntilPaid: false,
    dueSoonDays: 2,
  };
}

export async function readSettings(ctx: QueryCtx, orgId: Id<"organizations">): Promise<SettingsView> {
  const row = await ctx.db
    .query("worthSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (row) {
    return {
      referencePrefix: row.referencePrefix,
      seqYear: row.seqYear,
      nextSeq: row.nextSeq,
      assumptions: row.assumptions,
      limitingConditions: row.limitingConditions,
      disclaimer: row.disclaimer,
      holdReportUntilPaid: row.holdReportUntilPaid,
      dueSoonDays: row.dueSoonDays,
      updatedAt: row.updatedAt,
      exists: true,
    };
  }
  return { ...settingsDefaults(), updatedAt: 0, exists: false };
}

/** The org's settings row, created with defaults on first use. */
export async function ensureSettings(ctx: MutationCtx, orgId: Id<"organizations">): Promise<Doc<"worthSettings">> {
  const row = await ctx.db
    .query("worthSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (row) return row;
  const id = await ctx.db.insert("worthSettings", { orgId, ...settingsDefaults(), updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorth(ctx);
    const s = await readSettings(ctx, access.orgId);
    return { ...s, caps: access.caps, userId: access.user._id };
  },
});

export const update = mutation({
  args: {
    assumptions: v.string(),
    limitingConditions: v.string(),
    disclaimer: v.string(),
    holdReportUntilPaid: v.boolean(),
    dueSoonDays: v.number(),
    referencePrefix: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    if (!access.caps.canAdmin) throw new ConvexError("Director access required");
    const prefix = args.referencePrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(prefix)) {
      throw new ConvexError("Reference prefix must be 1 to 8 letters or digits");
    }
    const days = Math.round(args.dueSoonDays);
    if (days < 0 || days > 30) throw new ConvexError("Due-soon days must be between 0 and 30");
    const row = await ensureSettings(ctx, access.orgId);
    await ctx.db.patch(row._id, {
      assumptions: args.assumptions.trim(),
      limitingConditions: args.limitingConditions.trim(),
      disclaimer: args.disclaimer.trim(),
      holdReportUntilPaid: args.holdReportUntilPaid,
      dueSoonDays: days,
      referencePrefix: prefix,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: displayName(access.user),
      action: "worth.settings_update",
      category: "worth",
      description: "Updated SyncWorth settings",
      orgId: access.orgId,
      metadata: { holdReportUntilPaid: args.holdReportUntilPaid, referencePrefix: prefix },
    });
  },
});

// =====================
// Valuer profiles
// =====================

/** Users who can be assigned valuations: valuers and signing valuers. */
export async function listValuerUsers(ctx: QueryCtx, orgId: Id<"organizations">) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(500);
  return users.filter(
    (u) =>
      u.isActive &&
      (u.estateRoles?.includes("valuer") || u.estateRoles?.includes("signing_valuer"))
  );
}

export async function getProfile(ctx: QueryCtx, orgId: Id<"organizations">, userId: Id<"users">) {
  return ctx.db
    .query("worthValuerProfiles")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .unique();
}

export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorth(ctx);
    const users = await listValuerUsers(ctx, access.orgId);
    // A director who signs without the valuer role still needs a profile.
    if (!users.some((u) => u._id === access.user._id) && access.caps.isValuationStaff) {
      users.push(access.user);
    }
    return Promise.all(
      users.map(async (u) => {
        const p = await getProfile(ctx, access.orgId, u._id);
        return {
          userId: u._id,
          name: displayName(u),
          email: u.email ?? "",
          isSigning: !!u.estateRoles?.includes("signing_valuer"),
          registrationNumber: p?.registrationNumber ?? "",
          qualifications: p?.qualifications ?? "",
          signatureUrl: p?.signatureStorageId ? await ctx.storage.getUrl(p.signatureStorageId) : null,
          canEdit: access.caps.canAdmin || u._id === access.user._id,
        };
      })
    );
  },
});

export const saveProfile = mutation({
  args: {
    userId: v.id("users"),
    registrationNumber: v.string(),
    qualifications: v.string(),
    signatureStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    if (!access.caps.canAdmin && args.userId !== access.user._id) {
      throw new ConvexError("You can only edit your own profile");
    }
    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== access.orgId) throw new ConvexError("User not found");
    const existing = await getProfile(ctx, access.orgId, args.userId);
    const patch: Partial<Doc<"worthValuerProfiles">> = {
      registrationNumber: args.registrationNumber.trim() || undefined,
      qualifications: args.qualifications.trim() || undefined,
      updatedAt: Date.now(),
    };
    if (args.signatureStorageId !== undefined) {
      // Replacing or clearing a signature removes the old file.
      if (existing?.signatureStorageId && existing.signatureStorageId !== args.signatureStorageId) {
        await ctx.storage.delete(existing.signatureStorageId);
      }
      patch.signatureStorageId = args.signatureStorageId ?? undefined;
    }
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("worthValuerProfiles", {
        orgId: access.orgId,
        userId: args.userId,
        registrationNumber: patch.registrationNumber,
        qualifications: patch.qualifications,
        signatureStorageId: patch.signatureStorageId,
        updatedAt: Date.now(),
      });
    }
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: displayName(access.user),
      action: "worth.valuer_profile_update",
      category: "worth",
      description: `Updated valuer profile for ${displayName(target)}`,
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      orgId: access.orgId,
    });
  },
});
