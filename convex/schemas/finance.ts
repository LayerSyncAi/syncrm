/**
 * SyncFinance tables: client money in trust, agency income and the
 * statements that prove both (BRD SyncFinance v1).
 *
 * The core is a small double-entry ledger that users never see:
 *  - finTransactions is one event (a receipt, a payment, a transfer).
 *  - finLines are its postings. A line either moves money in a bank or cash
 *    account (`accountId`), or says whose money it is (`ledger` + `key`):
 *    a landlord, a tenant deposit, a sale, a developer, the agency itself,
 *    or "unallocated" (opening balances not yet assigned to anyone).
 *  - For every transaction the account lines and the ledger lines sum to the
 *    same figure, per currency. Every balance is a sum of lines.
 *
 * Nothing is deleted. A mistake is reversed by a new transaction with the
 * lines negated; the original keeps a pointer to it.
 *
 * Dates a person picks are "YYYY-MM-DD" strings, as in SyncStay. Amounts are
 * in the transaction's currency (USD or ZiG) and never converted.
 *
 * Imports (opening balances, historical transactions, stand accounts) record
 * a finImports row and stamp `importId` on what they create, so a whole batch
 * can be undone in one action.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const finCurrency = v.union(v.literal("USD"), v.literal("ZiG"));

export const finAccountType = v.union(v.literal("trust"), v.literal("business"), v.literal("cash"));

export const finLedger = v.union(
  v.literal("landlord"),
  v.literal("deposit"),
  v.literal("sale"),
  v.literal("developer"),
  v.literal("agency"),
  v.literal("unallocated")
);

export const finMethod = v.union(
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("mobile_money"),
  v.literal("other")
);

export const financeTables = {
  // A bank account or cash float (FN-01).
  finAccounts: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    type: finAccountType,
    currency: finCurrency,
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    branch: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  // Income and expense categories, editable by the agency (FN-03). `key`
  // marks the ones the system posts to itself (management fee, etc.).
  finCategories: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    kind: v.union(v.literal("income"), v.literal("expense")),
    key: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // One row per org (FN-05). Receipt numbers share SyncStay's counter so
  // there is one sequence per agency (FN-12).
  finSettings: defineTable({
    orgId: v.id("organizations"),
    commissionTiming: v.union(v.literal("on_receipt"), v.literal("month_end")),
    landlordPayouts: v.union(v.literal("per_receipt"), v.literal("monthly")),
    depositHeldIn: v.union(v.literal("trust"), v.literal("business"), v.literal("landlord")),
    vatEnabled: v.boolean(),
    vatRate: v.number(),
    approvers: v.union(v.literal("one"), v.literal("two")),
    invoicePrefix: v.string(),
    nextInvoiceSeq: v.number(),
    payoutPrefix: v.string(),
    nextPayoutSeq: v.number(),
    paymentPrefix: v.string(),
    nextPaymentSeq: v.number(),
    // Days before an instalment falls due that the buyer is reminded.
    standReminderDays: v.number(),
    // Months up to and including this one ("YYYY-MM") are closed.
    lockedThrough: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  finTransactions: defineTable({
    orgId: v.id("organizations"),
    date: v.string(),
    kind: v.union(
      v.literal("receipt"),
      v.literal("payment"),
      v.literal("transfer"),
      v.literal("opening")
    ),
    // Receipt or payment voucher number, when the event has one.
    number: v.optional(v.string()),
    description: v.string(),
    method: v.optional(finMethod),
    reference: v.optional(v.string()),
    // Who paid us or whom we paid: a Hub contact, or just a name.
    contactId: v.optional(v.id("contacts")),
    counterparty: v.optional(v.string()),
    supplier: v.optional(v.string()),
    // Photo of the slip (FN-70).
    attachmentId: v.optional(v.id("_storage")),
    // Links to the records this money is about.
    stayPaymentId: v.optional(v.id("stayPayments")),
    stayExpenseId: v.optional(v.id("stayExpenses")),
    leaseId: v.optional(v.id("stayLeases")),
    stayPropertyId: v.optional(v.id("stayProperties")),
    invoiceId: v.optional(v.id("finInvoices")),
    payoutId: v.optional(v.id("finPayouts")),
    dealCommissionId: v.optional(v.id("dealCommissions")),
    agentUserId: v.optional(v.id("users")),
    standId: v.optional(v.id("finStands")),
    developmentId: v.optional(v.id("finDevelopments")),
    // Management or sales commission due on this receipt, and the transfer
    // that moved it to agency income once moved (FN-31, FN-93).
    fee: v.optional(
      v.object({
        ledger: finLedger,
        key: v.string(),
        currency: finCurrency,
        accountId: v.id("finAccounts"),
        base: v.number(),
        pct: v.number(),
        amount: v.number(),
        categoryKey: v.string(),
        movedTxId: v.optional(v.id("finTransactions")),
      })
    ),
    // Set on the fee transfer, pointing back at the receipt it came from.
    feeOfTxId: v.optional(v.id("finTransactions")),
    importId: v.optional(v.id("finImports")),
    reversalOfId: v.optional(v.id("finTransactions")),
    reversedById: v.optional(v.id("finTransactions")),
    reversedAt: v.optional(v.number()),
    reverseReason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    // by_org is what the org purge walks (convex/platformLib.ts).
    .index("by_org", ["orgId"])
    .index("by_org_date", ["orgId", "date"])
    .index("by_stay_payment", ["stayPaymentId"])
    .index("by_invoice", ["invoiceId"])
    .index("by_deal_commission", ["dealCommissionId"])
    .index("by_stand", ["standId"])
    .index("by_import", ["importId"])
    .index("by_contact", ["contactId"]),

  // Postings. Exactly one of accountId or ledger is set.
  finLines: defineTable({
    orgId: v.id("organizations"),
    txId: v.id("finTransactions"),
    date: v.string(),
    currency: finCurrency,
    // Positive adds to the account or to what is held for / earned by the
    // ledger owner; negative takes away.
    amount: v.number(),
    accountId: v.optional(v.id("finAccounts")),
    ledger: v.optional(finLedger),
    // The ledger owner: landlord contact id, lease id (deposit), lead id
    // (sale), development id (developer). Empty for agency and unallocated.
    key: v.optional(v.string()),
    // Agency income and expense lines carry their category.
    categoryId: v.optional(v.id("finCategories")),
    // Landlord lines carry the property, for statements per property.
    stayPropertyId: v.optional(v.id("stayProperties")),
  })
    .index("by_org", ["orgId"])
    .index("by_tx", ["txId"])
    .index("by_account_date", ["accountId", "date"])
    .index("by_org_ledger_key", ["orgId", "ledger", "key"])
    .index("by_org_ledger_date", ["orgId", "ledger", "date"]),

  // Net movement per account per month, kept on every posting, so a balance
  // reads one row per past month instead of an account's whole history.
  // Rebuilt from finLines by finance/migrations:rebuildAccountMonths.
  finAccountMonths: defineTable({
    orgId: v.id("organizations"),
    accountId: v.id("finAccounts"),
    month: v.string(),
    net: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_account_month", ["accountId", "month"]),

  // Invoices to landlords, buyers, sellers and other clients (FN-60).
  finInvoices: defineTable({
    orgId: v.id("organizations"),
    number: v.string(),
    contactId: v.optional(v.id("contacts")),
    clientName: v.string(),
    clientEmail: v.optional(v.string()),
    date: v.string(),
    dueDate: v.string(),
    currency: finCurrency,
    lines: v.array(
      v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        categoryId: v.optional(v.id("finCategories")),
      })
    ),
    vatRate: v.number(),
    subtotal: v.number(),
    vat: v.number(),
    total: v.number(),
    amountPaid: v.number(),
    status: v.union(
      v.literal("unpaid"),
      v.literal("part_paid"),
      v.literal("paid"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    dealCommissionId: v.optional(v.id("dealCommissions")),
    cancelReason: v.optional(v.string()),
    emailedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_contact", ["contactId"]),

  // Money paid out of a client ledger: landlord, seller or developer (FN-41).
  finPayouts: defineTable({
    orgId: v.id("organizations"),
    number: v.string(),
    ledger: v.union(v.literal("landlord"), v.literal("sale"), v.literal("developer")),
    key: v.string(),
    payeeName: v.string(),
    payeeEmail: v.optional(v.string()),
    currency: finCurrency,
    amount: v.number(),
    accountId: v.id("finAccounts"),
    method: finMethod,
    reference: v.optional(v.string()),
    date: v.string(),
    status: v.union(v.literal("prepared"), v.literal("paid"), v.literal("cancelled")),
    // What the remittance advice shows: ledger movements since the last
    // payout to this payee, captured when the payout is prepared.
    remittance: v.array(v.object({ date: v.string(), description: v.string(), amount: v.number() })),
    txId: v.optional(v.id("finTransactions")),
    preparedByUserId: v.id("users"),
    preparedAt: v.number(),
    approvedByUserId: v.optional(v.id("users")),
    paidAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    emailedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_ledger_key", ["orgId", "ledger", "key"]),

  // Monthly trust reconciliation (FN-25): system balance against the bank.
  finReconciliations: defineTable({
    orgId: v.id("organizations"),
    accountId: v.id("finAccounts"),
    month: v.string(),
    bankBalance: v.number(),
    systemBalance: v.number(),
    difference: v.number(),
    note: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_account", ["accountId"]),

  // Developments and stand sales on payment plans (BRD 5.10). Owned by Sync
  // Dev (convex/dev/), shared with SyncFinance, which handles the money when
  // the agency has it. The fin prefix is historical.
  finDevelopments: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    developerContactId: v.optional(v.id("contacts")),
    developerName: v.string(),
    developerEmail: v.optional(v.string()),
    // developer: buyers pay the developer (our client) directly; it is their
    // own income. agency_trust: we sell for the developer through trust.
    moneyHeldBy: v.union(v.literal("developer"), v.literal("agency_trust")),
    commissionPct: v.number(),
    commissionTiming: v.union(v.literal("each_payment"), v.literal("fully_paid")),
    // Interest per month on overdue instalments, charged when staff run
    // "Charge interest" (never automatically). Absent = no interest.
    interestPctPerMonth: v.optional(v.number()),
    currency: finCurrency,
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  finStands: defineTable({
    orgId: v.id("organizations"),
    developmentId: v.id("finDevelopments"),
    standNumber: v.string(),
    // The stand in SyncDev's inventory this sale is for.
    devStandId: v.optional(v.id("devStands")),
    buyerContactId: v.optional(v.id("contacts")),
    buyerName: v.string(),
    buyerEmail: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    currency: finCurrency,
    price: v.number(),
    // The payment plan, deposit first. Each row is one amount due. Interest
    // charged on overdue amounts is added as its own row.
    schedule: v.array(
      v.object({
        dueDate: v.string(),
        amount: v.number(),
        label: v.string(),
        kind: v.optional(v.union(v.literal("plan"), v.literal("interest"))),
      })
    ),
    // Months ("YYYY-MM") interest was already charged for.
    interestMonths: v.optional(v.array(v.string())),
    // Paid before go-live (imported), counted towards the plan.
    openingPaid: v.number(),
    // Kept up to date on every receipt, for SyncDev and lists.
    paidToDate: v.number(),
    balance: v.number(),
    overdue: v.number(),
    nextDueDate: v.optional(v.string()),
    nextDueAmount: v.optional(v.number()),
    commissionMoved: v.optional(v.boolean()),
    status: v.union(v.literal("active"), v.literal("paid"), v.literal("cancelled")),
    // Reminder emails already sent, as "before:YYYY-MM-DD" / "overdue:YYYY-MM-DD".
    remindersSent: v.array(v.string()),
    importId: v.optional(v.id("finImports")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_development", ["developmentId"])
    .index("by_import", ["importId"])
    .index("by_buyer_contact", ["buyerContactId"]),

  // One row per Excel import, so a batch can be reviewed and undone.
  finImports: defineTable({
    orgId: v.id("organizations"),
    kind: v.union(v.literal("opening"), v.literal("transactions"), v.literal("stands")),
    fileName: v.string(),
    rowCount: v.number(),
    okCount: v.number(),
    errors: v.array(v.object({ row: v.number(), message: v.string() })),
    undoneAt: v.optional(v.number()),
    undoneByUserId: v.optional(v.id("users")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),
};
