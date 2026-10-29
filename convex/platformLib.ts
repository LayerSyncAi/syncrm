/**
 * Dependency-free helpers for the platform (LayerSync staff) module, kept
 * separate from platform.ts so they can be unit-tested without the Convex
 * runtime.
 */

/**
 * Every organisation-scoped table, in the order the purge job empties them.
 * Child/leaf tables go first; `users` must stay LAST because the per-user
 * tables (auth rows, push subscriptions, copilot chats, …) are only reachable
 * through the user id. A unit test checks this list against convex/schema.ts
 * so a new org-scoped table cannot be forgotten.
 */
export const PURGE_TABLE_ORDER = [
  // Sync Stay: children before the leases, units and properties they hang off.
  "stayArrearsNotes",
  "stayDocuments",
  "stayInspections",
  "stayMaintenance",
  "stayExpenses",
  "stayDeposits",
  "stayPayments",
  "stayCharges",
  "stayLeases",
  "stayUnits",
  "stayProperties",
  "staySettings",
  // Sync Finance: lines before the transactions they post, transactions
  // before the invoices, payouts and stands they point at.
  "devPayments",
  "devStands",
  "finLines",
  "finAccountMonths",
  "finReconciliations",
  "finTransactions",
  "finPayouts",
  "finInvoices",
  "finStands",
  "finDevelopments",
  "finImports",
  "finCategories",
  "finAccounts",
  "finSettings",
  // Sync Notify: messages before the campaigns they belong to.
  "notifyMessages",
  "notifyCampaigns",
  "notifySettings",
  // Sync Worth (see convex/schemas/worth.ts).
  "worthJobComparables",
  "worthReports",
  "worthDocuments",
  "worthInspections",
  "worthJobNotes",
  "worthComparables",
  "worthJobs",
  "worthValuerProfiles",
  "worthSettings",
  // Hub
  "notifications",
  "legalAcceptances",
  "leadPropertyMatches",
  "activities",
  "dealCommissions",
  "commissionConfigs",
  "propertyShares",
  "propertyCollaborators",
  "propertyOwners",
  "brochures",
  "orgBranding",
  "viewingForms",
  "documents",
  "marketingExpenses",
  "mergeAudits",
  "leadScoreConfig",
  "leads",
  "contacts",
  "properties",
  "trackedAgencies",
  "locations",
  "pipelineStages",
  "emailLogs",
  "auditLogs",
  // orgId present but reachable only through the org's users:
  "copilotChats",
  "pushSubscriptions",
  "users",
] as const;

export type PurgeTable = (typeof PURGE_TABLE_ORDER)[number];

/** Maximum documents deleted per purge invocation (well under Convex limits). */
export const PURGE_BATCH_SIZE = 200;

/**
 * A brochure photo / branding logo ref is either an absolute URL (not ours to
 * delete) or a Convex storage id. Same rule as branding.ts and syncmedia.ts.
 */
export function isStorageRef(ref: string | undefined | null): ref is string {
  if (!ref) return false;
  return !ref.startsWith("http://") && !ref.startsWith("https://") && !ref.startsWith("/");
}

/** The rateLimits row keys a user can own (see rateLimit.ts: `${action}:${id}`). */
export function rateLimitKeysForUser(userId: string, actions: readonly string[]): string[] {
  return actions.map((action) => `${action}:${userId}`);
}

/** What a platform admin must type to confirm an organisation purge. */
export function purgeConfirmPhrase(slug: string): string {
  return `DELETE ${slug}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** URL-friendly organisation slug from its name (sign-up and platform create). */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
