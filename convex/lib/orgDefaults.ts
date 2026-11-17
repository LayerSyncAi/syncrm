/**
 * The starting data every organisation needs before its people can work:
 * pipeline stages (a lead cannot be created without them), curated areas,
 * commission split scenarios and, when SyncFinance is on, its settings and
 * categories.
 *
 * Each seeder is idempotent and takes the org explicitly, so the same code
 * serves the org admin's lazy "seed if empty" buttons, self sign-up and the
 * platform onboarding wizard (which seeds a new org up front, so the owner's
 * first sign-in lands in a ready-to-use agency).
 */
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { CURATED_AREA_NAMES } from "./locations";
import { ModuleKey } from "./modules";
import { ensureCategories, ensureSettings as ensureFinanceSettings } from "../finance/core";

export const DEFAULT_PIPELINE_STAGES = [
  {
    name: "New Lead",
    description: "Just entered system, no contact made",
    action: "Call/text/email immediately",
    order: 1,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 10,
  },
  {
    name: "Contacted",
    description: "Had some communication",
    action: "Attempt further contact",
    order: 2,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 20,
  },
  {
    name: "Qualified",
    description: "Has motivation, timeline, expectations",
    action: "Schedule appointment or offer",
    order: 3,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 40,
  },
  {
    name: "Follow-Up",
    description: "Not ready but could convert",
    action: "Drip campaign or reminders",
    order: 4,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 30,
  },
  {
    name: "Offer Made",
    description: "Waiting for response/counter",
    action: "Track and follow up",
    order: 5,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 60,
  },
  {
    name: "Under Contract",
    description: "Accepted, in escrow",
    action: "Coordinate with title company",
    order: 6,
    isTerminal: false,
    terminalOutcome: null,
    winProbability: 85,
  },
  {
    name: "Closed",
    description: "Deal done",
    action: "Request testimonials",
    order: 7,
    isTerminal: true,
    terminalOutcome: "won" as const,
    winProbability: 100,
  },
  {
    name: "Lost",
    description: "Did not convert",
    action: "Log reason, consider re-engaging",
    order: 8,
    isTerminal: true,
    terminalOutcome: "lost" as const,
    winProbability: 0,
  },
];

export const DEFAULT_COMMISSION_CONFIGS = [
  {
    name: "Shared Deal (Default)",
    description: "Property shared between two agents. Agent A holds the property, Agent B closes the deal with their lead.",
    scenario: "shared_deal" as const,
    propertyAgentPercent: 40,
    leadAgentPercent: 40,
    companyPercent: 20,
    isDefault: true,
  },
  {
    name: "Own Property & Own Lead",
    description: "Agent closes a deal using their own property listing and their own lead.",
    scenario: "own_property_own_lead" as const,
    propertyAgentPercent: 0,
    leadAgentPercent: 70,
    companyPercent: 30,
    isDefault: true,
  },
  {
    name: "Company Property",
    description: "Agent brings a lead to a company-listed property (no specific property agent).",
    scenario: "company_property" as const,
    propertyAgentPercent: 0,
    leadAgentPercent: 50,
    companyPercent: 50,
    isDefault: true,
  },
];

/** Insert the default pipeline stages (all of them, unconditionally). */
export async function insertDefaultStages(ctx: MutationCtx, orgId: Id<"organizations">): Promise<void> {
  const timestamp = Date.now();
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    await ctx.db.insert("pipelineStages", { ...stage, orgId, createdAt: timestamp, updatedAt: timestamp });
  }
}

/** Default pipeline stages, only when the org has none. */
export async function seedDefaultStages(ctx: MutationCtx, orgId: Id<"organizations">): Promise<void> {
  const existing = await ctx.db
    .query("pipelineStages")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  await insertDefaultStages(ctx, orgId);
}

/** Curated default areas, only when the org has none. */
export async function seedDefaultLocations(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  createdByUserId: Id<"users">
): Promise<void> {
  const existing = await ctx.db
    .query("locations")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  const timestamp = Date.now();
  for (const name of CURATED_AREA_NAMES) {
    await ctx.db.insert("locations", { name, createdByUserId, orgId, createdAt: timestamp });
  }
}

/** The three default commission scenarios, only when the org has none. */
export async function seedDefaultCommissionConfigs(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  createdByUserId: Id<"users">
): Promise<void> {
  const existing = await ctx.db
    .query("commissionConfigs")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  const timestamp = Date.now();
  for (const config of DEFAULT_COMMISSION_CONFIGS) {
    await ctx.db.insert("commissionConfigs", {
      ...config,
      orgId,
      createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

/**
 * Everything a new organisation starts with. `ownerId` is recorded as the
 * creator of the seeded rows that need one.
 */
export async function seedOrgDefaults(
  ctx: MutationCtx,
  args: { orgId: Id<"organizations">; ownerId: Id<"users">; modules: readonly ModuleKey[] }
): Promise<void> {
  await seedDefaultStages(ctx, args.orgId);
  await seedDefaultLocations(ctx, args.orgId, args.ownerId);
  await seedDefaultCommissionConfigs(ctx, args.orgId, args.ownerId);
  if (args.modules.includes("finance")) {
    await ensureFinanceSettings(ctx, args.orgId);
    await ensureCategories(ctx, args.orgId);
  }
}
