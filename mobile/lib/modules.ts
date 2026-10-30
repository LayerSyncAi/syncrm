/**
 * Mobile registry of SyncEstate modules: names, product icons and where
 * each one lives in the app. Which modules a user may open comes from the
 * server (api.hub.getContext), exactly as on the website.
 */
import type { ModuleKey } from "../../convex/lib/modules";
import type { ProductIconKey } from "@/lib/product-icon-paths";

export type { ModuleKey };

export type ModuleDef = {
  key: ModuleKey;
  name: string;
  tagline: string;
  /** The product's line icon, shared with the website. */
  product: ProductIconKey;
  /** Route of the module's home screen. */
  href: string;
};

export const MODULES: Record<ModuleKey, ModuleDef> = {
  crm: { key: "crm", name: "SynCRM", tagline: "Leads, listings and deals", product: "crm", href: "/crm" },
  stay: { key: "stay", name: "SyncStay", tagline: "Leases, rent and arrears", product: "stay", href: "/stay" },
  worth: { key: "worth", name: "SyncWorth", tagline: "Valuations to signed report", product: "worth", href: "/worth" },
  finance: { key: "finance", name: "SyncFinance", tagline: "Trust money, payouts and statements", product: "finance", href: "/finance" },
  dev: { key: "dev", name: "SyncDev", tagline: "Developments, stands and sales", product: "dev", href: "/dev" },
  media: { key: "media", name: "SyncMedia", tagline: "Posts and flyers from listings", product: "media", href: "/media" },
};

export const MODULE_ORDER: ModuleKey[] = ["crm", "stay", "worth", "finance", "dev", "media"];

export const UPCOMING: Array<{ name: string; tagline: string; product: ProductIconKey }> = [
  { name: "SyncHR", tagline: "People, leave and payroll", product: "hr" },
];
