# Preferred-area / location suggestions

How area suggestions are sourced, how manual entries are reconciled, and the
reasoning behind the key decisions. This covers the "preferred areas" entered on
**contacts** and **leads**, which feed lead qualification and AI property
suggestions.

## TL;DR

- **Source:** a self-hosted, curated Zimbabwe area dataset (not Google Places).
- **Storage:** every area is **canonicalized** on save so hand-typed variants
  (e.g. `Mt Pleasant`) are stored under the official name (`Mount Pleasant`).
- **Matching:** a single shared primitive, `areaMatchesLocation`, is used
  everywhere an area is compared to a property location, so suggested and
  manually-entered areas match identically.
- **Fallback:** users can always add an area that isn't in the suggestions; a
  missing suggestion never blocks recording the client's real preference.

## Decision 1 — dataset vs. Google Places

**Chosen: self-hosted Zimbabwe dataset.**

| | Self-hosted dataset (chosen) | Google Places autocomplete |
|---|---|---|
| Cost | Free, offline | Per-request billing |
| Dependency | None | External API + key management, quota, availability |
| Coverage of ZW suburbs | Curated, complete for our market | Patchy for smaller suburbs; returns formatted addresses |
| Matchability | Clean suburb names that align with property `location` text | Address strings that don't align with stored locations |
| Variant reconciliation | We own canonical names + aliases | Cannot reconcile against our property data |
| Maintenance | Edit one list | None, but no control over results |

The deciding factor is **matching quality**, which is the whole point of the
feature. Property `location` is free text entered by agents (e.g.
`"12 Acacia Rd, Mount Pleasant, Harare"`). Google Places would give us a
different formatted address string with no guaranteed relationship to that text,
so we'd *still* need a normalization/alias layer on top of it — plus a billed
external dependency. A curated dataset gives us canonical names **and** an alias
table we control, which directly solves the `Mt Pleasant` vs `Mount Pleasant`
problem against our own data, offline and for free.

Google Places remains a clean future enhancement: the area field could call it
for discovery, then pass the result through the same `canonicalizeArea` /
`areaMatchesLocation` layer documented here. Nothing in the current design
precludes it.

### White-label seed

The matching/normalization plumbing lives in
[`convex/lib/locations.ts`](../convex/lib/locations.ts) and is dataset-agnostic.
The curated dataset itself is white-label configuration in
[`convex/lib/areaSeed.ts`](../convex/lib/areaSeed.ts) (`CURATED_AREAS`), which
the generic upstream ships **empty** — the plumbing still works (it falls back
to normalized, title-cased substring matching), there are simply no pre-loaded
aliases or default suggestions.

To populate it for a specific market, edit `CURATED_AREAS`, or re-export a
bundled reference dataset. A Zimbabwe reference seed ships in
[`convex/lib/areaSeed.zimbabwe.ts`](../convex/lib/areaSeed.zimbabwe.ts); enable
it with:

```ts
// convex/lib/areaSeed.ts
import { ZIMBABWE_AREAS } from "./areaSeed.zimbabwe";
export const CURATED_AREAS = ZIMBABWE_AREAS;
```

That single file is the maintenance surface for the dataset.

## Decision 2 — how free-text variants reconcile for matching

**Chosen: canonical normalization + alias map, applied at save-time and match-time.**

A single dependency-free module, `convex/lib/locations.ts`, owns:

- `normalizeArea(s)` — lowercase, strip punctuation, collapse whitespace, and
  expand a small, unambiguous abbreviation set (`Mt`→`Mount`, `Vic`→`Victoria`,
  …). So `"Mt. Pleasant"` and `"Mount Pleasant"` both normalize to
  `mount pleasant`.
- `canonicalizeArea(s)` — used at **save-time**. Known suburbs/aliases snap to
  the official display name; unknown free-text areas are cleaned and title-cased
  so they're stored consistently. Never drops a non-empty input.
- `areaMatchesLocation(area, location)` — the **single** matching primitive used
  everywhere. Normalizes and alias-resolves both sides, then does a two-way
  containment check.

Because canonicalization runs at save-time **and** the same normalization runs
at match-time, a suggested area and a hand-typed variant of it collapse to the
same value and match a property location identically. This fixes matching rather
than hiding the gap.

### Where it's wired in

Save-time canonicalization:

- `convex/leads.ts` — `create`, `update`, and `createWithProperties`
- `convex/contacts.ts` — `create`, `update`
- `convex/leadImport.ts` — CSV import
- `convex/locations.ts` — `create` (suggestion-list entries)

Match-time (`areaMatchesLocation`):

- `convex/matches.ts` — AI property-suggestion scoring (lead → properties)
- `convex/contacts.ts` — contact → property matching and the segment area filter
- `src/app/app/leads/new/page.tsx` — the "recommended properties" preview, so the
  preview matches exactly how the backend will score

## Suggestion list seeding & top-up

Suggestions are stored per-org in the `locations` table.

- `locations.seedDefaultsIfEmpty` seeds the full dataset for a brand-new org.
- `locations.syncDefaults` idempotently adds any curated areas an org is
  **missing** — this tops up orgs that were seeded from the older, smaller list
  so previously-missing suburbs appear, without disturbing user-added entries.

The contacts and new-lead pages call these on load, so existing orgs pick up the
expanded list automatically.

## Manual entry / free-text fallback

The area picker is searchable, and a separate "add" box lets the user enter any
area. On add, the area is **always** attached to the contact/lead first
(canonicalized), then best-effort persisted to the org's reusable suggestion
list. If that persist fails (e.g. it already exists), the area is still recorded
— a missing suggestion can never block capturing the client's actual preference.

## Tests

`src/__tests__/locations.test.ts` covers normalization, canonicalization,
deduplication, the matching primitive (including `Mt Pleasant` ↔ a property at
`Mount Pleasant`), and dataset coverage of previously-missing suburbs.
