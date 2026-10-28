/**
 * Front-end registry of Sync Estate modules: names, colours, home routes and
 * navigation. Which modules a user may open comes from the server
 * (api.hub.getContext); this file only describes how each one looks.
 *
 * Adding a module: add its key in convex/lib/modules.ts, an entry here, and
 * its pages under src/app/app/<route>. Nothing in the Hub changes.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileBarChart,
  FileSignature,
  FileText,
  Gauge,
  HardHat,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Palette,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  UsersRound,
  Wallet,
  Waypoints,
  Wrench,
} from "lucide-react";
import type { ModuleKey } from "../../convex/lib/modules";

export type { ModuleKey };

export type ModuleNavItem = { label: string; href: string; icon: LucideIcon };

export type ModuleDef = {
  key: ModuleKey;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the module's accent tile. */
  accent: string;
  homeHref: string;
  /** Route prefixes that belong to this module (longest match wins). */
  routes: string[];
  nav: ModuleNavItem[];
  /** Shown to admins only. */
  adminNav?: ModuleNavItem[];
};

export const MODULES: Record<ModuleKey, ModuleDef> = {
  crm: {
    key: "crm",
    name: "SynCRM",
    tagline: "Leads, listings and deals",
    description: "Capture leads, match them to listings, run viewings and close deals with commission tracked.",
    icon: Waypoints,
    accent: "bg-blue-600 text-white",
    homeHref: "/app/dashboard",
    // The CRM predates the Hub and keeps its original routes; it is the
    // fallback module for any /app path not claimed by another.
    routes: [
      "/app/dashboard",
      "/app/leads",
      "/app/contacts",
      "/app/owners",
      "/app/properties",
      "/app/viewings",
      "/app/tasks",
      "/app/reports",
      "/app/admin/stages",
      "/app/admin/lead-scoring",
      "/app/admin/commissions",
    ],
    nav: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { label: "Leads", href: "/app/leads", icon: Waypoints },
      { label: "Contacts", href: "/app/contacts", icon: Users },
      { label: "Owners", href: "/app/owners", icon: KeyRound },
      { label: "Properties", href: "/app/properties", icon: Building2 },
      { label: "Viewings", href: "/app/viewings", icon: FileSignature },
      { label: "Tasks", href: "/app/tasks", icon: ClipboardList },
      { label: "Reports", href: "/app/reports", icon: BarChart3 },
    ],
  },
  stay: {
    key: "stay",
    name: "Sync Stay",
    tagline: "Leases, rent and arrears",
    description: "Manage let properties from lease to landlord statement: rent, receipts, arrears, deposits, maintenance and inspections.",
    icon: Home,
    accent: "bg-emerald-600 text-white",
    homeHref: "/app/stay",
    routes: ["/app/stay"],
    nav: [
      { label: "Dashboard", href: "/app/stay", icon: Gauge },
      { label: "Properties", href: "/app/stay/properties", icon: Building2 },
      { label: "Tenants", href: "/app/stay/tenants", icon: UsersRound },
      { label: "Leases", href: "/app/stay/leases", icon: FileSignature },
      { label: "Payments", href: "/app/stay/payments", icon: Receipt },
      { label: "Arrears", href: "/app/stay/arrears", icon: TriangleAlert },
      { label: "Deposits", href: "/app/stay/deposits", icon: Wallet },
      { label: "Maintenance", href: "/app/stay/maintenance", icon: Wrench },
      { label: "Inspections", href: "/app/stay/inspections", icon: ClipboardCheck },
      { label: "Statements", href: "/app/stay/statements", icon: FileText },
      { label: "Reports", href: "/app/stay/reports", icon: FileBarChart },
    ],
    adminNav: [{ label: "Stay settings", href: "/app/stay/settings", icon: Settings }],
  },
  worth: {
    key: "worth",
    name: "Sync Worth",
    tagline: "Valuations to signed report",
    description: "Log instructions, track every valuation to sign-off, reuse comparables and issue branded reports.",
    icon: Scale,
    accent: "bg-amber-600 text-white",
    homeHref: "/app/worth",
    routes: ["/app/worth"],
    nav: [
      { label: "Dashboard", href: "/app/worth", icon: Gauge },
      { label: "Jobs", href: "/app/worth/jobs", icon: ClipboardList },
      { label: "Comparables", href: "/app/worth/comparables", icon: Landmark },
      { label: "Archive", href: "/app/worth/archive", icon: FileText },
      { label: "Reports", href: "/app/worth/reports", icon: FileBarChart },
    ],
    adminNav: [{ label: "Worth settings", href: "/app/worth/settings", icon: Settings }],
  },
  media: {
    key: "media",
    name: "SyncMedia",
    tagline: "Posts and flyers from listings",
    description: "Turn listings into branded social posts, flyers and banners in your agency's brand kit.",
    icon: Megaphone,
    accent: "bg-fuchsia-600 text-white",
    homeHref: "/app/syncmedia",
    routes: ["/app/syncmedia", "/app/admin/branding"],
    nav: [{ label: "Studio", href: "/app/syncmedia", icon: Megaphone }],
    adminNav: [{ label: "Brand kit", href: "/app/admin/branding", icon: Palette }],
  },
};

export const MODULE_ORDER: ModuleKey[] = ["crm", "stay", "worth", "media"];

/** Modules on the roadmap, shown on the Hub as coming soon. */
export const UPCOMING_MODULES: Array<{ name: string; tagline: string; icon: LucideIcon }> = [
  { name: "Sync Finance", tagline: "Trust accounts, payouts and statements", icon: Coins },
  { name: "Sync Dev", tagline: "Development projects and sales", icon: HardHat },
  { name: "Sync HR", tagline: "People, leave and payroll", icon: ShieldCheck },
];

/** Routes that belong to the Hub itself rather than any module. */
export const HUB_ROUTES = ["/app/hub", "/app/settings", "/app/admin/users", "/app/admin/roles", "/app/admin/logs", "/app/platform", "/app/force-change-password"];

/** The module a path belongs to, or "hub". Unclaimed /app paths are CRM. */
export function moduleForPath(pathname: string): ModuleKey | "hub" {
  if (HUB_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return "hub";
  let best: { key: ModuleKey; len: number } | null = null;
  for (const key of MODULE_ORDER) {
    for (const r of MODULES[key].routes) {
      if ((pathname === r || pathname.startsWith(r + "/")) && (!best || r.length > best.len)) {
        best = { key, len: r.length };
      }
    }
  }
  return best?.key ?? "crm";
}
