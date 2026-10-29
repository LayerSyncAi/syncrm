/**
 * Sync Stay tables: property management, from lease to landlord statement.
 *
 * Stay reads the Hub's shared records rather than keeping its own copies:
 *  - a landlord or tenant is a `contacts` row (landlords via `ownerType`,
 *    tenants via `isLeaseTenant`),
 *  - a building is a `properties` row; `stayProperties` is the management
 *    agreement on top of it (landlord, manager, fee).
 *
 * Money rules (BRD Stay §7):
 *  - every amount carries its currency, and a lease's charges, payments and
 *    balances stay in the lease's currency. No conversion between USD and ZiG.
 *  - financial rows are never hard-deleted. Payments are reversed, charges
 *    are cancelled.
 *
 * Dates a person picks (lease start, due date, payment date) are stored as
 * "YYYY-MM-DD" strings so they never shift with a timezone. Instants the
 * system records (createdAt, completedAt) are unix ms.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const stayCurrency = v.union(v.literal("USD"), v.literal("ZiG"));

export const stayTables = {
  // The management agreement for one Hub property.
  stayProperties: defineTable({
    orgId: v.id("organizations"),
    propertyId: v.id("properties"),
    landlordContactId: v.id("contacts"),
    managerUserId: v.optional(v.id("users")),
    kind: v.union(v.literal("residential"), v.literal("commercial")),
    // Percentage of rent collected, e.g. 10 for 10%.
    managementFeePct: v.number(),
    // Repairs costing more than this need the landlord's approval in the
    // portal before work starts. Absent = no approval needed.
    repairApprovalThreshold: v.optional(v.number()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_property", ["propertyId"])
    .index("by_org_manager", ["orgId", "managerUserId"])
    .index("by_landlord", ["landlordContactId"]),

  // A lettable unit. A house is a property with one unit.
  stayUnits: defineTable({
    orgId: v.id("organizations"),
    stayPropertyId: v.id("stayProperties"),
    label: v.string(),
    bedrooms: v.optional(v.number()),
    status: v.union(v.literal("vacant"), v.literal("occupied"), v.literal("notice")),
    // Room checklist used by inspections, editable per unit.
    rooms: v.array(v.string()),
    inspectionIntervalMonths: v.optional(v.number()),
    nextInspectionDue: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_stay_property", ["stayPropertyId"]),

  stayLeases: defineTable({
    orgId: v.id("organizations"),
    unitId: v.id("stayUnits"),
    stayPropertyId: v.id("stayProperties"),
    tenantContactId: v.id("contacts"),
    // Denormalised from the property so arrears and lists filter without a join.
    landlordContactId: v.id("contacts"),
    managerUserId: v.optional(v.id("users")),
    startDate: v.string(),
    endDate: v.string(),
    rentAmount: v.number(),
    currency: stayCurrency,
    // Day of the month rent falls due, 1 to 28.
    dueDay: v.number(),
    depositAmount: v.number(),
    // Sync Finance: management fee % for this lease when it differs from the
    // property's (BRD Finance FN-30). Absent = the property's rate.
    managementFeePct: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("ended"), v.literal("renewed")),
    noticeGivenOn: v.optional(v.string()),
    moveOutDate: v.optional(v.string()),
    endReason: v.optional(v.string()),
    renewedFromLeaseId: v.optional(v.id("stayLeases")),
    renewedToLeaseId: v.optional(v.id("stayLeases")),
    // Planned annual increase, applied by the daily job on its date.
    rentIncrease: v.optional(
      v.object({
        effectiveDate: v.string(),
        newRent: v.number(),
        appliedAt: v.optional(v.number()),
      })
    ),
    // Overpayments waiting to be applied to the next charge.
    creditBalance: v.optional(v.number()),
    // Expiry alerts already sent, by days-before (60, 30).
    expiryAlertsSent: v.optional(v.array(v.number())),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_unit", ["unitId"])
    .index("by_tenant", ["tenantContactId"])
    .index("by_landlord", ["landlordContactId"])
    .index("by_stay_property", ["stayPropertyId"])
    .index("by_org_manager", ["orgId", "managerUserId"]),

  stayCharges: defineTable({
    orgId: v.id("organizations"),
    leaseId: v.id("stayLeases"),
    tenantContactId: v.id("contacts"),
    stayPropertyId: v.id("stayProperties"),
    kind: v.union(
      v.literal("rent"),
      v.literal("admin_fee"),
      v.literal("damage"),
      v.literal("late_fee"),
      v.literal("utilities"),
      v.literal("other")
    ),
    description: v.string(),
    amount: v.number(),
    currency: stayCurrency,
    // "YYYY-MM" for rent; makes the monthly job idempotent.
    period: v.optional(v.string()),
    dueDate: v.string(),
    amountPaid: v.number(),
    status: v.union(
      v.literal("unpaid"),
      v.literal("part_paid"),
      v.literal("paid"),
      v.literal("cancelled")
    ),
    invoiceEmailedAt: v.optional(v.number()),
    // Reminder intervals already sent, by days-overdue (3, 7, 14).
    remindersSent: v.optional(v.array(v.number())),
    // Parts of amountPaid that came from lease credit and from the deposit,
    // so a payment reversal can unwind credit that was already used.
    creditApplied: v.optional(v.number()),
    depositApplied: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_lease", ["leaseId"])
    .index("by_lease_period", ["leaseId", "period"])
    .index("by_org_due", ["orgId", "dueDate"]),

  stayPayments: defineTable({
    orgId: v.id("organizations"),
    leaseId: v.id("stayLeases"),
    tenantContactId: v.id("contacts"),
    stayPropertyId: v.id("stayProperties"),
    purpose: v.union(v.literal("rent"), v.literal("deposit")),
    receiptNumber: v.string(),
    paidOn: v.string(),
    amount: v.number(),
    currency: stayCurrency,
    method: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("mobile_money"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    allocations: v.array(v.object({ chargeId: v.id("stayCharges"), amount: v.number() })),
    // The part of this payment that became lease credit.
    creditAdded: v.number(),
    reversedAt: v.optional(v.number()),
    reversedByUserId: v.optional(v.id("users")),
    reverseReason: v.optional(v.string()),
    emailedAt: v.optional(v.number()),
    recordedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_paid", ["orgId", "paidOn"])
    .index("by_lease", ["leaseId"]),

  // One per lease. Held separately from rent; movements are the audit trail.
  stayDeposits: defineTable({
    orgId: v.id("organizations"),
    leaseId: v.id("stayLeases"),
    stayPropertyId: v.id("stayProperties"),
    currency: stayCurrency,
    amountExpected: v.number(),
    amountReceived: v.number(),
    amountApplied: v.number(),
    amountRefunded: v.number(),
    heldIn: v.union(v.literal("trust"), v.literal("business"), v.literal("landlord")),
    status: v.union(v.literal("pending"), v.literal("held"), v.literal("settled")),
    movements: v.array(
      v.object({
        kind: v.union(v.literal("received"), v.literal("applied"), v.literal("refunded")),
        amount: v.number(),
        date: v.string(),
        note: v.optional(v.string()),
        paymentId: v.optional(v.id("stayPayments")),
        chargeId: v.optional(v.id("stayCharges")),
        byUserId: v.id("users"),
        at: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_lease", ["leaseId"]),

  // Repair and other property costs, deducted on the landlord statement.
  stayExpenses: defineTable({
    orgId: v.id("organizations"),
    stayPropertyId: v.id("stayProperties"),
    unitId: v.optional(v.id("stayUnits")),
    maintenanceId: v.optional(v.id("stayMaintenance")),
    date: v.string(),
    description: v.string(),
    amount: v.number(),
    currency: stayCurrency,
    supplier: v.optional(v.string()),
    rechargeToLandlord: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_stay_property", ["stayPropertyId"]),

  stayArrearsNotes: defineTable({
    orgId: v.id("organizations"),
    leaseId: v.id("stayLeases"),
    note: v.string(),
    promiseDate: v.optional(v.string()),
    promiseAmount: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_lease", ["leaseId"]),

  stayMaintenance: defineTable({
    orgId: v.id("organizations"),
    stayPropertyId: v.id("stayProperties"),
    unitId: v.id("stayUnits"),
    leaseId: v.optional(v.id("stayLeases")),
    raisedVia: v.union(v.literal("staff"), v.literal("tenant_portal"), v.literal("inspection")),
    // A staff user, or the tenant's portal user.
    raisedByUserId: v.id("users"),
    title: v.string(),
    description: v.string(),
    photos: v.array(v.id("_storage")),
    status: v.union(v.literal("new"), v.literal("in_progress"), v.literal("done")),
    assigneeUserId: v.optional(v.id("users")),
    cost: v.optional(v.number()),
    currency: v.optional(stayCurrency),
    expenseId: v.optional(v.id("stayExpenses")),
    inspectionId: v.optional(v.id("stayInspections")),
    landlordApproval: v.optional(
      v.object({
        status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
        at: v.optional(v.number()),
        note: v.optional(v.string()),
      })
    ),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_unit", ["unitId"])
    .index("by_lease", ["leaseId"])
    .index("by_stay_property", ["stayPropertyId"]),

  stayInspections: defineTable({
    orgId: v.id("organizations"),
    stayPropertyId: v.id("stayProperties"),
    unitId: v.id("stayUnits"),
    leaseId: v.optional(v.id("stayLeases")),
    type: v.union(v.literal("move_in"), v.literal("routine"), v.literal("move_out")),
    date: v.string(),
    inspectorUserId: v.id("users"),
    rooms: v.array(
      v.object({
        name: v.string(),
        condition: v.optional(
          v.union(v.literal("good"), v.literal("fair"), v.literal("poor"), v.literal("damaged"))
        ),
        note: v.optional(v.string()),
        photos: v.array(v.id("_storage")),
      })
    ),
    meterReadings: v.optional(
      v.object({ water: v.optional(v.string()), electricity: v.optional(v.string()) })
    ),
    comments: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("completed")),
    completedAt: v.optional(v.number()),
    // Once completed the report is locked; later remarks are dated addenda.
    addenda: v.array(v.object({ note: v.string(), at: v.number(), byUserId: v.id("users") })),
    tenantAck: v.optional(v.object({ at: v.number(), comment: v.optional(v.string()) })),
    sentToLandlordAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_unit", ["unitId"])
    .index("by_lease", ["leaseId"]),

  // Files on a Stay property, unit or lease.
  stayDocuments: defineTable({
    orgId: v.id("organizations"),
    stayPropertyId: v.id("stayProperties"),
    unitId: v.optional(v.id("stayUnits")),
    leaseId: v.optional(v.id("stayLeases")),
    name: v.string(),
    kind: v.union(
      v.literal("lease"),
      v.literal("id_copy"),
      v.literal("inspection"),
      v.literal("statement"),
      v.literal("other")
    ),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    visibleToTenant: v.boolean(),
    visibleToLandlord: v.boolean(),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_lease", ["leaseId"])
    .index("by_stay_property", ["stayPropertyId"]),

  // One row per org. Also holds the receipt counter, so receipt numbers are
  // allocated inside the same transaction as the payment.
  staySettings: defineTable({
    orgId: v.id("organizations"),
    invoiceLeadDays: v.number(),
    reminderDays: v.array(v.number()),
    expiryAlertDays: v.array(v.number()),
    receiptPrefix: v.string(),
    nextReceiptSeq: v.number(),
    // IANA zone for "today" in the daily job. Absent = Africa/Harare.
    timezone: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),
};
