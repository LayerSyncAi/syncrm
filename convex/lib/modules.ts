/**
 * Sync Estate modules and the fixed role list.
 *
 * SynCRM is one module in a suite that shares one login, one set of users and
 * one list of contacts and properties (the Hub). An organisation pays for a
 * set of modules (`organizations.enabledModules`); a user reaches a module
 * when the org has it switched on AND their role allows it.
 *
 * Kept dependency-free so the rules can be unit-tested and imported from both
 * Convex functions and the Next.js app.
 */
import { v } from "convex/values";

export const MODULE_KEYS = ["crm", "stay", "worth", "finance", "media"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const moduleKeyValidator = v.union(
  v.literal("crm"),
  v.literal("stay"),
  v.literal("worth"),
  v.literal("finance"),
  v.literal("media")
);

/**
 * Organisations created before the Hub existed have no `enabledModules`.
 * They keep exactly what they had: the CRM and the brochure studio.
 */
export const LEGACY_DEFAULT_MODULES: readonly ModuleKey[] = ["crm", "media"];

/**
 * Fixed role list (BRD Hub §4). `users.role` stays the coarse admin/agent
 * switch; an agent can hold any number of these on top. An admin is the
 * agency director and needs none of them.
 */
export const ESTATE_ROLES = [
  "sales_manager",
  "property_manager",
  "accounts",
  "marketing",
  "valuer",
  "signing_valuer",
  "valuations_admin",
] as const;
export type EstateRole = (typeof ESTATE_ROLES)[number];

export const estateRoleValidator = v.union(
  v.literal("sales_manager"),
  v.literal("property_manager"),
  v.literal("accounts"),
  v.literal("marketing"),
  v.literal("valuer"),
  v.literal("signing_valuer"),
  v.literal("valuations_admin")
);

export const ESTATE_ROLE_LABELS: Record<EstateRole, string> = {
  sales_manager: "Sales manager",
  property_manager: "Property manager",
  accounts: "Accounts",
  marketing: "Marketing",
  valuer: "Valuer",
  signing_valuer: "Signing valuer",
  valuations_admin: "Valuations admin",
};

/** Which roles open which module for a non-admin user. */
const MODULE_ROLES: Record<ModuleKey, readonly EstateRole[] | "everyone"> = {
  // Every existing agent already works in the CRM and the studio; the Hub
  // must not take that away from them.
  crm: "everyone",
  media: "everyone",
  stay: ["property_manager", "accounts"],
  worth: ["valuer", "signing_valuer", "valuations_admin", "accounts"],
  // Sales agents see their own commission statement from the CRM instead.
  finance: ["accounts", "property_manager"],
};

type OrgLike = { enabledModules?: readonly ModuleKey[] | null } | null | undefined;
type UserLike = {
  role: "admin" | "agent";
  estateRoles?: readonly EstateRole[] | null;
};

export function orgModules(org: OrgLike): ModuleKey[] {
  const list = org?.enabledModules ?? LEGACY_DEFAULT_MODULES;
  // Keep registry order regardless of how the list was stored.
  return MODULE_KEYS.filter((k) => list.includes(k));
}

export function hasEstateRole(user: UserLike, role: EstateRole): boolean {
  return !!user.estateRoles?.includes(role);
}

export function userCanUseModule(user: UserLike, org: OrgLike, key: ModuleKey): boolean {
  if (!orgModules(org).includes(key)) return false;
  if (user.role === "admin") return true;
  const allowed = MODULE_ROLES[key];
  if (allowed === "everyone") return true;
  return allowed.some((r) => hasEstateRole(user, r));
}

export function userModules(user: UserLike, org: OrgLike): ModuleKey[] {
  return orgModules(org).filter((k) => userCanUseModule(user, org, k));
}

/**
 * One headline figure on the Hub director dashboard. Each module serves its
 * own list from a `hubSummary` query; the Hub renders them uniformly. Values
 * are pre-formatted on the server because a module may need to show two
 * currencies side by side (USD and ZiG are never converted).
 */
export type HubFigure = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warning";
  href?: string;
};
