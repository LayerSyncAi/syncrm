/** Argument validators shared by the SyncStay functions. */
import { v } from "convex/values";

export const personValidator = v.object({
  name: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  entityKind: v.optional(v.union(v.literal("individual"), v.literal("company"))),
  idNumber: v.optional(v.string()),
  company: v.optional(v.string()),
  bankDetails: v.optional(
    v.object({
      bankName: v.optional(v.string()),
      accountName: v.optional(v.string()),
      accountNumber: v.optional(v.string()),
      branch: v.optional(v.string()),
    })
  ),
});

/** Either an existing Hub contact or the details to create one. */
export const personRefValidator = v.object({
  existingContactId: v.optional(v.id("contacts")),
  person: v.optional(personValidator),
});

export const depositHeldInValidator = v.union(
  v.literal("trust"),
  v.literal("business"),
  v.literal("landlord")
);

export const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("mobile_money"),
  v.literal("other")
);

export const chargeKindValidator = v.union(
  v.literal("rent"),
  v.literal("admin_fee"),
  v.literal("damage"),
  v.literal("late_fee"),
  v.literal("utilities"),
  v.literal("other")
);

export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};
