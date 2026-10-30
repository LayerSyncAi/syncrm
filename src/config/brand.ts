/**
 * Single source of truth for all client-specific branding (white-labelling).
 *
 * Every value reads from a NEXT_PUBLIC_BRAND_* environment variable and falls
 * back to the SyncEstate default, so the app renders identically when no
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
    /** Darker shade of the primary used for text on light surfaces. Left unset,
     *  globals.css mixes one from the primary. */
    primaryInk?: string;
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
    /** Logo for dark surfaces (the sidebar). */
    lockupReversed: string;
    /** Square app icon, shown when the sidebar is collapsed. */
    appIcon: string;
  };
  metadata: {
    title: string;
    description: string;
    themeColor: string;
  };
}

const env = process.env;

export const brand: BrandConfig = {
  name: env.NEXT_PUBLIC_BRAND_NAME ?? "SyncEstate",
  legalName: env.NEXT_PUBLIC_BRAND_LEGAL_NAME ?? "LayerSync",
  tagline: env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Smarter real estate. Together.",
  appDomain: env.NEXT_PUBLIC_BRAND_APP_DOMAIN ?? "app.syncrm.com",

  contact: {
    email: env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL ?? "",
    phone: env.NEXT_PUBLIC_BRAND_CONTACT_PHONE ?? "",
    address: env.NEXT_PUBLIC_BRAND_CONTACT_ADDRESS ?? "",
  },

  colors: {
    primary: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY ?? "#9bd83d",
    primary600: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_600 ?? "#86c42e",
    primaryForeground: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_FG ?? "#0f1419",
    // The SyncEstate green has a hand-picked ink; an agency colour gets a mixed one.
    primaryInk: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_INK ?? (env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY ? undefined : "#3b6812"),
    sidebar: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR ?? "#0f1419",
    sidebarHover: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_HOVER ?? "#1a2229",
    sidebarForeground: env.NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_FG ?? "#eef2f3",
    background: env.NEXT_PUBLIC_BRAND_COLOR_BACKGROUND ?? "#f2f4f3",
    foreground: env.NEXT_PUBLIC_BRAND_COLOR_FOREGROUND ?? "#0f1419",
    success: env.NEXT_PUBLIC_BRAND_COLOR_SUCCESS ?? "#3b6812",
    warning: env.NEXT_PUBLIC_BRAND_COLOR_WARNING ?? "#b45309",
    danger: env.NEXT_PUBLIC_BRAND_COLOR_DANGER ?? "#d92d20",
    info: env.NEXT_PUBLIC_BRAND_COLOR_INFO ?? "#1f5fad",
  },

  logos: {
    favicon: env.NEXT_PUBLIC_BRAND_LOGO_FAVICON ?? "/brand/favicon-32x32.png",
    icon: env.NEXT_PUBLIC_BRAND_LOGO_ICON ?? "/brand/icon-192x192.png",
    appleTouch: env.NEXT_PUBLIC_BRAND_LOGO_APPLE ?? "/brand/apple-touch-icon.png",
    wordmark: env.NEXT_PUBLIC_BRAND_LOGO_WORDMARK ?? "/brand/wordmark.png",
    og: env.NEXT_PUBLIC_BRAND_LOGO_OG ?? "/brand/og.png",
    lockupReversed: env.NEXT_PUBLIC_BRAND_LOGO_REVERSED ?? "/brand/lockup-reversed.svg",
    appIcon: env.NEXT_PUBLIC_BRAND_LOGO_APP_ICON ?? "/brand/app-icon-dark.svg",
  },

  metadata: {
    title: env.NEXT_PUBLIC_BRAND_NAME ?? "SyncEstate",
    description: env.NEXT_PUBLIC_BRAND_DESCRIPTION ?? "Leads, lettings, valuations and finance for estate agencies, on one login",
    themeColor: env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY ?? "#0f1419",
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
    (c.primaryInk ? `--brand-primary-ink:${c.primaryInk};` : "") +
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
