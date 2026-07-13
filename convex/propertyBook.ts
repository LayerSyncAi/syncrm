import { v } from "convex/values";
import {
  action,
  ActionCtx,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { getCurrentUserWithOrg, requireAdmin } from "./helpers";
import { resolveListingOwnership } from "./propertyAccessLib";
import { checkRateLimit } from "./rateLimit";

const MAX_BATCH_SIZE = 25;
const MAX_IMAGES_PER_LISTING = 10;
const IMAGE_DOWNLOAD_DELAY_MS = 200;
const IMAGE_DOWNLOAD_CONCURRENCY = 3;
// Image downloading is temporarily disabled: imported images were rendering as
// blank placeholders. Flip back to true once image URL resolution is fixed.
const IMAGE_IMPORT_ENABLED: boolean = false;
const PB_AGENCY_CACHE_KEY = "agencies:directory";
const PB_AGENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const listingTypeValidator = v.union(v.literal("rent"), v.literal("sale"));
const propertyTypeValidator = v.union(
  v.literal("house"),
  v.literal("apartment"),
  v.literal("land"),
  v.literal("commercial"),
  v.literal("other")
);
const statusAvailable = v.literal("available");

const parsedListingValidator = v.object({
  pbRefCode: v.string(),
  pbSourceUrl: v.string(),
  pbAgencySlug: v.string(),
  title: v.string(),
  listingType: listingTypeValidator,
  propertyType: propertyTypeValidator,
  price: v.number(),
  currency: v.string(),
  location: v.string(),
  area: v.number(),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  description: v.string(),
  imageUrls: v.array(v.string()),
  status: statusAvailable,
});

type PublicAgency = {
  slug: string;
  name: string;
  logoUrl?: string;
  forSaleCount?: number;
  forRentCount?: number;
};

type PublicListing = {
  pbRefCode: string;
  pbSourceUrl: string;
  pbAgencySlug: string;
  title: string;
  listingType: "rent" | "sale";
  propertyType: "house" | "apartment" | "land" | "commercial" | "other";
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  description: string;
  imageUrls: string[];
  status: "available";
};

export const listAgencies = action({
  args: {
    query: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<PublicAgency[]> => {
    await ctx.runQuery(internal.propertyBook.assertAdminAccess, {});
    assertNotDisabled();

    let agencies: PublicAgency[] | null = null;

    if (!args.force) {
      const cached: { payload: string; fetchedAt: number } | null =
        await ctx.runQuery(internal.propertyBook.getCachedAgencies, {});
      if (cached && Date.now() - cached.fetchedAt < PB_AGENCY_CACHE_TTL_MS) {
        try {
          agencies = JSON.parse(cached.payload) as PublicAgency[];
        } catch {
          agencies = null;
        }
      }
    }

    if (agencies === null) {
      agencies = await ctx.runAction(
        internal.propertyBook.scraper.listAgencies,
        {}
      );
      await ctx.runMutation(internal.propertyBook.setCachedAgencies, {
        payload: JSON.stringify(agencies),
      });
    }

    const needle = (args.query || "").trim().toLowerCase();
    if (!needle) return agencies;
    return agencies.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.slug.toLowerCase().includes(needle)
    );
  },
});

export const getCachedAgencies = internalQuery({
  args: {},
  handler: async (
    ctx
  ): Promise<{ payload: string; fetchedAt: number } | null> => {
    const row = await ctx.db
      .query("propertyBookCache")
      .withIndex("by_key", (q) => q.eq("key", PB_AGENCY_CACHE_KEY))
      .first();
    return row
      ? { payload: row.payload, fetchedAt: row.fetchedAt }
      : null;
  },
});

export const setCachedAgencies = internalMutation({
  args: { payload: v.string() },
  handler: async (ctx, { payload }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("propertyBookCache")
      .withIndex("by_key", (q) => q.eq("key", PB_AGENCY_CACHE_KEY))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { payload, fetchedAt: now });
    } else {
      await ctx.db.insert("propertyBookCache", {
        key: PB_AGENCY_CACHE_KEY,
        payload,
        fetchedAt: now,
      });
    }
  },
});

