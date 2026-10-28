/**
 * Mobile registry of Sync Estate modules: names, colours, icons and where
 * each one lives in the app. Which modules a user may open comes from the
 * server (api.hub.getContext), exactly as on the website.
 */
import type { ModuleKey } from "../../convex/lib/modules";
import type { IconName } from "../components/ui";

export type { ModuleKey };

export type ModuleDef = {
  key: ModuleKey;
  name: string;
  tagline: string;
  icon: IconName;
  color: string;
  /** Route of the module's home screen. */
  href: string;
};

export const MODULES: Record<ModuleKey, ModuleDef> = {
  crm: { key: "crm", name: "SynCRM", tagline: "Leads, listings and deals", icon: "git-network-outline", color: "#2563eb", href: "/crm" },
  stay: { key: "stay", name: "Sync Stay", tagline: "Leases, rent and arrears", icon: "home-outline", color: "#059669", href: "/stay" },
  worth: { key: "worth", name: "Sync Worth", tagline: "Valuations to signed report", icon: "scale-outline", color: "#d97706", href: "/worth" },
  media: { key: "media", name: "SyncMedia", tagline: "Posts and flyers from listings", icon: "megaphone-outline", color: "#c026d3", href: "/media" },
};

export const MODULE_ORDER: ModuleKey[] = ["crm", "stay", "worth", "media"];

export const UPCOMING: Array<{ name: string; tagline: string; icon: IconName }> = [
  { name: "Sync Finance", tagline: "Trust accounts, payouts and statements", icon: "cash-outline" },
  { name: "Sync Dev", tagline: "Development projects and sales", icon: "construct-outline" },
  { name: "Sync HR", tagline: "People, leave and payroll", icon: "people-outline" },
];
