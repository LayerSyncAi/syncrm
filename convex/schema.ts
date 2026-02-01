import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
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
    order: v.number(),
    isTerminal: v.boolean(),
    terminalOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.null()
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_order", ["order"]),
  leads: defineTable({
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
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preferredAreas: v.array(v.string()),
    notes: v.string(),
    stageId: v.id("pipelineStages"),
    ownerUserId: v.id("users"),
    closedAt: v.optional(v.number()),
    closeReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_stage", ["stageId"])
    .index("by_normalized_phone", ["normalizedPhone"])
    .index("by_name", ["fullName"]),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_location", ["location"])
    .index("by_filters", ["type", "listingType", "status"]),
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
    createdAt: v.number(),
  }).index("by_lead", ["leadId"]),
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
    assignedToUserId: v.id("users"),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_assignee_status", [
    "assignedToUserId",
    "scheduledAt",
    "completedAt",
  ]),
  locations: defineTable({
    name: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_name", ["name"]),
});
