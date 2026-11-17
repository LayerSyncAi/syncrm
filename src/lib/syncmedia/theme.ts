import { brand } from "@/config/brand";
import { mix, parseHex, readableOn } from "@/lib/color";
import type {
  BrandKit,
  BrochureTheme,
  PageStyle,
  ThemeId,
} from "./types";

/**
 * Brochure colour schemes.
 *
 * The organisation's own scheme (`brand`) is *derived* rather than stored: an
 * admin picks an accent and a paper style on the branding page, and the
 * remaining six tokens are computed from those two. Asking anyone to supply
 * eight hex codes is a form nobody completes, and getting one of them wrong
 * puts unreadable text on every brochure the office sends out.
 *
 * The other four are fixed alternatives, for the posts that want to look
 * different from the house scheme.
 */

// --- colour maths ----------------------------------------------------------
// Shared with the white-label app theme; see src/lib/color.ts.

export { readableOn };

// --- paper -----------------------------------------------------------------

interface PaperPreset {
  label: string;
  page: string;
  ink: string;
  inkSoft: string;
  line: string;
  /** How far the accent is pulled toward the page to make `accentSoft`. */
  softness: number;
}

export const PAPER: Record<PageStyle, PaperPreset> = {
  light: {
    label: "White",
    page: "#ffffff",
    ink: "#111827",
    inkSoft: "#64748b",
    line: "#dfe5ec",
    softness: 0.88,
  },
  cream: {
    label: "Cream",
    // Warm off-white rather than pure white: printed brochures sit on a cream
    // stock, and flat #fff next to a saturated accent reads colder.
    page: "#f8f6f0",
    ink: "#241f19",
    inkSoft: "#6e6658",
    line: "#ddd6c6",
    softness: 0.86,
  },
  dark: {
    label: "Charcoal",
    page: "#101613",
    ink: "#f3f6f1",
    inkSoft: "#a3ada0",
    line: "#27322b",
    softness: 0.8,
  },
};

export const PAGE_STYLES: PageStyle[] = ["light", "cream", "dark"];

/**
 * The organisation's scheme, built from the two values an admin actually
 * chose. An unparseable accent falls back to the app's primary rather than
 * throwing — a bad value in the database must not take the studio down.
 */
export function buildBrandTheme(accent: string, pageStyle: PageStyle): BrochureTheme {
  const safeAccent = parseHex(accent) ? accent : brand.colors.primary;
  const paper = PAPER[pageStyle] ?? PAPER.light;
  const accentSoft = mix(safeAccent, paper.page, paper.softness);

  return {
    id: "brand",
    name: "Brand",
    page: paper.page,
    ink: paper.ink,
    inkSoft: paper.inkSoft,
    accent: safeAccent,
    onAccent: readableOn(safeAccent),
    accentSoft,
    onAccentSoft: readableOn(accentSoft),
    line: paper.line,
  };
}

/** The fixed alternatives to the org's own scheme. */
export const STOCK_THEMES: BrochureTheme[] = [
  {
    id: "midnight",
    name: "Midnight",
    page: "#101613",
    ink: "#f3f6f1",
    inkSoft: "#a3ada0",
    accent: "#39b54a",
    onAccent: "#06210b",
    accentSoft: "#1c2a21",
    onAccentSoft: "#bfe6c4",
    line: "#27322b",
  },
  {
    id: "ivory",
    name: "Ivory & Ink",
    page: "#f8f6f0",
    ink: "#241f19",
    inkSoft: "#6e6658",
    accent: "#241f19",
    onAccent: "#f8f6f0",
    accentSoft: "#e9e4d7",
    onAccentSoft: "#3c352b",
    line: "#ddd6c6",
  },
  {
    id: "slate",
    name: "Slate",
    page: "#ffffff",
    ink: "#111827",
    inkSoft: "#64748b",
    accent: "#1f2937",
    onAccent: "#ffffff",
    accentSoft: "#eef2f7",
    onAccentSoft: "#1f2937",
    line: "#dfe5ec",
  },
  {
    id: "terracotta",
    name: "Terracotta",
    page: "#fffcfa",
    ink: "#2b1d17",
    inkSoft: "#7a6459",
    accent: "#b0573a",
    onAccent: "#fff7f3",
    accentSoft: "#f7e5dd",
    onAccentSoft: "#7d3a24",
    line: "#eddbd2",
  },
];

/** Every scheme on offer, the org's own first. */
export function themesFor(kit: BrandKit): BrochureTheme[] {
  return [buildBrandTheme(kit.accent, kit.pageStyle), ...STOCK_THEMES];
}

export function getTheme(id: ThemeId, kit: BrandKit): BrochureTheme {
  if (id === "brand") return buildBrandTheme(kit.accent, kit.pageStyle);
  return STOCK_THEMES.find((t) => t.id === id) ?? buildBrandTheme(kit.accent, kit.pageStyle);
}

/**
 * What the studio works with, whether or not an admin has ever opened the
 * branding page. The accent defaults to the app's own primary colour, which is
 * resolved here on the client because it comes from a build-time env var the
 * Convex backend cannot see.
 */
export function resolveBrandKit(
  row:
    | {
        orgName?: string;
        accent?: string;
        pageStyle?: PageStyle;
        logoUrl?: string;
        logoOnDarkUrl?: string;
        contactPhone?: string;
        contactEmail?: string;
        website?: string;
      }
    | null
    | undefined,
  fallbackOrgName = ""
): BrandKit {
  return {
    orgName: row?.orgName || fallbackOrgName || brand.name,
    accent: row?.accent || brand.colors.primary,
    pageStyle: row?.pageStyle ?? "cream",
    logoUrl: row?.logoUrl,
    logoOnDarkUrl: row?.logoOnDarkUrl,
    contactPhone: row?.contactPhone ?? "",
    contactEmail: row?.contactEmail ?? "",
    website: row?.website ?? "",
  };
}

/** Accent suggestions on the branding page — the app's own colours first. */
export const ACCENT_SUGGESTIONS: string[] = [
  brand.colors.primary,
  brand.colors.sidebar,
  "#1f2937",
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#b0573a",
  "#be123c",
];
