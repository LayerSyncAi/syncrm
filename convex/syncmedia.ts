import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgAccess } from "./helpers";
import { requireModuleUser } from "./lib/moduleAccess";

/**
 * SyncMedia brochure drafts.
 *
 * Every function resolves the caller from the session and scopes to
 * (orgId, ownerUserId), so a brochure id from the client can only ever name the
 * subject of an operation — never the actor. A brochure is private to the agent
 * who made it, even from others in the same organisation.
 */

// The editable body of a brochure, shared between the save mutation's args and
// the read validator so the two can't drift apart.
const brochureFields = {
  formatKey: v.string(),
  templateId: v.string(),
  themeId: v.string(),
  photos: v.array(v.string()),
  eyebrow: v.string(),
  title: v.string(),
  location: v.string(),
  price: v.string(),
  priceLabel: v.string(),
  features: v.array(v.string()),
  reference: v.string(),
  agentName: v.string(),
  agentPhone: v.string(),
  agentEmail: v.string(),
  showLogo: v.boolean(),
  whatsappContact: v.boolean(),
  nudges: v.optional(
    v.array(
      v.object({
        format: v.string(),
        slot: v.string(),
        x: v.number(),
        y: v.number(),
      })
    )
  ),
};

/**
 * Turns stored refs into displayable URLs.
 *
 * A ref is either an absolute URL (property images and PropertyBook imports are
 * stored that way) or a Convex storage id (anything uploaded in the studio).
 * Refs whose file has since been deleted are dropped rather than surfaced as a
 * broken image.
 */
export async function resolveRefs(
  ctx: QueryCtx,
  refs: string[]
): Promise<{ ref: string; url: string }[]> {
  const out: { ref: string; url: string }[] = [];
  for (const ref of refs) {
    if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("/")) {
      out.push({ ref, url: ref });
      continue;
    }
    try {
      const url = await ctx.storage.getUrl(ref as Id<"_storage">);
      if (url) out.push({ ref, url });
    } catch {
      // A malformed ref is treated the same as a deleted file: skip it.
    }
  }
  return out;
}

async function toBrochureOut(ctx: QueryCtx, b: Doc<"brochures">) {
  return { ...b, photos: await resolveRefs(ctx, b.photos) };
}

/**
 * Caps. A brochure is a marketing one-pager, not a document store, and these
 * bound what a client can push into a single row.
 */
const MAX_PHOTOS = 8;
const MAX_FEATURES = 12;
const MAX_TEXT = 200;
/** Every block of every format adjusted, with room to spare. */
const MAX_NUDGES = 60;

/** My brochures, newest edit first. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireModuleUser(ctx, "media");
    const rows = await ctx.db
      .query("brochures")
      .withIndex("by_org_owner", (q) =>
        q.eq("orgId", user.orgId).eq("ownerUserId", user._id)
      )
      .collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(rows.map((b) => toBrochureOut(ctx, b)));
  },
});

/**
 * My existing draft for a property, if there is one. `propertyId` omitted asks
 * for the scratch draft — the one started from the sidebar rather than off a
 * property — so reopening the studio always lands back where the agent was.
 */
export const getMineForProperty = query({
  args: { propertyId: v.optional(v.id("properties")) },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "media");
    const rows = await ctx.db
      .query("brochures")
      .withIndex("by_owner_property", (q) =>
        q.eq("ownerUserId", user._id).eq("propertyId", args.propertyId)
      )
      .collect();
    // The index is on ownerUserId, not orgId, so filter on org as well: a user
    // moved between organisations must not carry their old drafts across.
    const mine = rows.filter((r) => r.orgId === user.orgId);
    if (mine.length === 0) return null;
    mine.sort((a, b) => b.updatedAt - a.updatedAt);
    return await toBrochureOut(ctx, mine[0]);
  },
});

/**
 * Create or update a draft. Passing `id` updates, omitting it creates — which
 * is what lets the studio autosave without tracking two code paths.
 */
export const save = mutation({
  args: {
    id: v.optional(v.id("brochures")),
    propertyId: v.optional(v.id("properties")),
    ...brochureFields,
  },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "media");
    const { id, ...rest } = args;

    // `propertyId` arrives from the client, so it is checked rather than
    // trusted — a brochure must not end up holding a foreign key into another
    // organisation's inventory, however harmless that looks today.
    if (rest.propertyId !== undefined) {
      const property = await ctx.db.get(rest.propertyId);
      assertOrgAccess(property, user.orgId);
    }

    const body = {
      ...rest,
      photos: rest.photos.slice(0, MAX_PHOTOS),
      features: rest.features.map((f) => f.slice(0, MAX_TEXT)).slice(0, MAX_FEATURES),
      eyebrow: rest.eyebrow.slice(0, MAX_TEXT),
      title: rest.title.slice(0, MAX_TEXT),
      location: rest.location.slice(0, MAX_TEXT),
      price: rest.price.slice(0, MAX_TEXT),
      priceLabel: rest.priceLabel.slice(0, MAX_TEXT),
      reference: rest.reference.slice(0, MAX_TEXT),
      agentName: rest.agentName.slice(0, MAX_TEXT),
      agentPhone: rest.agentPhone.slice(0, MAX_TEXT),
      agentEmail: rest.agentEmail.slice(0, MAX_TEXT),
      nudges: rest.nudges?.slice(0, MAX_NUDGES),
    };

    const now = Date.now();

    if (id !== undefined) {
      const existing = await ctx.db.get(id);
      // The same response for "gone" and "not yours", so this can't be used to
      // probe which brochure ids exist.
      if (
        existing === null ||
        existing.ownerUserId !== user._id ||
        existing.orgId !== user.orgId
      ) {
        throw new Error("That brochure could not be found.");
      }
      await ctx.db.patch(id, { ...body, updatedAt: now });
      return id;
    }

    return await ctx.db.insert("brochures", {
      ...body,
      orgId: user.orgId,
      ownerUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("brochures") },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "media");
    const existing = await ctx.db.get(args.id);
    if (
      existing === null ||
      existing.ownerUserId !== user._id ||
      existing.orgId !== user.orgId
    ) {
      throw new Error("That brochure could not be found.");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});
