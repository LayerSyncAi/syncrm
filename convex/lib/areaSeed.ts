/**
 * White-label seed surface for preferred-area suggestions and alias-aware
 * location matching.
 *
 * `CURATED_AREAS` is the curated dataset used to (a) seed the per-org suggestion
 * list and (b) reconcile hand-typed variants (e.g. "Mt Pleasant" -> "Mount
 * Pleasant", "CBD" -> a canonical name) against the free-text `location` strings
 * stored on properties. See docs/preferred-area-suggestions.md.
 *
 * The generic upstream ships an EMPTY dataset so it stays market-neutral — the
 * matching/canonicalization plumbing in ./locations.ts still works (it falls
 * back to normalized, title-cased substring matching), there are simply no
 * pre-loaded aliases or default suggestions. Populate this array with your
 * market's areas, or re-export a bundled reference dataset, e.g.:
 *
 *   import { ZIMBABWE_AREAS } from "./areaSeed.zimbabwe";
 *   export const CURATED_AREAS = ZIMBABWE_AREAS;
 */

export interface AreaEntry {
  /** Canonical display name, stored verbatim and shown in suggestions. */
  name: string;
  /** City / town the area belongs to (for grouping & future filtering). */
  city?: string;
  /** Known spelling/abbreviation variants that should resolve to `name`. */
  aliases?: string[];
}

/**
 * Curated areas for this deployment. Empty by default (generic). Replace with
 * your market's areas or a bundled reference seed (see the header note).
 */
export const CURATED_AREAS: AreaEntry[] = [];
