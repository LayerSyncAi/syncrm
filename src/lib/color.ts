/**
 * Small hex-colour maths shared by the SyncMedia brochure themes and the
 * white-label app theme. Only `#rrggbb` is understood; anything else parses
 * as null and callers fall back to a default.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, "0")}`;
}

/** `t = 0` is all `a`, `t = 1` is all `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio between two colours, 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const LIGHT_TEXT = "#ffffff";
export const DARK_TEXT = "#14181c";

/**
 * Text that will read against `background`. The two candidates are compared
 * by actual contrast ratio rather than by thresholding the background's
 * luminance. A single threshold gets mid-tones wrong in exactly the range
 * brand colours cluster in: a gold such as #eca400 sits at luminance 0.44,
 * so any threshold near the midpoint calls it "dark" and puts white on it at
 * 2.13:1 — against 8.39:1 for the dark ink it should have chosen.
 */
export function readableOn(background: string): string {
  return contrastRatio(DARK_TEXT, background) >= contrastRatio(LIGHT_TEXT, background)
    ? DARK_TEXT
    : LIGHT_TEXT;
}
