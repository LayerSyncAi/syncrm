/**
 * Single source of truth for all client-specific branding (white-labelling).
 *
 * Every value reads from a NEXT_PUBLIC_BRAND_* environment variable and falls
 * back to the current SynCRM default, so the app renders identically when no
 * vars are set. To rebrand a client:
 *   1. Set NEXT_PUBLIC_BRAND_* vars in .env.local (and your Vercel project).
 *   2. Drop the client's logo files into public/brand/ (same filenames).
 *   3. Redeploy.
 *
 * NOTE: NEXT_PUBLIC_* vars are inlined at BUILD time, so colour/string changes
 * require a rebuild + redeploy — they are not runtime-switchable.
 *
 * See docs/BRANDING.md for the full guide.
 */

export interface BrandConfig {
  /** Product name shown in the UI, titles, and copy. */
  name: string;
  /** Legal entity name for footers / legal text. */
  legalName: string;
  /** One-line product tagline. */
  tagline: string;
  /** App domain shown on the marketing page mock. */
  appDomain: string;
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  /** Brand-controllable colours (hex). Surfaces + status-pair tints stay in the
   *  design system (globals.css); these are the values clients actually change. */
  colors: {
    primary: string;
    primary600: string;
    primaryForeground: string;
    sidebar: string;
    sidebarHover: string;
    sidebarForeground: string;
    background: string;
    foreground: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  /** Paths to swappable brand image assets under /public/brand/. */
  logos: {
    favicon: string;
    icon: string;
    appleTouch: string;
    wordmark: string;
    og: string;
  };
  metadata: {
    title: string;
    description: string;
    themeColor: string;
  };
}

const env = process.env;

export const brand: BrandConfig = {
  name: env.NEXT_PUBLIC_BRAND_NAME ?? "SynCRM",
  legalName: env.NEXT_PUBLIC_BRAND_LEGAL_NAME ?? "SynCRM",
  tagline: env.NEXT_PUBLIC_BRAND_TAGLINE ?? "The CRM built for real estate teams",
  appDomain: env.NEXT_PUBLIC_BRAND_APP_DOMAIN ?? "app.syncrm.com",

  contact: {
    email: env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL ?? "",
    phone: env.NEXT_PUBLIC_BRAND_CONTACT_PHONE ?? "",
    address: env.NEXT_PUBLIC_BRAND_CONTACT_ADDRESS ?? "",
  },

  colors: {
    primary: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY ?? "#eca400",
    primary600: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_600 ?? "#d89500",
    primaryForeground: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_FG ?? "#ffffff",
    sidebar: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR ?? "#2a5925",
    sidebarHover: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_HOVER ?? "#1e3f1a",
    sidebarForeground: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_FG ?? "#fcfcfc",
    background: env.NEXT_PUBLIC_BRAND_COLOR_BACKGROUND ?? "#f1f4f9",
    foreground: env.NEXT_PUBLIC_BRAND_COLOR_FOREGROUND ?? "#1f2a44",
    success: env.NEXT_PUBLIC_BRAND_COLOR_SUCCESS ?? "#16a34a",
    warning: env.NEXT_PUBLIC_BRAND_COLOR_WARNING ?? "#ca8a04",
    danger: env.NEXT_PUBLIC_BRAND_COLOR_DANGER ?? "#dc2626",
    info: env.NEXT_PUBLIC_BRAND_COLOR_INFO ?? "#0284c7",
  },

  logos: {
    favicon: env.NEXT_PUBLIC_BRAND_LOGO_FAVICON ?? "/brand/favicon-32x32.png",
    icon: env.NEXT_PUBLIC_BRAND_LOGO_ICON ?? "/brand/icon-192x192.png",
    appleTouch: env.NEXT_PUBLIC_BRAND_LOGO_APPLE ?? "/brand/apple-touch-icon.png",
    wordmark: env.NEXT_PUBLIC_BRAND_LOGO_WORDMARK ?? "/brand/wordmark.png",
    og: env.NEXT_PUBLIC_BRAND_LOGO_OG ?? "/brand/og.png",
  },

  metadata: {
    title: env.NEXT_PUBLIC_BRAND_NAME ?? "SynCRM",
    description: env.NEXT_PUBLIC_BRAND_DESCRIPTION ?? "Real Estate Pipeline CRM",
    themeColor: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY ?? "#eca400",
  },
};

/** CSS that maps the brand colours onto the `--brand-*` custom properties that
 *  globals.css reads. Injected once at the document root (see layout.tsx). */
export function brandThemeCss(): string {
  const c = brand.colors;
  return `:root{` +
    `--brand-primary:${c.primary};` +
    `--brand-primary-600:${c.primary600};` +
    `--brand-primary-foreground:${c.primaryForeground};` +
    `--brand-sidebar:${c.sidebar};` +
    `--brand-sidebar-hover:${c.sidebarHover};` +
    `--brand-sidebar-foreground:${c.sidebarForeground};` +
    `--brand-background:${c.background};` +
    `--brand-foreground:${c.foreground};` +
    `--brand-success:${c.success};` +
    `--brand-warning:${c.warning};` +
    `--brand-danger:${c.danger};` +
    `--brand-info:${c.info};` +
    `}`;
}