export const previewAgencyListings = action({
  args: {
    slug: v.string(),
    maxListings: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    agency: { slug: string; name: string };
    listings: PublicListing[];
    errors: Array<{ url: string; message: string }>;
  }> => {
    await ctx.runQuery(internal.propertyBook.assertAdminAccess, {});
    assertNotDisabled();
    return await ctx.runAction(
      internal.propertyBook.scraper.fetchAgencyListings,
      { slug: args.slug, maxListings: args.maxListings }
    );
  },
});

export const getAgencyListingUrls = action({
  args: {
    slug: v.string(),
    maxListings: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    agency: { slug: string; name: string };
    urls: string[];
  }> => {
    await ctx.runQuery(internal.propertyBook.assertAdminAccess, {});
    assertNotDisabled();
    return await ctx.runAction(
      internal.propertyBook.scraper.collectAgencyUrls,
      { slug: args.slug, maxListings: args.maxListings }
    );
  },
});

export const fetchOneListing = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<PublicListing> => {
    await ctx.runQuery(internal.propertyBook.assertAdminAccess, {});
    assertNotDisabled();
    return await ctx.runAction(
      internal.propertyBook.scraper.fetchListingByUrl,
      { url: args.url }
    );
  },
});

// Per-listing ownership assignment, keyed by the PropertyBook ref code.
// ownerUserIds: empty array => company-owned; one or more ids => those agents.
const ownershipAssignmentValidator = v.object({
  pbRefCode: v.string(),
  ownerUserIds: v.array(v.id("users")),
});

export const importBatch = action({
  args: {
    listings: v.array(parsedListingValidator),
    // Batch-level default ownership: applied to any listing without its own
    // assignment below. Empty/omitted => the company (the import default).
    ownerUserIds: v.optional(v.array(v.id("users"))),
    // Per-listing overrides. Each property is created with its own owner(s),
    // so one batch can mix company-owned and agent-owned listings.
    ownershipAssignments: v.optional(v.array(ownershipAssignmentValidator)),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ row: number; message: string }>;
  }> => {
    assertNotDisabled();
    if (args.listings.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };
    }
    if (args.listings.length > MAX_BATCH_SIZE) {
      throw new ConvexError(
        `Batch too large: ${args.listings.length} listings. Max ${MAX_BATCH_SIZE} per call — split into multiple batches.`
      );
    }

    await ctx.runMutation(internal.propertyBook.reserveImportSlot, {});

    const resolved: Array<{
      row: number;
      listing: (typeof args.listings)[number];
      images: string[];
    }> = [];

    for (let i = 0; i < args.listings.length; i++) {
      const listing = args.listings[i];
      if (IMAGE_IMPORT_ENABLED) {
        const urls = listing.imageUrls.slice(0, MAX_IMAGES_PER_LISTING);
        const { images } = await downloadImagesConcurrent(
          ctx,
          urls,
          i,
          IMAGE_DOWNLOAD_CONCURRENCY,
          IMAGE_DOWNLOAD_DELAY_MS
        );
        resolved.push({ row: i, listing, images });
      } else {
        resolved.push({ row: i, listing, images: [] });
      }
    }

    const persisted = await ctx.runMutation(
      internal.propertyBook.persistImported,
      {
        ownerUserIds: args.ownerUserIds,
        ownershipAssignments: args.ownershipAssignments,
        entries: resolved.map((r) => ({
          row: r.row,
          pbRefCode: r.listing.pbRefCode,
          pbSourceUrl: r.listing.pbSourceUrl,
          pbAgencySlug: r.listing.pbAgencySlug,
          title: r.listing.title,
          listingType: r.listing.listingType,
          propertyType: r.listing.propertyType,
          price: r.listing.price,
          currency: r.listing.currency,
          location: r.listing.location,
          area: r.listing.area,
          bedrooms: r.listing.bedrooms,
          bathrooms: r.listing.bathrooms,
          description: r.listing.description,
          images: r.images,
        })),
      }
    );

    return persisted;
  },
});

