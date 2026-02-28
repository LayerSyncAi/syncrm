import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // Organizations table - each org is a separate tenant
  organizations: defineTable({
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"]),
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom fields
    fullName: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("agent")),
    isActive: v.boolean(),
    orgId: v.optional(v.id("organizations")),
    timezone: v.optional(v.string()), // IANA timezone, e.g. "Africa/Harare"
    resetPasswordOnNextLogin: v.optional(v.boolean()),
    passwordUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_org", ["orgId"]),
  passwordResetTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),
  pipelineStages: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    action: v.optional(v.string()),
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["order"])
    .index("by_org", ["orgId"]),
  leads: defineTable({
    // Link to contact - required for all leads
    contactId: v.id("contacts"),
    // Denormalized from contact for quick access
    fullName: v.string(),
    phone: v.string(),
    normalizedPhone: v.string(),
    email: v.optional(v.string()),
    source: v.union(
      v.literal("walk_in"),
      v.literal("referral"),
      v.literal("facebook"),
      v.literal("whatsapp"),
      v.literal("website"),
      v.literal("property_portal"),
      v.literal("other")
    ),
    interestType: v.union(v.literal("rent"), v.literal("buy")),
    budgetCurrency: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preferredAreas: v.array(v.string()),
    notes: v.string(),
    stageId: v.id("pipelineStages"),
    ownerUserId: v.id("users"),
    closedAt: v.optional(v.number()),
    closeReason: v.optional(v.string()),
    // Deal value when closed
    dealValue: v.optional(v.number()),
    dealCurrency: v.optional(v.string()),
    // Scoring
    score: v.optional(v.number()),
    lastScoredAt: v.optional(v.number()),
    // Denormalized computed fields (maintained on-write for read performance)
    lastActivityAt: v.optional(v.number()),
    activityCount: v.optional(v.number()),
    computedScore: v.optional(v.number()),
    // Merge / archive
    isArchived: v.optional(v.boolean()),
    mergedIntoLeadId: v.optional(v.id("leads")),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_stage", ["stageId"])
    .index("by_contact", ["contactId"])
    .index("by_normalized_phone", ["normalizedPhone"])
    .index("by_name", ["fullName"])
    .index("by_email", ["email"])
    .index("by_org", ["orgId"])
    .searchIndex("search_leads", {
      searchField: "fullName",
      filterFields: ["orgId"],
    }),
  leadScoreConfig: defineTable({
    criteria: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        type: v.union(v.literal("boolean"), v.literal("threshold")),
        weight: v.number(),
        enabled: v.boolean(),
        threshold: v.optional(v.number()),
      })
    ),
    updatedByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"]),
  mergeAudits: defineTable({
    primaryLeadId: v.id("leads"),
    mergedLeadIds: v.array(v.id("leads")),
    fieldResolutions: v.array(
      v.object({
        field: v.string(),
        chosenValue: v.string(),
        sourceLeadId: v.id("leads"),
      })
    ),
    mergedByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    mergedAt: v.number(),
  })
    .index("by_primary", ["primaryLeadId"])
    .index("by_org", ["orgId"]),
  properties: defineTable({
    title: v.string(),
    type: v.union(
      v.literal("house"),
      v.literal("apartment"),
      v.literal("land"),
      v.literal("commercial"),
      v.literal("other")
    ),
    listingType: v.union(v.literal("rent"), v.literal("sale")),
    price: v.number(),
    currency: v.string(),
    location: v.string(),
    area: v.number(),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    status: v.union(
      v.literal("available"),
      v.literal("under_offer"),
      v.literal("let"),
      v.literal("sold"),
      v.literal("off_market")
    ),
    description: v.string(),
    images: v.array(v.string()),
    createdByUserId: v.optional(v.id("users")),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_location", ["location"])
    .index("by_filters", ["type", "listingType", "status"])
    .index("by_org", ["orgId"])
    .index("by_creator", ["createdByUserId"]),
  // Property shares: Agent A shares a property with Agent B (who has a matching lead)
  propertyShares: defineTable({
    propertyId: v.id("properties"),
    leadId: v.id("leads"),
    // Agent A: the property holder who initiates the share
    sharedByUserId: v.id("users"),
    // Agent B: the lead holder who receives the property to close the deal
    sharedWithUserId: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("closed_won"),
      v.literal("closed_lost"),
      v.literal("cancelled")
    ),
    dealValue: v.optional(v.number()),
    dealCurrency: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_property", ["propertyId"])
    .index("by_lead", ["leadId"])
    .index("by_shared_by", ["sharedByUserId"])
    .index("by_shared_with", ["sharedWithUserId"])
    .index("by_org", ["orgId"]),
  // Commission split configuration: admin-defined scenarios
  commissionConfigs: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    // The scenario this config applies to
    scenario: v.union(
      v.literal("shared_deal"),        // Property shared between agents
      v.literal("own_property_own_lead"), // Agent closes own property with own lead
      v.literal("company_property")     // Company-listed property, agent brings lead
    ),
    // Percentage splits (should sum to 100)
    propertyAgentPercent: v.number(),  // Agent A (property holder)
    leadAgentPercent: v.number(),      // Agent B (lead holder / closer)
    companyPercent: v.number(),        // Company cut
    isDefault: v.boolean(),
    orgId: v.optional(v.id("organizations")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scenario", ["scenario"])
    .index("by_org", ["orgId"]),
  // Commission records generated when a deal closes
  dealCommissions: defineTable({
    leadId: v.id("leads"),
    propertyId: v.optional(v.id("properties")),
    propertyShareId: v.optional(v.id("propertyShares")),
    commissionConfigId: v.optional(v.id("commissionConfigs")),
    dealValue: v.number(),
    dealCurrency: v.string(),
    // Agent A (property holder)
    propertyAgentUserId: v.optional(v.id("users")),
    propertyAgentPercent: v.number(),
    propertyAgentAmount: v.number(),
    // Agent B (lead holder / closer)
    leadAgentUserId: v.id("users"),
    leadAgentPercent: v.number(),
    leadAgentAmount: v.number(),
    // Company
    companyPercent: v.number(),
    companyAmount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("paid")
    ),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_lead", ["leadId"])
    .index("by_property_agent", ["propertyAgentUserId"])
    .index("by_lead_agent", ["leadAgentUserId"])
    .index("by_org", ["orgId"]),
  leadPropertyMatches: defineTable({
    leadId: v.id("leads"),
    propertyId: v.id("properties"),
    matchType: v.union(
      v.literal("suggested"),
      v.literal("requested"),
      v.literal("viewed"),
      v.literal("offered")
    ),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_lead", ["leadId"])
    .index("by_org", ["orgId"]),
  activities: defineTable({
    leadId: v.id("leads"),
    type: v.union(
      v.literal("call"),
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("viewing"),
      v.literal("note")
    ),
    title: v.string(),
    description: v.string(),
    scheduledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Task status: todo or completed
    status: v.union(v.literal("todo"), v.literal("completed")),
    // Notes explaining what happened or next steps when completed
    completionNotes: v.optional(v.string()),
    assignedToUserId: v.id("users"),
    createdByUserId: v.id("users"),
    // Precomputed next reminder timestamp for efficient cron queries
    nextReminderAt: v.optional(v.number()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_assignee_status", [
      "assignedToUserId",
      "scheduledAt",
      "completedAt",
    ])
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_lead", ["leadId"])
    .index("by_org", ["orgId"])
    .index("by_next_reminder", ["nextReminderAt"]),
  activityReminders: defineTable({
    activityId: v.optional(v.id("activities")),
    reminderType: v.union(
      v.literal("pre_reminder"),
      v.literal("daily_digest"),
      v.literal("overdue_reminder")
    ),
    userId: v.id("users"),
    sentAt: v.number(),
    digestDate: v.optional(v.string()), // "YYYY-MM-DD" for daily digest dedup
  })
    .index("by_activity_type", ["activityId", "reminderType"])
    .index("by_user_digest", ["userId", "reminderType", "digestDate"]),
  locations: defineTable({
    name: v.string(),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_org", ["orgId"]),
  documents: defineTable({
    name: v.string(),
    folder: v.union(
      v.literal("mandates_to_sell"),
      v.literal("contracts"),
      v.literal("id_copies"),
      v.literal("proof_of_funds"),
      v.literal("lead_documentation")
    ),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(), // bytes
    // Polymorphic owner: exactly one of these should be set
    leadId: v.optional(v.id("leads")),
    propertyId: v.optional(v.id("properties")),
    uploadedByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_lead", ["leadId"])
    .index("by_property", ["propertyId"])
    .index("by_org", ["orgId"]),
  rateLimits: defineTable({
    key: v.string(), // e.g. "leadCreate:<userId>" or "importBulk:<userId>"
    tokens: v.number(),
    lastRefill: v.number(),
  })
    .index("by_key", ["key"]),
  contacts: defineTable({
    name: v.string(),
    phone: v.string(),
    normalizedPhone: v.string(),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Multiple owners can see this contact - agents only see contacts they own
    ownerUserIds: v.array(v.id("users")),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_phone", ["normalizedPhone"])
    .index("by_name", ["name"])
    .index("by_org", ["orgId"]),
});
