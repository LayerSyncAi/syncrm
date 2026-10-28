/**
 * Sync Worth tables: valuations, from instruction to signed report.
 *
 * Worth reads the Hub's shared records rather than keeping its own copies:
 *  - the instructing party (bank, owner, lawyer...) is a `contacts` row
 *    tagged `isValuationClient`,
 *  - the property valued is a `properties` row.
 *
 * Rules (BRD Worth §3, §9):
 *  - every value and fee carries its currency (USD or ZiG), never converted.
 *  - an issued report is locked. A correction reopens the job as a new
 *    numbered version; each issued version is kept in `worthReports`.
 *  - everything the v2 AI will learn from is stored as structured fields:
 *    inspection details, comparables with the valuer's adjustments, and the
 *    final signed values and dates on every job.
 *
 * Dates a person picks (received, due, inspection) are "YYYY-MM-DD" strings so
 * they never shift with a timezone. Instants the system records are unix ms.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const worthCurrency = v.union(v.literal("USD"), v.literal("ZiG"));

export const worthStatus = v.union(
  v.literal("new"),
  v.literal("assigned"),
  v.literal("inspected"),
  v.literal("draft"),
  v.literal("in_review"),
  v.literal("issued"),
  v.literal("on_hold"),
  v.literal("cancelled")
);

export const worthPartyType = v.union(
  v.literal("bank"),
  v.literal("owner"),
  v.literal("buyer"),
  v.literal("lawyer"),
  v.literal("other")
);

export const worthPurpose = v.union(
  v.literal("bank_lending"),
  v.literal("sale_purchase"),
  v.literal("insurance"),
  v.literal("rental"),
  v.literal("estate"),
  v.literal("other")
);

export const worthPropertyClass = v.union(
  v.literal("residential"),
  v.literal("commercial"),
  v.literal("vacant_land")
);

export const worthMethod = v.union(v.literal("comparison"), v.literal("income"), v.literal("cost"));

const money = v.object({ amount: v.number(), currency: worthCurrency });

/** The four values a purpose can need (VW-40). Rental is per month. */
export const worthValues = v.object({
  market: v.optional(money),
  forcedSale: v.optional(money),
  insurance: v.optional(money),
  rental: v.optional(money),
});

/** Calculator inputs kept with the job (VW-42), so workings can be rebuilt. */
export const worthCalculations = v.object({
  comparison: v.optional(
    v.object({
      basis: v.union(v.literal("building"), v.literal("land")),
      subjectAreaM2: v.number(),
      averageRateM2: v.number(),
      result: v.number(),
    })
  ),
  income: v.optional(
    v.object({
      monthlyRent: v.number(),
      annualOutgoings: v.number(),
      yieldPct: v.number(),
      result: v.number(),
    })
  ),
  cost: v.optional(
    v.object({
      landValue: v.number(),
      buildings: v.array(v.object({ name: v.string(), areaM2: v.number(), rateM2: v.number() })),
      depreciationPct: v.number(),
      externalWorks: v.number(),
      result: v.number(),
    })
  ),
});

export const worthNarrative = v.object({
  location: v.optional(v.string()),
  description: v.optional(v.string()),
  market: v.optional(v.string()),
});

