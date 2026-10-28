import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserWithOrg, requireAdmin } from "./helpers";
import { resolveRefs } from "./syncmedia";

/**
 * The organisation's marketing brand kit — the logo and colours SyncMedia
 * brochures are built from.
 *
 * Reading is open to everyone in the org (every agent's brochure needs it);
 * writing is admin-only, because one edit changes the look of every brochure
 * the whole office produces from then on.
 */

/** Interpolated straight into inline styles and into the raster, so validate it. */
const HEX = /^#[0-9a-f]{6}$/i;

const PAGE_STYLES = ["light", "cream", "dark"] as const;

export async function resolveOne(
  ctx: Parameters<typeof resolveRefs>[0],
  ref: string | undefined
): Promise<string | undefined> {
  if (!ref) return undefined;
  const [resolved] = await resolveRefs(ctx, [ref]);
  return resolved?.url;
}

/**
 * The kit for the caller's org.
 *
 * Always returns a usable object, never null: an org that has never opened the
 * branding page still gets working brochures, they just carry the org name in
 * place of a logo and the app's own primary colour as the accent. The accent
 * default is filled in on the client from `src/config/brand.ts` so the two
 * can't drift — the server has no view of the NEXT_PUBLIC_* build vars.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const org = await ctx.db.get(user.orgId);
    const row = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .unique();

    return {
      orgName: org?.name ?? "",
      accent: row?.accent,
      pageStyle: row?.pageStyle,
      logoRef: row?.logoRef,
      logoUrl: await resolveOne(ctx, row?.logoRef),
      logoOnDarkRef: row?.logoOnDarkRef,
      logoOnDarkUrl: await resolveOne(ctx, row?.logoOnDarkRef),
      contactPhone: row?.contactPhone ?? "",
      contactEmail: row?.contactEmail ?? "",
      website: row?.website ?? "",
    };
  },
});

/**
 * Upsert the kit. Admin-only, and every field is optional so the branding page
 * can save one control at a time without having to send the whole form back.
 */
export const save = mutation({
  args: {
    accent: v.optional(v.string()),
    pageStyle: v.optional(
      v.union(v.literal("light"), v.literal("cream"), v.literal("dark"))
    ),
    logoRef: v.optional(v.string()),
    logoOnDarkRef: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    if (args.accent !== undefined && !HEX.test(args.accent)) {
      throw new ConvexError("Accent must be a hex colour like #2a5925.");
    }
    if (args.pageStyle !== undefined && !PAGE_STYLES.includes(args.pageStyle)) {
      throw new ConvexError("Unknown paper style.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .unique();

    // Spreading `args` would write `undefined` over fields the caller simply
    // didn't send, so only the keys actually present are patched.
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("orgBranding", {
      orgId: user.orgId,
      createdAt: now,
      updatedAt: now,
      ...patch,
    });
  },
});

/**
 * Removes a logo and deletes the blob behind it. Deleting the file as well as
 * the reference keeps an org's storage from filling up with logos nobody can
 * reach, since nothing else ever points at these.
 */
export const clearLogo = mutation({
  args: { which: v.union(v.literal("logo"), v.literal("logoOnDark")) },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .unique();
    if (!existing) return null;

    const field = args.which === "logo" ? "logoRef" : "logoOnDarkRef";
    const ref = existing[field];

    // Only storage ids are ours to delete; a logo pointed at an external URL
    // is someone else's file.
    if (ref && !ref.startsWith("http") && !ref.startsWith("/")) {
      try {
        await ctx.storage.delete(ref as Id<"_storage">);
      } catch {
        // Already gone — carry on and clear the reference regardless.
      }
    }

    await ctx.db.patch(existing._id, { [field]: undefined, updatedAt: Date.now() });
    return null;
  },
});
