/**
 * Shared, dependency-free location utilities for preferred-area suggestions
 * and matching.
 *
 * This module holds the normalization / matching primitives used everywhere a
 * preferred area is compared against a property location. The curated dataset
 * itself is white-label configuration and lives in ./areaSeed (empty by default,
 * swappable per deployment — see docs/preferred-area-suggestions.md).
 *
 * It is imported by both Convex functions (relative `./lib/locations`) and the
 * Next.js frontend (relative `../../../convex/lib/locations`). Keep it free of
 * any Convex server imports so it stays usable on both sides and in tests.
 *
 * Design decision (see docs/preferred-area-suggestions.md): we ship a
 * self-hosted, injectable dataset rather than calling a geocoding API. It is
 * offline, free, deterministic, and — unlike Places — lets us reconcile
 * hand-typed variants against the free-text `location` strings stored on
 * properties.
 */

import { CURATED_AREAS, type AreaEntry } from "./areaSeed";

export type { AreaEntry };

/**
 * Word-level abbreviation expansions applied during normalization so that
 * hand-typed shorthand reconciles with canonical names. Kept deliberately
 * small and unambiguous to avoid wrong expansions.
 */
const ABBREVIATIONS: Record<string, string> = {
  mt: "mount",
  mnt: "mount",
  ext: "extension",
  pk: "park",
  hts: "heights",
  hgts: "heights",
  gdns: "gardens",
  vic: "victoria",
};

/**
 * Normalize an area / location string to a stable comparison key:
 * lowercase, punctuation stripped, whitespace collapsed, and known
 * abbreviations expanded word-by-word. Dataset-independent.
 */
export function normalizeArea(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[._/]/g, " ") // dots, underscores, slashes -> space
    .replace(/[^a-z0-9\s-]/g, "") // drop other punctuation, keep hyphen for now
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ")
    .trim();
}

function titleCase(normalized: string): string {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface AreaTools {
  /** Deduplicated, alphabetically sorted list of canonical area names. */
  areaNames: string[];
  /** Canonicalize an area for storage (snap known aliases; title-case others). */
  canonicalizeArea(raw: string): string;
  /** Canonicalize a list, dropping empties / case-insensitive duplicates. */
  canonicalizeAreas(areas: string[]): string[];
  /** Decide whether a preferred `area` matches a property `location`. */
  areaMatchesLocation(area: string, location: string): boolean;
}

/**
 * Build the alias-aware area tools for a given curated dataset. The generic
 * upstream binds these to the (empty) configured seed below; tests and
 * market-specific code can build tools for any dataset.
 */
export function createAreaTools(areas: AreaEntry[]): AreaTools {
  // normalized canonical name -> display name
  const normToDisplay = new Map<string, string>();
  // normalized alias -> normalized canonical name
  const aliasToCanon = new Map<string, string>();

  for (const area of areas) {
    const canonNorm = normalizeArea(area.name);
    if (canonNorm) normToDisplay.set(canonNorm, area.name);
    for (const alias of area.aliases ?? []) {
      const aliasNorm = normalizeArea(alias);
      if (aliasNorm) aliasToCanon.set(aliasNorm, canonNorm);
    }
  }

  /**
   * Resolve a raw string to its normalized canonical key — applying alias
   * mapping when the normalized form is a known variant. Returns the plain
   * normalized form for unknown areas (still useful for matching).
   */
  function canonicalKey(raw: string): string {
    const n = normalizeArea(raw);
    if (!n) return "";
    if (normToDisplay.has(n)) return n;
    return aliasToCanon.get(n) ?? n;
  }

  function canonicalizeArea(raw: string): string {
    if (!raw || !raw.trim()) return "";
    const key = canonicalKey(raw);
    const display = normToDisplay.get(key);
    if (display) return display;
    return titleCase(key) || raw.trim();
  }

  function canonicalizeAreas(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const canonical = canonicalizeArea(raw);
      if (!canonical) continue;
      const dedupeKey = canonical.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(canonical);
    }
    return out;
  }

  function areaMatchesLocation(area: string, location: string): boolean {
    const a = canonicalKey(area);
    const l = normalizeArea(location);
    if (!a || !l) return false;
    if (l.includes(a) || a.includes(l)) return true;
    // Resolve whole-string aliases on the location side too (e.g. "CBD").
    const lc = canonicalKey(location);
    if (lc !== l && (lc.includes(a) || a.includes(lc))) return true;
    return false;
  }

  const areaNames = Array.from(new Set(areas.map((a) => a.name))).sort((a, b) =>
    a.localeCompare(b)
  );

  return { areaNames, canonicalizeArea, canonicalizeAreas, areaMatchesLocation };
}

// Default tools bound to the deployment's configured seed (empty upstream).
const defaultTools = createAreaTools(CURATED_AREAS);

/**
 * Canonicalize an area for *storage*. Known suburbs / aliases snap to the
 * official display name; unknown free-text areas are cleaned and title-cased
 * so they are stored consistently and remain matchable. Never throws and
 * never drops a non-empty input (falls back to the trimmed original).
 */
export const canonicalizeArea = defaultTools.canonicalizeArea;

/**
 * Canonicalize a list of areas: trim, canonicalize, and drop empties /
 * case-insensitive duplicates while preserving order.
 */
export const canonicalizeAreas = defaultTools.canonicalizeAreas;

/**
 * The single shared primitive for deciding whether a preferred `area` matches
 * a property `location`. Both sides are normalized (abbreviations expanded)
 * and alias-resolved before a two-way containment check.
 */
export const areaMatchesLocation = defaultTools.areaMatchesLocation;

/**
 * Deduplicated, alphabetically sorted canonical area names for the configured
 * seed, used to seed the per-org suggestion list. Empty in the generic upstream.
 */
export const CURATED_AREA_NAMES: string[] = defaultTools.areaNames;