export const reserveImportSlot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    await checkRateLimit(ctx, "pbImport", user._id);
  },
});

export const assertAdminAccess = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
  },
});

export const persistImported = internalMutation({
  args: {
    ownerUserIds: v.optional(v.array(v.id("users"))),
    ownershipAssignments: v.optional(v.array(ownershipAssignmentValidator)),
    entries: v.array(
      v.object({
        row: v.number(),
        pbRefCode: v.string(),
        pbSourceUrl: v.string(),
        pbAgencySlug: v.string(),
        title: v.string(),
        listingType: listingTypeValidator,
        propertyType: propertyTypeValidator,
        price: v.number(),
        currency: v.string(),
        location: v.string(),
        area: v.number(),
        bedrooms: v.optional(v.number()),
        bathrooms: v.optional(v.number()),
        description: v.string(),
        images: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, { entries, ownerUserIds, ownershipAssignments }) => {
    const user = await requireAdmin(ctx);
    const now = Date.now();

    // Per-listing ownership map (ref -> owner ids). Falls back to the batch
    // default (`ownerUserIds`), then to company-owned when neither is set.
    const assignmentByRef = new Map<string, Array<Id<"users">>>();
    for (const a of ownershipAssignments ?? []) {
      assignmentByRef.set(a.pbRefCode, a.ownerUserIds);
    }
    const batchDefault = ownerUserIds ?? [];

    // Validate every owner id referenced anywhere in this batch exactly once.
    const allOwnerIds = new Set<Id<"users">>([
      ...batchDefault,
      ...Array.from(assignmentByRef.values()).flat(),
    ]);
    for (const id of allOwnerIds) {
      const owner = await ctx.db.get(id);
      if (!owner || !owner.isActive || owner.orgId !== user.orgId) {
        throw new ConvexError(
          "Invalid owner: user not found in your organization"
        );
      }
    }

    // Resolve a single listing's ownership shape from its ref code.
    const ownershipFor = (pbRefCode: string) => {
      const r = resolveListingOwnership(
        assignmentByRef.get(pbRefCode),
        batchDefault
      );
      return {
        ownershipType: r.ownershipType,
        ownerUserIds: r.ownerUserIds as Array<Id<"users">>,
      };
    };

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };

    for (const entry of entries) {
      try {
        if (IMAGE_IMPORT_ENABLED && entry.images.length === 0) {
          result.errors.push({ row: entry.row, message: "no_images" });
          result.skipped++;
          continue;
        }

        const existing = await ctx.db
          .query("properties")
          .withIndex("by_pb_ref", (q) =>
            q.eq("orgId", user.orgId).eq("pbRefCode", entry.pbRefCode)
          )
          .first();
        if (existing) {
          result.skipped++;
          continue;
        }

        const ownership = ownershipFor(entry.pbRefCode);

        await ctx.db.insert("properties", {
          title: entry.title,
          type: entry.propertyType,
          listingType: entry.listingType,
          price: entry.price,
          currency: entry.currency,
          location: entry.location,
          area: entry.area,
          bedrooms: entry.bedrooms,
          bathrooms: entry.bathrooms,
          status: "available",
          description: entry.description,
          images: entry.images,
          isDraft: false,
          ownershipType: ownership.ownershipType,
          ownerUserIds: ownership.ownerUserIds,
          createdByUserId: user._id,
          orgId: user.orgId,
          pbRefCode: entry.pbRefCode,
          pbSourceUrl: entry.pbSourceUrl,
          pbAgencySlug: entry.pbAgencySlug,
          pbLastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        result.created++;
      } catch (e: unknown) {
        result.errors.push({
          row: entry.row,
          message: (e as Error).message || "unknown",
        });
        result.failed++;
      }
    }

    return result;
  },
});

export const trackAgency = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("trackedAgencies")
      .withIndex("by_org_slug", (q) =>
        q.eq("orgId", user.orgId).eq("slug", args.slug)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        logoUrl: args.logoUrl,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("trackedAgencies", {
      slug: args.slug,
      name: args.name,
      logoUrl: args.logoUrl,
      orgId: user.orgId,
      addedByUserId: user._id,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const untrackAgency = mutation({
  args: { id: v.id("trackedAgencies") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.orgId !== user.orgId) {
      throw new ConvexError("Tracked agency not found");
    }
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const listTrackedAgencies = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const rows = await ctx.db
      .query("trackedAgencies")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    return rows
      .filter((r) => r.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getImportStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const props = await ctx.db
      .query("properties")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .collect();
    const imported = props.filter((p) => !!p.pbRefCode);
    const byAgency = new Map<string, number>();
    for (const p of imported) {
      const slug = p.pbAgencySlug || "unknown";
      byAgency.set(slug, (byAgency.get(slug) || 0) + 1);
    }
    return {
      totalImported: imported.length,
      byAgency: Array.from(byAgency.entries())
        .map(([slug, count]) => ({ slug, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});

export const listActiveTracked = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("trackedAgencies")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      slug: r.slug,
      name: r.name,
      orgId: r.orgId,
    }));
  },
});

export const applyRefresh = internalMutation({
  args: {
    orgId: v.id("organizations"),
    entries: v.array(
      v.object({
        pbRefCode: v.string(),
        price: v.number(),
        currency: v.string(),
        status: v.union(
          v.literal("available"),
          v.literal("under_offer"),
          v.literal("let"),
          v.literal("sold"),
          v.literal("off_market")
        ),
      })
    ),
  },
  handler: async (ctx, { orgId, entries }) => {
    const now = Date.now();
    let patched = 0;
    for (const entry of entries) {
      const existing = await ctx.db
        .query("properties")
        .withIndex("by_pb_ref", (q) =>
          q.eq("orgId", orgId).eq("pbRefCode", entry.pbRefCode)
        )
        .first();
      if (!existing) continue;
      await ctx.db.patch(existing._id, {
        price: entry.price,
        currency: entry.currency,
        status: entry.status,
        pbLastSyncedAt: now,
        updatedAt: now,
      });
      patched++;
    }
    return { patched };
  },
});

export const markAgencyRefreshResult = internalMutation({
  args: {
    id: v.id("trackedAgencies"),
    status: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, error }) => {
    const now = Date.now();
    await ctx.db.patch(id, {
      lastRefreshAt: now,
      lastRefreshStatus: status,
      lastRefreshError: error,
      updatedAt: now,
    });
  },
});

function assertNotDisabled() {
  if (process.env.PB_IMPORT_DISABLED === "true") {
    throw new ConvexError("PropertyBook import is temporarily disabled");
  }
}

// Downloads a listing's images via a fixed-size worker pool.
// Each worker pulls the next URL, calls downloadImage, then sleeps the
// per-slot delay before grabbing the next. Steady-state concurrency is
// `concurrency`, so politeness is the same as a serial loop with shorter
// effective per-image overhead.
async function downloadImagesConcurrent(
  ctx: ActionCtx,
  urls: string[],
  rowIndex: number,
  concurrency: number,
  perSlotDelayMs: number
): Promise<{
  images: string[];
  failures: Array<{ row: number; url: string; message: string }>;
}> {
  if (urls.length === 0) return { images: [], failures: [] };
  const slots: Array<string | null> = new Array(urls.length).fill(null);
  const failures: Array<{ row: number; url: string; message: string }> = [];
  let next = 0;

  const runWorker = async () => {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      try {
        const storageId = (await ctx.runAction(
          internal.propertyBook.scraper.downloadImage,
          { url: urls[i] }
        )) as string;
        slots[i] = storageId;
      } catch (e: unknown) {
        failures.push({
          row: rowIndex,
          url: urls[i],
          message: (e as Error).message || "download_failed",
        });
      }
      if (next < urls.length) {
        await new Promise((r) => setTimeout(r, perSlotDelayMs));
      }
    }
  };

  const workerCount = Math.min(concurrency, urls.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return {
    images: slots.filter((s): s is string => s !== null),
    failures,
  };
}

// Exported type helper for frontend consumption
export type ImportBatchResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
};
