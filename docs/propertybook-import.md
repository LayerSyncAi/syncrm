# PropertyBook Import

This guide covers the **Import from PropertyBook** feature: how it works, where the code lives, how to operate it, and how to fix things when they break. It is written for whoever is keeping the lights on — typically the engineer who also owns the rest of the Properties module.

---

## What it does

Admins can import property listings from [propertybook.co.zw](https://www.propertybook.co.zw/) directly into SyncRM without re-uploading each property by hand. The flow is:

1. Open **Properties → Import from PropertyBook** (admin-only).
2. Pick an agency from the PropertyBook directory.
3. Preview the agency's current listings (each is fetched and parsed live).
4. Tick the listings you want, choose a batch size, click **Import**.
5. Optionally **Track** the agency so a nightly cron refreshes price/status on already-imported listings from that agency.

Imported records show a small "PropertyBook" badge linking to the original listing.

---

## User flow

### Picker (Step 1)
- Loads the agency directory by scraping `/sitemap_others.xml` (and `/listed-agencies` for logos and counts).
- The scrape result is cached in the `propertyBookCache` table for 24 hours, so subsequent visits hit Convex only — no HTTP to PropertyBook.
- Search filters by name or slug client-side.
- **Refresh** button bypasses the cache and forces a fresh scrape.

### Preview (Step 2)
- Discovers the agency's listing URLs (paginated `/listed-agencies/{slug}?page=N`, max 50 by default).
- Then fetches listing detail pages with a **3-wide client-side worker pool** (1000 ms per-slot delay → ~3 req/sec to PropertyBook), updating the progress bar as each lands.
- **Stop & use N fetched** lets the admin bail out early and proceed to selection with whatever has loaded.

### Select & import (Step 3)
- Tick listings to import. Choose a batch size (5 / 10 / 25, default 25).
- Confirm the permission acknowledgement.
- The UI sends each batch sequentially. Each batch is one `importBatch` action that:
  - Verifies admin + consumes a `pbImport` rate-limit token.
  - For each listing, downloads images **concurrently** via a 3-wide pool with a 200 ms per-slot delay.
  - Writes the property row, deduping by `pbRefCode` within the org.

### Results (Step 4)
- Shows counts: created / skipped / failed, plus per-row errors and image failures.
- Offers to **Track this agency** for the nightly refresh.

### Tracked agencies (separate page at `/app/properties/import/propertybook/tracked`)
- Lists agencies the org is following, with each one's last-refresh timestamp and status.
- **Untrack** soft-disables (sets `isActive: false`).

---

## Architecture

```
convex/
  propertyBook.ts                ← public entry point (admin-gated actions + mutations)
  propertyBook/
    parser.ts                    ← pure helpers (parsePrice, mapPbType, …) — no Node runtime
    scraper.ts                   ← "use node" — fetch + node-html-parser + image download
    refresh.ts                   ← "use node" — daily cron handler
src/
  app/app/properties/
    page.tsx                     ← entry button + list/card badges
    import/propertybook/
      page.tsx                   ← multi-step picker → preview → import flow
      tracked/page.tsx           ← tracked-agencies management
  components/properties/
    property-book-badge.tsx      ← "PropertyBook" badge component
```

**Module boundary.** Everything PropertyBook-specific lives under `convex/propertyBook*` and `src/app/app/properties/import/propertybook/`. The only cross-cutting integration points are: writes to `properties`, the new `trackedAgencies` table, Convex Storage for images, `helpers.requireAdmin`, and `rateLimit`. Nothing else imports from these directories.

### Data flow on import

```
Browser (page.tsx)
   │ getAgencyListingUrls(slug)
   ├──────────────►  Convex action (propertyBook.ts)
   │                    └─► internal scraper.collectAgencyUrls
   │                          └─► fetch /listed-agencies/{slug}?page=N
   │ ◄──────────────  urls: string[]
   │
   │ for url in urls:                       (700 ms apart)
   │   fetchOneListing(url)
   ├──────────────►  Convex action (propertyBook.ts)
   │                    └─► internal scraper.fetchListingByUrl
   │                          └─► fetch + parse listing HTML
   │ ◄──────────────  ParsedListing
   │
   │ chunk selected listings into batches of ≤25
   │ for batch in batches:
   │   importBatch(batch)
   ├──────────────►  Convex action (propertyBook.ts)
   │                    ├─► reserveImportSlot   (admin + rate limit)
   │                    ├─► for each listing: images = []   (image download
   │                    │     currently disabled — see note below)
   │                    └─► persistImported     (insert/dedupe by pbRefCode)
   │ ◄──────────────  { created, skipped, failed, errors }
```

> **Note:** Image downloading is temporarily disabled (gated by
> `IMAGE_IMPORT_ENABLED` in `convex/propertyBook.ts`). Imported images were
> rendering as blank placeholders, so listings are imported with an empty
> `images` array for now. The scraper still extracts image URLs for the preview,
> and `downloadImage` / `downloadImagesConcurrent` remain in place; set the flag
> back to `true` to restore downloading once URL resolution is fixed.

The cron path (daily 02:30 UTC):

```
crons.daily ─► internal.propertyBook.refresh.refreshAllTracked
                  ├─► listActiveTracked  (query)
                  └─► for each tracked agency:
                        ├─► scraper.fetchAgencyListings
                        ├─► applyRefresh (mutation; patches price/status/pbLastSyncedAt)
                        └─► markAgencyRefreshResult (mutation)
```

---

## Schema additions

In `convex/schema.ts`:

### `properties` (added optional fields + index)
| Field | Purpose |
|---|---|
| `pbRefCode` | PropertyBook reference (e.g. `SEF335604`). Used for dedupe and refresh. |
| `pbSourceUrl` | Original listing URL on PropertyBook. Linked from the badge. |
| `pbAgencySlug` | The agency this listing came from (used by the cron to group refreshes). |
| `pbLastSyncedAt` | Last time the cron updated this row. |

Index: `by_pb_ref` on `(orgId, pbRefCode)` — used for dedupe lookups during import and cron refresh.

### `trackedAgencies` (new table)
Per-org list of agencies the org is following for nightly refresh.

| Field | Purpose |
|---|---|
| `slug`, `name`, `logoUrl` | Identity at track time. |
| `orgId`, `addedByUserId` | Tenant scoping + audit. |
| `isActive` | Soft-disable flag (untrack sets to `false`). |
| `lastRefreshAt` / `lastRefreshStatus` / `lastRefreshError` | Cron bookkeeping; surfaced in the tracked-agencies page. |

Indexes: `by_org`, `by_org_slug`, `by_active`.

### `propertyBookCache` (new table)
Generic key/value cache for PropertyBook scrapes. Currently used only for the agency directory, but the schema accepts any opaque key so additional caches (e.g. per-agency listing URLs) can reuse it without a migration.

| Field | Purpose |
|---|---|
| `key` | Cache key (e.g. `"agencies:directory"`). |
| `payload` | JSON-encoded cached value. |
| `fetchedAt` | Timestamp; readers compare against the TTL. |

Index: `by_key`.

---

## Configuration

All tuneable values are constants in three files. Edit one place, redeploy.

### `convex/propertyBook/scraper.ts`
```ts
const PB_BASE = "https://www.propertybook.co.zw";
const USER_AGENT = "SyncRM-Importer/1.0 (+https://syncrm.app)";
const REQUEST_TIMEOUT_MS = 10_000;          // per-fetch timeout
const MAX_DESCRIPTION_LEN = 8000;           // chars stored in description
const MAX_IMAGES_PER_LISTING = 10;          // cap per listing
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;    // per-image size cap
const AGENCY_PAGE_DELAY_MS = 500;           // between agency-listing pages
const LISTING_DELAY_MS = 1000;              // between listing-detail fetches (server-side)
```

### `convex/propertyBook.ts`
```ts
const MAX_BATCH_SIZE = 25;                  // hard cap per importBatch call
const MAX_IMAGES_PER_LISTING = 10;
const IMAGE_DOWNLOAD_DELAY_MS = 200;        // per-slot delay inside the image pool
const IMAGE_DOWNLOAD_CONCURRENCY = 3;       // parallel image downloads per listing
const PB_AGENCY_CACHE_KEY = "agencies:directory";
const PB_AGENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours
```

### `convex/rateLimit.ts`
```ts
pbImport: { maxTokens: 10, refillIntervalMs: 10 * 60 * 1000 }
// 10 importBatch calls per 10 minutes per user
```

### `src/app/app/properties/import/propertybook/page.tsx`
```ts
const PER_LISTING_DELAY_MS = 1000;          // per-slot delay inside the preview pool
const PREVIEW_CONCURRENCY = 3;              // parallel listing fetches during preview
const MAX_BATCH_SIZE = 25;
const BATCH_SIZE_OPTIONS = [5, 10, 25];     // user-selectable batch sizes
```

### Kill switch (env var)
Set `PB_IMPORT_DISABLED=true` in the Convex deployment environment to disable both `listAgencies`, `previewAgencyListings`, `getAgencyListingUrls`, `fetchOneListing`, and `importBatch`. The nightly cron also short-circuits. Useful if PropertyBook complains, blocks our IP, or changes their layout in a breaking way.

---

## Public actions / mutations / queries

All under `api.propertyBook.*`. All admin-gated unless noted.

| Function | Type | Purpose |
|---|---|---|
| `listAgencies({ query?, force? })` | action | Returns the agency directory (filterable). Reads from `propertyBookCache` if a fresh entry exists; pass `force: true` to bypass the cache and re-scrape. |
| `previewAgencyListings({ slug, maxListings? })` | action | One-shot preview (legacy; the UI uses the two-phase flow below). |
| `getAgencyListingUrls({ slug, maxListings? })` | action | Phase 1 of preview — discovers listing URLs only. |
| `fetchOneListing({ url })` | action | Phase 2 — parses one listing detail page. |
| `importBatch({ listings })` | action | Downloads images + persists up to 25 listings; rate-limited. |
| `trackAgency({ slug, name, logoUrl? })` | mutation | Add/upsert an agency in the org's nightly-refresh list. |
| `untrackAgency({ id })` | mutation | Soft-disable a tracked agency. |
| `listTrackedAgencies({})` | query | Active tracked agencies for the current org. |
| `getImportStats({})` | query | Per-org count of imported properties, broken down by source agency slug. |

Internal helpers (not callable from the client) live alongside, prefixed by usage: `reserveImportSlot`, `persistImported`, `applyRefresh`, `markAgencyRefreshResult`, `listActiveTracked`, `assertAdminAccess`.

---

## Operations

### Manually trigger the cron
Convex dashboard → **Functions** → `propertyBook/refresh:refreshAllTracked` → **Run** with `{}`. Returns `{ agencies, patched, errors }`. Safe to invoke any time; it iterates active tracked agencies serially with 2 s gaps between agencies.

### Inspect what's been imported
Convex dashboard → **Tables** → `properties` → filter for `pbRefCode` not empty. Each row carries `pbSourceUrl`, `pbAgencySlug`, and `pbLastSyncedAt`.

### See cron health per agency
Convex dashboard → **Tables** → `trackedAgencies`. Each row stores `lastRefreshAt`, `lastRefreshStatus` (`"ok"` / `"error"`), and `lastRefreshError`. The tracked-agencies page in the app surfaces the same.

### Force a re-import of a listing
Imported listings are deduped by `(orgId, pbRefCode)`. To re-import:
1. Convex dashboard → `properties` → delete the row(s) (or null out the `pbRefCode` field).
2. In the UI, run the import again — it'll insert fresh.

### Invalidate the agency-directory cache
Convex dashboard → **Tables** → `propertyBookCache` → delete the row whose `key` is `"agencies:directory"`. The next picker visit re-scrapes and repopulates. The **Refresh** button in the picker does the same thing without needing dashboard access.

### Disable the feature temporarily
Set `PB_IMPORT_DISABLED=true` in the Convex deployment environment variables (Convex dashboard → **Settings** → **Environment Variables**). Re-run `npx convex dev` or redeploy. Both the manual flow and the cron will refuse to run with a clear error message.

---

## How to extend

### Add a new field from PropertyBook (e.g. parking spaces)
1. Add the optional field to `properties` in `convex/schema.ts`.
2. Add it to the parser inside `parseListingDetail` in `convex/propertyBook/scraper.ts` (the feature lookup is already in `parseFeatures`).
3. Add it to `ParsedListing` type and `parsedListingValidator` / `persistImported` validator in `convex/propertyBook.ts`.
4. (Optional) surface it in the preview table in `src/app/app/properties/import/propertybook/page.tsx`.

### Adjust politeness / throttling
Edit the constants listed in [Configuration](#configuration). PropertyBook's `robots.txt` has no `Crawl-delay` but courtesy says ≤2 req/sec. Current settings give ~1 req/sec.

### Allow non-admins to import
Replace `requireAdmin` with `getCurrentUserWithOrg` in:
- `convex/propertyBook.ts` — `reserveImportSlot`, `persistImported`, `assertAdminAccess`, `trackAgency`, `untrackAgency`.
- `src/app/app/properties/page.tsx` — drop the `isAdmin &&` guard around the entry button.
- `src/app/app/properties/import/propertybook/{page.tsx,tracked/page.tsx}` — drop the `if (!isAdmin)` early returns.

### Add another listings source (e.g. a different portal)
Don't extend this module. Create a new sibling `convex/<otherPortal>/` with the same shape. The integration boundary is: scraper exports → public action wrappers → `properties` insert. Trying to make `propertyBook.ts` "generic" pollutes both — different sites have different selectors, different rate limits, different image semantics.

---

## Troubleshooting

### Picker spins forever
- Open the browser console. Errors like `propertybook_unreachable_or_empty: ...` mean the scrape returned zero rows.
- Confirm Convex can reach `https://www.propertybook.co.zw/sitemap_others.xml` (Convex actions can fetch external URLs by default).
- Likely cause: PropertyBook changed their sitemap or the agency-card HTML. Check `parseSitemapAgencies` and `parseAgencyIndexPage` in `scraper.ts`.

### Preview returns "missing_price" / "missing_ref_code" for many listings
PropertyBook updated the listing-detail HTML. The selectors live in `parseListingDetail` (`scraper.ts`). Open one failing URL, inspect the page, update the selector. The inline JS regex (`extractInlineJsField`) is a backup — bedrooms/bathrooms/price/agency_id all fall back to it.

### Import says "Rate limit exceeded for pbImport"
Bump `pbImport` in `convex/rateLimit.ts` (e.g. `maxTokens: 20`) or wait the refill window.

### Images don't render after import
- In Convex dashboard → `properties`, confirm the row's `images` array contains storage IDs (long opaque strings), not URLs.
- If it's URLs, the import wrote to the wrong field — check `downloadImage` is being awaited and the storage ID is being captured.
- If it's storage IDs but they 404 on render, the storage record was deleted. Re-import to repopulate.

### Cron run reports errors per agency
Check `trackedAgencies.lastRefreshError` for the failed agency. Typical causes:
- PropertyBook is rate-limiting our IP (transient — retries next day).
- Agency slug changed on PropertyBook (untrack and re-track via the import flow).
- Layout change (see "missing_price" above).

### "Batch too large" error from `importBatch`
Hard server-side cap is 25 per call. The UI auto-chunks, so this only fires if a client calls the action directly with a larger array. Don't raise the cap above 25 without checking action runtime usage — image downloads dominate and Convex actions have a finite execution budget.

---

## Limits and known caveats

- **Politeness.** Per-listing fetches throttled to ~1 req/sec on the client and ~1 req/sec on the server. PropertyBook tolerated this in testing without rate-limiting our IP. If they object, lower the throughput or move to off-hours via the cron.
- **Image hotlinking.** Images are downloaded into Convex Storage at import time, not hotlinked. If PropertyBook deletes a photo, your imported copy persists.
- **Maximum 50 listings per preview.** The discovery phase caps at 50 (default) / 100 (hard cap). Larger agencies' inventories can't be fully imported in a single session — paginate by re-running the import.
- **Maximum 25 listings per import call.** Larger selections are chunked client-side.
- **Refresh granularity.** The cron updates `price`, `currency`, `status`, and `pbLastSyncedAt` only. Other fields (description, images, location) are not refreshed — re-import to update those.
- **Listings that disappear from PropertyBook stay in your DB.** The cron does not delete or auto-mark `off_market`. This is intentional; admins can manually clean up.
- **HTML brittleness.** A PropertyBook redesign breaks parsing. The selectors are concentrated in `parseAgencyIndexPage` and `parseListingDetail` in `scraper.ts` — fix those two functions and you're back in business.