export const worthTables = {
  // One valuation instruction, tracked from log to signed report.
  worthJobs: defineTable({
    orgId: v.id("organizations"),
    // VAL-YYYY-NNNN, allocated from worthSettings in the creating mutation.
    reference: v.string(),
    clientContactId: v.id("contacts"),
    partyType: worthPartyType,
    contactPerson: v.optional(v.string()),
    purpose: worthPurpose,
    purposeNote: v.optional(v.string()),
    propertyId: v.id("properties"),
    propertyClass: worthPropertyClass,
    // Denormalised for lists and archive search without a join.
    clientName: v.string(),
    propertyAddress: v.string(),
    suburb: v.string(),
    fee: v.number(),
    currency: worthCurrency,
    receivedDate: v.string(),
    dueDate: v.string(),
    status: worthStatus,
    // Where a job on hold goes back to when resumed.
    statusBeforeHold: v.optional(worthStatus),
    holdReason: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    // Every status change, for the turnaround report (time at each stage).
    statusLog: v.array(v.object({ status: worthStatus, at: v.number(), byUserId: v.optional(v.id("users")) })),
    assignedValuerId: v.optional(v.id("users")),
    // Values and workings (VW-40..43). The report reads these, never free text.
    values: worthValues,
    methods: v.array(worthMethod),
    workings: v.optional(v.string()),
    calculations: v.optional(worthCalculations),
    narrative: worthNarrative,
    reportForm: v.union(v.literal("standard"), v.literal("short")),
    // Review (VW-60). The latest return comment stays visible until resubmitted.
    submittedAt: v.optional(v.number()),
    returnComment: v.optional(v.string()),
    // Version being worked on; 1 until the first correction.
    version: v.number(),
    correctionReason: v.optional(v.string()),
    // Set on issue; the issued version's row is in worthReports.
    issuedAt: v.optional(v.number()),
    issuedDate: v.optional(v.string()),
    preparedByUserId: v.optional(v.id("users")),
    signedByUserId: v.optional(v.id("users")),
    currentReportId: v.optional(v.id("worthReports")),
    // Fee invoice without Sync Finance (VW-71).
    invoicedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    // Due-date alert already sent for the current due date (VW-12).
    dueAlert: v.optional(v.union(v.literal("due_soon"), v.literal("overdue"))),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_valuer", ["orgId", "assignedValuerId"])
    .index("by_org_received", ["orgId", "receivedDate"])
    .index("by_status_due", ["status", "dueDate"])
    .index("by_property", ["propertyId"])
    .index("by_client", ["clientContactId"]),

  // Notes and activity log per job (VW-13). System rows record status changes.
  worthJobNotes: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    kind: v.union(
      v.literal("note"),
      v.literal("call"),
      v.literal("client_query"),
      v.literal("access"),
      v.literal("system")
    ),
    body: v.string(),
    byUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"]),

  // One inspection per job, filled in on a phone (VW-20..22).
  worthInspections: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    inspectionDate: v.optional(v.string()),
    attendees: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    construction: v.object({
      walls: v.optional(v.string()),
      roof: v.optional(v.string()),
      floors: v.optional(v.string()),
      ceilings: v.optional(v.string()),
      windows: v.optional(v.string()),
      yearBuilt: v.optional(v.number()),
      storeys: v.optional(v.number()),
    }),
    condition: v.optional(
      v.union(v.literal("excellent"), v.literal("good"), v.literal("fair"), v.literal("poor"))
    ),
    accommodation: v.object({
      bedrooms: v.optional(v.number()),
      bathrooms: v.optional(v.number()),
      ensuites: v.optional(v.number()),
      lounges: v.optional(v.number()),
      diningRooms: v.optional(v.number()),
      kitchens: v.optional(v.number()),
      studies: v.optional(v.number()),
      garages: v.optional(v.number()),
      carports: v.optional(v.number()),
      staffQuarters: v.optional(v.number()),
      other: v.optional(v.string()),
    }),
    services: v.object({
      municipalWater: v.optional(v.boolean()),
      borehole: v.optional(v.boolean()),
      electricity: v.optional(v.boolean()),
      solar: v.optional(v.boolean()),
      sewer: v.optional(v.boolean()),
      septicTank: v.optional(v.boolean()),
      tarredRoad: v.optional(v.boolean()),
      boundaryWall: v.optional(v.boolean()),
      electricFence: v.optional(v.boolean()),
      pool: v.optional(v.boolean()),
      notes: v.optional(v.string()),
    }),
    landSizeM2: v.optional(v.number()),
    buildingAreas: v.array(v.object({ name: v.string(), areaM2: v.number() })),
    notes: v.optional(v.string()),
    photos: v.array(v.object({ storageId: v.id("_storage"), caption: v.optional(v.string()) })),
    status: v.union(v.literal("draft"), v.literal("completed")),
    completedAt: v.optional(v.number()),
    inspectorUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"]),

  // Supporting documents on a job (VW-23).
  worthDocuments: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    name: v.string(),
    kind: v.union(
      v.literal("title_deed"),
      v.literal("plans"),
      v.literal("lease"),
      v.literal("rates_statement"),
      v.literal("other")
    ),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"]),

  // Sale, rental and valuation evidence (VW-30..35). Private to the firm.
  worthComparables: defineTable({
    orgId: v.id("organizations"),
    kind: v.union(v.literal("sale"), v.literal("rental"), v.literal("valuation")),
    source: v.union(
      v.literal("own_valuation"),
      v.literal("import"),
      v.literal("manual"),
      v.literal("crm_sale")
    ),
    address: v.string(),
    suburb: v.string(),
    // Lower-cased suburb, for matching regardless of how it was typed.
    suburbKey: v.string(),
    propertyType: v.string(),
    landSizeM2: v.optional(v.number()),
    buildingSizeM2: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    // Sale price or market value; rent is per month. One or both.
    price: v.optional(v.number()),
    rent: v.optional(v.number()),
    forcedSaleValue: v.optional(v.number()),
    currency: worthCurrency,
    date: v.string(),
    sourceNote: v.optional(v.string()),
    notes: v.optional(v.string()),
    // A past job's reference when imported from a spreadsheet.
    externalRef: v.optional(v.string()),
    jobId: v.optional(v.id("worthJobs")),
    crmLeadId: v.optional(v.id("leads")),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_date", ["orgId", "date"])
    .index("by_org_suburb", ["orgId", "suburbKey"])
    .index("by_job", ["jobId"])
    .index("by_crm_lead", ["crmLeadId"]),

  // Comparables chosen for a job, with the valuer's adjustment (VW-33).
  worthJobComparables: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    comparableId: v.id("worthComparables"),
    // Net adjustment to the comparable's price, e.g. -10 for 10% down.
    adjustmentPct: v.number(),
    note: v.optional(v.string()),
    addedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"])
    .index("by_comparable", ["comparableId"]),

  // Each issued version of a job's report. Never edited after insert, apart
  // from attaching its PDF once and recording when it was sent.
  worthReports: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    version: v.number(),
    issuedAt: v.number(),
    issuedDate: v.string(),
    preparedByUserId: v.optional(v.id("users")),
    signedByUserId: v.id("users"),
    values: worthValues,
    methods: v.array(worthMethod),
    correctionReason: v.optional(v.string()),
    pdfStorageId: v.optional(v.id("_storage")),
    sends: v.array(v.object({ to: v.string(), at: v.number(), byUserId: v.id("users") })),
    // Set when a later version replaces this one.
    supersededAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"]),

  worthValuerProfiles: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    registrationNumber: v.optional(v.string()),
    qualifications: v.optional(v.string()),
    signatureStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_user", ["orgId", "userId"]),

  // One row per org. Also holds the job counter, so references are allocated
  // inside the same transaction as the job.
  worthSettings: defineTable({
    orgId: v.id("organizations"),
    referencePrefix: v.string(),
    seqYear: v.number(),
    nextSeq: v.number(),
    assumptions: v.string(),
    limitingConditions: v.string(),
    disclaimer: v.string(),
    holdReportUntilPaid: v.boolean(),
    // Days before the due date that a job is flagged as due soon.
    dueSoonDays: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),
};
