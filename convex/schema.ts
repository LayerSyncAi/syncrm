import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { leadSourceValidator } from "./lib/leadSources";
import { activityTypeValidator } from "./lib/activityTypes";
import { estateRoleValidator, moduleKeyValidator, notificationModuleValidator } from "./lib/modules";
import { stayTables } from "./schemas/stay";
import { worthTables } from "./schemas/worth";
import { financeTables } from "./schemas/finance";
import { notifyTables } from "./schemas/notify";
import { devTables } from "./schemas/dev";

export default defineSchema({
  ...authTables,
  // Organizations table - each org is a separate tenant
  organizations: defineTable({
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    // Set when a platform admin starts a purge; the batched delete job then
    // removes every row that belongs to the org and finally the org itself.
    deletingAt: v.optional(v.number()),
    // SyncEstate modules the agency pays for, switched on by LayerSync.
    // Absent on orgs that predate the Hub, which read as CRM + SyncMedia
    // (see convex/lib/modules.ts).
    enabledModules: v.optional(v.array(moduleKeyValidator)),
    // Agency settings shared by every module (receipts, reports, invoices).
    defaultCurrency: v.optional(v.union(v.literal("USD"), v.literal("ZiG"))),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    // Agency branches (HB-02). `id` is stable so a rename keeps every user
    // assigned to the branch; users.branchId points at it.
    branches: v.optional(v.array(v.object({ id: v.string(), name: v.string() }))),
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
    showOnboardingInterface: v.optional(v.boolean()),
    // View-mode preference: a real admin can toggle into "Agent Mode" to see
    // only their own work. Visibility-only — never changes role or permissions.
    agentMode: v.optional(v.boolean()),
    // Platform (LayerSync) staff. A platform admin has NO orgId, so they never
    // appear in any organisation's user list. They can open any organisation
    // in a read-only view by setting platformViewOrgId (see helpers.ts).
    isPlatformAdmin: v.optional(v.boolean()),
    platformViewOrgId: v.optional(v.id("organizations")),
    // SyncEstate roles held on top of admin/agent (convex/lib/modules.ts).
    // They decide which modules an agent can open; admins need none.
    estateRoles: v.optional(v.array(estateRoleValidator)),
    // The agency branch this staff member works from (organizations.branches).
    branchId: v.optional(v.string()),
    // Modules whose notification-centre alerts also arrive by email (HB-61).
    // Absent means in-app only.
    emailAlertModules: v.optional(v.array(notificationModuleValidator)),
    // Landlord and tenant portal accounts. A portal user has NO orgId, so
    // every staff function (getCurrentUserWithOrg) rejects them and they never
    // appear in an organisation's user list. portalOrgId scopes the portal.
    portalKind: v.optional(v.union(v.literal("landlord"), v.literal("tenant"))),
    portalContactId: v.optional(v.id("contacts")),
    portalOrgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_org", ["orgId"])
    .index("by_platform_admin", ["isPlatformAdmin"])
    .index("by_portal_org", ["portalOrgId"])
    .index("by_portal_contact", ["portalContactId"]),
  // Auditable record of a user accepting a versioned legal document at sign-up.
  legalAcceptances: defineTable({
    userId: v.id("users"),
    documentType: v.union(v.literal("privacy"), v.literal("terms")),
    version: v.string(),
    acceptedAt: v.number(),
    orgId: v.optional(v.id("organizations")),
  })
    .index("by_user", ["userId"])
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
    // Expected probability (0–100) that an open lead in this stage will close as won.
    // Drives forecasted / expected pipeline revenue in the reporting module.
    winProbability: v.optional(v.number()),
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
    phone: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    source: leadSourceValidator,
    // Set by the flagLegacyPortalLeads migration on leads still carrying the
    // generic "property_portal" source, so an agent can reassign them to the
    // real platform. Cleared as soon as the source is changed.
    sourceNeedsReview: v.optional(v.boolean()),
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
    // Commercial-specific fields
    commercialType: v.optional(
      v.union(
        v.literal("warehouse"),
        v.literal("office"),
        v.literal("retail_shop"),
        v.literal("industrial"),
        v.literal("mixed_use"),
        v.literal("other")
      )
    ),
    zoning: v.optional(v.string()),
    usageType: v.optional(v.string()),
    status: v.union(
      v.literal("available"),
      v.literal("under_offer"),
      v.literal("let"),
      v.literal("sold"),
      v.literal("off_market")
    ),
    description: v.string(),
    images: v.array(v.string()),
    // Marketing: absolute instant (unix ms, UTC) the property was first listed
    // on the market. Drives the property Marketing tab and days-on-market.
    listedOnMarketAt: v.optional(v.number()),
    isDraft: v.optional(v.boolean()),
    // Ownership model. Drives document/mandate privacy:
    //  - "agent":    owned by a single agent (ownerUserIds has exactly one id)
    //  - "multiple": co-owned by several agents (ownerUserIds has >1 id)
    //  - "company":  no individual agent owner (ownerUserIds is empty); only
    //                admins and explicit collaborators can see private data.
    // Optional so pre-existing rows validate; a migration backfills them.
    ownershipType: v.optional(
      v.union(
        v.literal("agent"),
        v.literal("multiple"),
        v.literal("company")
      )
    ),
    ownerUserIds: v.optional(v.array(v.id("users"))),
    createdByUserId: v.optional(v.id("users")),
    orgId: v.optional(v.id("organizations")),
    pbRefCode: v.optional(v.string()),
    pbSourceUrl: v.optional(v.string()),
    pbAgencySlug: v.optional(v.string()),
    pbLastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_location", ["location"])
    .index("by_filters", ["type", "listingType", "status"])
    .index("by_org", ["orgId"])
    .index("by_creator", ["createdByUserId"])
    .index("by_pb_ref", ["orgId", "pbRefCode"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["orgId"] })
    .searchIndex("search_location", { searchField: "location", filterFields: ["orgId"] }),
  // Explicitly authorised collaborators on a property. A row grants the agent
  // access to the property's private data (documents, mandate info) without
  // making them an owner. Granted by an owner or an admin.
  // NOTE: this is intentionally per-property. If per-document permissions are
  // ever needed, add an optional `folder`/`documentId` column here rather than
  // a new table — the access helpers already funnel through one check.
  propertyCollaborators: defineTable({
    propertyId: v.id("properties"),
    agentId: v.id("users"),
    grantedByUserId: v.id("users"),
    grantedAt: v.number(),
    orgId: v.optional(v.id("organizations")),
  })
    .index("by_property", ["propertyId"])
    .index("by_agent", ["agentId"])
    .index("by_property_agent", ["propertyId", "agentId"])
    .index("by_org", ["orgId"]),
  // Propertybook.co.zw agencies that an org "follows" for scheduled daily refresh
  trackedAgencies: defineTable({
    slug: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
    orgId: v.id("organizations"),
    addedByUserId: v.id("users"),
    isActive: v.boolean(),
    lastRefreshAt: v.optional(v.number()),
    lastRefreshStatus: v.optional(
      v.union(v.literal("ok"), v.literal("error"))
    ),
    lastRefreshError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_slug", ["orgId", "slug"])
    .index("by_active", ["isActive"]),
  // Cached scrapes from propertybook.co.zw (e.g. agency directory).
  // Keyed by an opaque string; payload is a JSON-encoded blob with a TTL.
  propertyBookCache: defineTable({
    key: v.string(),
    payload: v.string(),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),
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
    // Gross commission earned on the deal: dealValue * commissionRate.
    // The split percentages below are shares of this commission pool (they sum
    // to 100% of the commission, not of the sale value). Optional for records
    // created before this field existed.
    commissionRate: v.optional(v.number()),
    commissionAmount: v.optional(v.number()),
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
    leadId: v.optional(v.id("leads")),
    // Optional links giving a task its context, so completed work reads as an
    // activity log ("viewing at 12 Oak Ave for the Moyo lead") rather than a
    // bare title. All optional: a task can stand alone.
    propertyId: v.optional(v.id("properties")),
    contactId: v.optional(v.id("contacts")),
    type: activityTypeValidator,
    title: v.string(),
    description: v.string(),
    scheduledAt: v.optional(v.number()),
    // IANA timezone the scheduledAt was picked in (e.g. "Africa/Harare").
    // scheduledAt is an absolute UTC instant, so reminders format it back into
    // this zone to show the exact local "starts at" time the user chose —
    // independent of the recipient's (possibly unset) profile timezone.
    scheduledTimezone: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    // Task status: todo or completed
    status: v.union(v.literal("todo"), v.literal("completed")),
    // Notes explaining what happened or next steps when completed
    completionNotes: v.optional(v.string()),
    assignedToUserId: v.id("users"),
    createdByUserId: v.id("users"),
    // Precomputed next reminder timestamp for efficient cron queries.
    // Equals scheduledAt - 1h; this is the reminder's "due at" instant.
    nextReminderAt: v.optional(v.number()),
    // Absolute instant (unix ms, UTC) the 1-hour-before reminder was sent.
    // Idempotency marker for the pre-reminder job — unset means not yet sent.
    reminderSentAt: v.optional(v.number()),
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
    .index("by_property", ["propertyId"])
    .index("by_contact", ["contactId"])
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
    contactId: v.optional(v.id("contacts")),
    uploadedByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_lead", ["leadId"])
    .index("by_property", ["propertyId"])
    .index("by_contact", ["contactId"])
    .index("by_org", ["orgId"]),
  rateLimits: defineTable({
    key: v.string(), // e.g. "leadCreate:<userId>" or "importBulk:<userId>"
    tokens: v.number(),
    lastRefill: v.number(),
  })
    .index("by_key", ["key"]),
  copilotChats: defineTable({
    chatId: v.string(),
    userId: v.id("users"),
    orgId: v.id("organizations"),
    title: v.string(),
    messages: v.array(v.any()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_chat_id", ["chatId"]),
  // Audit log: records user actions (logins, admin operations, key mutations).
  auditLogs: defineTable({
    // The user who performed the action. Null for system / unauthenticated events.
    actorUserId: v.optional(v.id("users")),
    // Human-readable cached name/email for the actor (denormalized for log readability
    // even if the user is later deleted/renamed).
    actorLabel: v.optional(v.string()),
    // Machine-readable action key, e.g. "user.create", "user.role_change",
    // "user.password_reset", "user.login", "lead.create", "lead.merge".
    action: v.string(),
    // Optional category for filtering: "auth", "user", "lead", "property",
    // "email", "system", "other".
    category: v.union(
      v.literal("auth"),
      v.literal("user"),
      v.literal("lead"),
      v.literal("property"),
      v.literal("email"),
      v.literal("system"),
      v.literal("stay"),
      v.literal("worth"),
      v.literal("finance"),
      v.literal("dev"),
      v.literal("other")
    ),
    // Optional polymorphic target reference, e.g. the user/lead/property acted on.
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    // Short human-readable description for the log UI.
    description: v.string(),
    // Arbitrary metadata (JSON-stringified to avoid schema churn).
    metadata: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_org_created", ["orgId", "createdAt"])
    .index("by_actor", ["actorUserId"])
    .index("by_category", ["category"])
    .index("by_action", ["action"]),
  // Email log: one row per email send attempt (including dev-mode and failures).
  emailLogs: defineTable({
    to: v.string(),
    from: v.string(),
    subject: v.string(),
    // Logical email kind, e.g. "password_reset", "activity_pre_reminder",
    // "activity_overdue_reminder", "daily_digest", "other".
    kind: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("dev_logged")
    ),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    // Optional triggering user (e.g. the recipient or the admin who caused the send).
    triggeredByUserId: v.optional(v.id("users")),
    triggeredByLabel: v.optional(v.string()),
    // Optional related record (activity, lead, etc.)
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_org_created", ["orgId", "createdAt"])
    .index("by_to", ["to"])
    .index("by_kind", ["kind"])
    .index("by_status", ["status"]),
  contacts: defineTable({
    name: v.string(),
    // SyncFinance: this landlord's default management commission %, applied
    // to their properties; a property or lease can still differ (FN-30).
    landlordFeePct: v.optional(v.number()),
    phone: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    preferredAreas: v.optional(v.array(v.string())),
    // Property preferences (linked to contact, not lead — survives lead closure)
    interestType: v.optional(v.union(v.literal("rent"), v.literal("buy"))),
    budgetCurrency: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preferredPropertyTypes: v.optional(
      v.array(
        v.union(
          v.literal("house"),
          v.literal("apartment"),
          v.literal("land"),
          v.literal("commercial"),
          v.literal("other")
        )
      )
    ),
    minBedrooms: v.optional(v.number()),
    minBathrooms: v.optional(v.number()),
    // --- Roles -------------------------------------------------------------
    // A person can be a buyer/tenant, a property owner (seller/landlord), or
    // both — the same human often is. Storing this as two role flags on one
    // contact keeps a single record per person, so phone dedupe, agent
    // assignment and the activity timeline work across both sides of the
    // business instead of being duplicated.
    //
    // `ownerType` set  => appears in Owners (/app/owners).
    // `isBuyerTenant`  => appears in Contacts. Legacy rows predate the field
    //                     and are undefined, which MUST read as true; the
    //                     backfillContactRoles migration makes that explicit.
    ownerType: v.optional(
      v.union(v.literal("seller"), v.literal("landlord"), v.literal("both"))
    ),
    isBuyerTenant: v.optional(v.boolean()),
    // Hub tags used by the other modules. `isLeaseTenant` marks a tenant on a
    // SyncStay lease (isBuyerTenant above is a CRM rental prospect);
    // `isValuationClient` marks a SyncWorth instructing party.
    isLeaseTenant: v.optional(v.boolean()),
    isValuationClient: v.optional(v.boolean()),
    // A supplier or contractor the agency pays (HB-30).
    isSupplier: v.optional(v.boolean()),
    entityKind: v.optional(v.union(v.literal("individual"), v.literal("company"))),
    idNumber: v.optional(v.string()),
    // Payout details for landlords.
    bankDetails: v.optional(
      v.object({
        bankName: v.optional(v.string()),
        accountName: v.optional(v.string()),
        accountNumber: v.optional(v.string()),
        branch: v.optional(v.string()),
      })
    ),
    // Multiple owners can see this contact - agents only see contacts they own
    // (NB: "owner" here means the assigned agent, not the property owner above)
    ownerUserIds: v.array(v.id("users")),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_phone", ["normalizedPhone"])
    .index("by_name", ["name"])
    .index("by_org", ["orgId"])
    .index("by_org_owner_type", ["orgId", "ownerType"])
    .index("by_org_lease_tenant", ["orgId", "isLeaseTenant"])
    .index("by_org_valuation_client", ["orgId", "isValuationClient"])
    .index("by_org_supplier", ["orgId", "isSupplier"])
    .index("by_org_email", ["orgId", "email"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["orgId"] }),
  // Links a property to the client who owns it (its seller or landlord), as
  // distinct from `properties.ownerUserIds`, which is the agent who owns the
  // record. A property can have several owners (joint sellers) and an owner can
  // hold several properties, so this is a join table — same shape as
  // propertyCollaborators above.
  propertyOwners: defineTable({
    propertyId: v.id("properties"),
    contactId: v.id("contacts"),
    // The role in THIS relationship. An owner whose contact-level ownerType is
    // "both" is still either selling or letting a given property.
    role: v.union(v.literal("seller"), v.literal("landlord")),
    linkedByUserId: v.id("users"),
    linkedAt: v.number(),
    orgId: v.optional(v.id("organizations")),
  })
    .index("by_property", ["propertyId"])
    .index("by_contact", ["contactId"])
    .index("by_property_contact", ["propertyId", "contactId"])
    .index("by_org", ["orgId"]),
  // Web Push (PWA) subscriptions. One row per browser/device endpoint a user
  // has granted notification permission on. A user can have many (phone,
  // laptop, etc.). Pruned automatically when the push service returns 404/410
  // (subscription expired/unsubscribed).
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    // The unique push service endpoint URL — the natural key for a subscription.
    endpoint: v.string(),
    // Encryption keys from the browser's PushSubscription (base64url).
    p256dh: v.string(),
    auth: v.string(),
    // Best-effort device label for the settings UI / debugging.
    userAgent: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),
  // Expo push tokens for the Android and iOS app, one per installed device.
  // Kept apart from pushSubscriptions (browser Web Push), which has a different
  // shape. No orgId: rows are reached and purged through their user.
  expoPushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
  // Marketing spend records, used by the reporting module for property ROI and
  // per-channel return-on-ad-spend. Spend can be attributed to a specific property
  // (propertyId set) or to a channel generally (propertyId unset).
  marketingExpenses: defineTable({
    propertyId: v.optional(v.id("properties")),
    // Channel string aligns with lead `source` values where applicable
    // (e.g. "facebook", "instagram", "tiktok", "property_portal", "other").
    channel: v.string(),
    amount: v.number(),
    currency: v.string(),
    spentAt: v.number(),
    note: v.optional(v.string()),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_property", ["propertyId"]),
  viewingForms: defineTable({
    // Links back to CRM records — all optional so a form can be raised ad-hoc
    // and later associated, and so it can attach to several records at once.
    propertyId: v.optional(v.id("properties")),
    contactId: v.optional(v.id("contacts")),
    leadId: v.optional(v.id("leads")),
    // The property negotiator / agent who conducted the viewing.
    agentUserId: v.id("users"),
    // Form fields (mirroring the physical viewing form template)
    viewingDate: v.string(), // "YYYY-MM-DD"
    viewingTime: v.optional(v.string()), // "HH:mm"
    propertyAddress: v.string(),
    clientName: v.string(),
    clientCompany: v.optional(v.string()),
    clientIdNumber: v.optional(v.string()),
    clientSpouseName: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    // Signatures — stored as PNG images in file storage.
    clientSignatureId: v.optional(v.id("_storage")),
    negotiatorName: v.string(),
    negotiatorSignatureId: v.optional(v.id("_storage")),
    // Seller / caretaker who was present (optional).
    sellerName: v.optional(v.string()),
    sellerSignatureId: v.optional(v.id("_storage")),
    // draft: still being completed. completed: signed and locked for audit.
    status: v.union(v.literal("draft"), v.literal("completed")),
    completedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_property", ["propertyId"])
    .index("by_contact", ["contactId"])
    .index("by_lead", ["leadId"])
    .index("by_agent", ["agentUserId"])
    .index("by_org", ["orgId"]),

  // --- SyncMedia -----------------------------------------------------------
  // The organisation's marketing brand kit: one row per org, edited by admins
  // and read by every agent's brochures. Distinct from src/config/brand.ts,
  // which white-labels the *app* at build time — this is per-tenant data that
  // an admin can change without a redeploy.
  orgBranding: defineTable({
    orgId: v.id("organizations"),
    // A Convex storage id or an absolute https URL, the same convention the
    // brochure photos use, so one resolver handles both.
    logoRef: v.optional(v.string()),
    // Optional light-on-dark variant, used where the logo sits on the accent.
    logoOnDarkRef: v.optional(v.string()),
    // The admin picks an accent and a paper style; the remaining six theme
    // tokens are derived from those two (see src/lib/syncmedia/theme.ts).
    // Asking anyone for eight hex codes is a form nobody completes.
    accent: v.optional(v.string()),
    pageStyle: v.optional(
      v.union(v.literal("light"), v.literal("cream"), v.literal("dark"))
    ),
    // Defaults offered to agents in the studio; each brochure still carries its
    // own copy, so changing these never rewrites brochures already made.
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    website: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  // Brochure drafts. Private to the agent who made them: every read scopes to
  // (orgId, ownerUserId), so no id from the client can reach another agent's row.
  brochures: defineTable({
    orgId: v.id("organizations"),
    ownerUserId: v.id("users"),
    // Absent when the brochure is for a property that isn't on the system yet.
    propertyId: v.optional(v.id("properties")),
    // Plain strings rather than unions: these name entries in a frontend
    // presentation registry that churns faster than the database, and every
    // lookup falls back to a default, so an unknown value is ignored on read
    // rather than being a schema migration.
    formatKey: v.string(),
    templateId: v.string(),
    themeId: v.string(),
    // Refs only — a storage id or an absolute URL, never a resolved display URL.
    photos: v.array(v.string()),
    eyebrow: v.string(),
    title: v.string(),
    location: v.string(),
    price: v.string(),
    priceLabel: v.string(),
    features: v.array(v.string()),
    reference: v.string(),
    agentName: v.string(),
    agentPhone: v.string(),
    agentEmail: v.string(),
    showLogo: v.boolean(),
    whatsappContact: v.boolean(),
    // Manual position tweaks on top of the template's automatic layout, one
    // entry per adjusted block. `format` is part of the key because the same
    // block needs different corrections on a 1080x1350 post and a 1200x630
    // banner. Empty for any brochure nobody has hand-adjusted, which is most.
    nudges: v.optional(
      v.array(
        v.object({
          format: v.string(),
          slot: v.string(),
          x: v.number(),
          y: v.number(),
        })
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_owner", ["orgId", "ownerUserId"])
    .index("by_owner_property", ["ownerUserId", "propertyId"]),

  // --- SyncEstate Hub -----------------------------------------------------
  // Notification centre. Every module posts alerts here (convex/lib/notify.ts);
  // the topbar bell shows the unread count.
  notifications: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    module: notificationModuleValidator,
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    // In-app link to the record the alert is about.
    href: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_read", ["userId", "readAt"]),

  ...stayTables,
  ...worthTables,
  ...financeTables,
  ...notifyTables,
  ...devTables,
});
