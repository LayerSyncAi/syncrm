/**
 * The app theme for a white-label organisation, derived from the two colours
 * LayerSync picks when onboarding it (primary and, optionally, sidebar).
 *
 * The app's colours already flow through the `--brand-*` custom properties
 * (src/config/brand.ts → globals.css), so a white-label org just gets a later
 * `:root{--brand-*}` block that overrides them. Every other shade the UI needs
 * is derived here so any colour LayerSync picks stays readable.
 */
import { brand } from "../config/brand";
import { contrastRatio, DARK_TEXT, luminance, mix, parseHex, readableOn } from "./color";

export interface OrgThemeInput {
  primary?: string | null;
  sidebar?: string | null;
}

export interface OrgTheme {
  primary: string;
  primary600: string;
  primaryForeground: string;
  /** The primary darkened until it reads as text on light surfaces (≥ 4.5:1). */
  primaryInk: string;
  sidebar: string;
  sidebarHover: string;
  sidebarForeground: string;
}

/** WCAG AA for normal text. */
const AA = 4.5;
const SIDEBAR_LIGHT_TEXT = "#eef2f3";

function valid(hex: string | null | undefined): hex is string {
  return !!hex && !!parseHex(hex);
}

/**
 * Darken `color` toward black until it reaches AA on both white cards and the
 * app's content background. A primary that already passes is used as is.
 */
export function inkFor(color: string): string {
  const surfaces = ["#ffffff", brand.colors.background];
  const passes = (c: string) => surfaces.every((s) => contrastRatio(c, s) >= AA);
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = t === 0 ? color : mix(color, "#000000", t);
    if (passes(candidate)) return candidate;
  }
  return DARK_TEXT;
}

export function deriveOrgTheme(input: OrgThemeInput): OrgTheme {
  const primary = valid(input.primary) ? input.primary.toLowerCase() : brand.colors.primary;
  const sidebar = valid(input.sidebar) ? input.sidebar.toLowerCase() : brand.colors.sidebar;
  const darkSidebar = luminance(sidebar) < 0.4;
  return {
    primary,
    primary600: mix(primary, "#000000", 0.12),
    primaryForeground: readableOn(primary),
    primaryInk: inkFor(primary),
    sidebar,
    sidebarHover: darkSidebar ? mix(sidebar, "#ffffff", 0.08) : mix(sidebar, "#000000", 0.06),
    sidebarForeground: darkSidebar ? SIDEBAR_LIGHT_TEXT : DARK_TEXT,
  };
}

/** The `:root` override injected after the base brand theme. */
export function orgThemeCss(theme: OrgTheme): string {
  return (
    `:root{` +
    `--brand-primary:${theme.primary};` +
    `--brand-primary-600:${theme.primary600};` +
    `--brand-primary-foreground:${theme.primaryForeground};` +
    `--brand-primary-ink:${theme.primaryInk};` +
    `--brand-sidebar:${theme.sidebar};` +
    `--brand-sidebar-hover:${theme.sidebarHover};` +
    `--brand-sidebar-foreground:${theme.sidebarForeground};` +
    `}`
  );
}

/** Up to two initials for a collapsed sidebar or an avatar ("Chas Everett" → "CE"). */
export function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
