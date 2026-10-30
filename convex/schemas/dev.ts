/**
 * SyncDev tables: the stand inventory of each development, and payments
 * recorded by agencies that do not have SyncFinance.
 *
 * Developments (finDevelopments) and sales to buyers on payment plans
 * (finStands) are shared with SyncFinance; see convex/schemas/finance.ts.
 * A sale points at its inventory stand (finStands.devStandId) and the stand
 * at its live sale (devStands.saleId).
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { finCurrency, finMethod } from "./finance";

export const devTables = {
  // One stand (or unit, or plot) in a development, sold or not.
  devStands: defineTable({
    orgId: v.id("organizations"),
    developmentId: v.id("finDevelopments"),
    number: v.string(),
    sizeSqm: v.optional(v.number()),
    price: v.number(),
    status: v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")),
    // A hold for a prospective buyer, released by hand or on its date.
    reservedFor: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
        until: v.optional(v.string()),
        byUserId: v.id("users"),
      })
    ),
    saleId: v.optional(v.id("finStands")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_development", ["developmentId"]),

  // Payments on a sale when the agency does not have SyncFinance. With
  // Finance on, payments are ledger receipts instead; bringing these into
  // Finance later sets finTxId so they are not counted twice.
  devPayments: defineTable({
    orgId: v.id("organizations"),
    standId: v.id("finStands"),
    kind: v.union(v.literal("receipt"), v.literal("refund")),
    number: v.string(),
    date: v.string(),
    amount: v.number(),
    currency: finCurrency,
    method: finMethod,
    reference: v.optional(v.string()),
    reversedAt: v.optional(v.number()),
    reversedByUserId: v.optional(v.id("users")),
    reverseReason: v.optional(v.string()),
    finTxId: v.optional(v.id("finTransactions")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_stand", ["standId"]),
};
