/**
 * Pure logic for editing a lead's details after creation. Dependency-free so
 * it can be unit-tested from src/__tests__ without the Convex runtime.
 *
 * A lead's name / phone / email are denormalised copies of its contact, so an
 * edit to any of those must land on the lead, the contact and every sibling
 * lead of the same contact. Preference fields (source, interest, budget, areas,
 * notes) belong to the individual lead.
 */

export type EditableInterest = "rent" | "buy";

export interface LeadDetailsInput {
  fullName?: string;
  phone?: string; // "" clears
  email?: string; // "" clears
  source?: string;
  interestType?: EditableInterest;
  budgetCurrency?: string;
  budgetMin?: number | null; // null clears
  budgetMax?: number | null; // null clears
  preferredAreas?: string[];
  notes?: string;
}

export interface LeadDetailsCurrent {
  fullName: string;
  phone?: string;
  email?: string;
  source: string;
  sourceNeedsReview?: boolean;
  interestType: EditableInterest;
  interestNeedsReview?: boolean;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas: string[];
  notes: string;
}

export interface LeadDetailsPatchResult {
  /** Fields to patch on the lead being edited (empty when nothing changed). */
  leadPatch: Record<string, unknown>;
  /** Fields to patch on the contact and sibling leads (identity only). */
  identityPatch: {
    fullName?: string;
    phone?: string | undefined;
    normalizedPhone?: string | undefined;
    email?: string | undefined;
  };
  /** Keys that actually changed, for the audit entry. */
  changedFields: string[];
  /** A validation error, or null when the input is acceptable. */
  error: string | null;
}

/** Digits only — the convention used by leads.ts and contacts.ts. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

const LEGACY_PORTAL = "property_portal";

/**
 * Build the patch sets for a details edit. `undefined` means "leave as is";
 * an empty string on phone/email or `null` on a budget means "clear".
 * `canonicalizeAreas` is injected so this module stays dependency-free.
 */
export function buildLeadDetailsPatch(
  current: LeadDetailsCurrent,
  input: LeadDetailsInput,
  opts: { canonicalizeAreas: (areas: string[]) => string[]; requireContactInfo: boolean }
): LeadDetailsPatchResult {
  const leadPatch: Record<string, unknown> = {};
  const identityPatch: LeadDetailsPatchResult["identityPatch"] = {};
  const changed: string[] = [];

  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (name.length < 2) {
      return { leadPatch: {}, identityPatch: {}, changedFields: [], error: "Name must be at least 2 characters" };
    }
    if (name !== current.fullName) {
      leadPatch.fullName = name;
      identityPatch.fullName = name;
      changed.push("fullName");
    }
  }

  let nextPhone = current.phone;
  if (input.phone !== undefined) {
    const phone = input.phone.trim();
    if (phone && normalizePhoneDigits(phone).length < 7) {
      return { leadPatch: {}, identityPatch: {}, changedFields: [], error: "Please enter a valid phone number" };
    }
    nextPhone = phone || undefined;
    if (nextPhone !== current.phone) {
      leadPatch.phone = nextPhone;
      leadPatch.normalizedPhone = nextPhone ? normalizePhoneDigits(nextPhone) : undefined;
      identityPatch.phone = nextPhone;
      identityPatch.normalizedPhone = leadPatch.normalizedPhone as string | undefined;
      changed.push("phone");
    }
  }

  let nextEmail = current.email;
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { leadPatch: {}, identityPatch: {}, changedFields: [], error: "Please enter a valid email address" };
    }
    nextEmail = email || undefined;
    if (nextEmail !== current.email) {
      leadPatch.email = nextEmail;
      identityPatch.email = nextEmail;
      changed.push("email");
    }
  }

  // A lead that has progressed past the first stage must keep some way of
  // being contacted (mirrors the MISSING_CONTACT_INFO rule in moveStage).
  if (opts.requireContactInfo && !nextPhone && !nextEmail) {
    return {
      leadPatch: {},
      identityPatch: {},
      changedFields: [],
      error: "A lead that has moved down the pipeline needs a phone number or an email address",
    };
  }

  if (input.source !== undefined && input.source !== current.source) {
    leadPatch.source = input.source;
    changed.push("source");
  }
  // Naming a real source resolves the review flag set by the legacy migration.
  const effectiveSource = (leadPatch.source as string | undefined) ?? current.source;
  if (current.sourceNeedsReview && effectiveSource !== LEGACY_PORTAL) {
    leadPatch.sourceNeedsReview = undefined;
  }

  if (input.interestType !== undefined && input.interestType !== current.interestType) {
    leadPatch.interestType = input.interestType;
    changed.push("interestType");
  }
  // An import that could not read the interest type flags the lead. Saving an
  // interest type from the edit form — even the placeholder value — confirms it.
  if (input.interestType !== undefined && current.interestNeedsReview) {
    leadPatch.interestNeedsReview = undefined;
    if (!changed.includes("interestType")) changed.push("interestType");
  }

  if (input.budgetCurrency !== undefined) {
    const currency = input.budgetCurrency.trim() || undefined;
    if (currency !== current.budgetCurrency) {
      leadPatch.budgetCurrency = currency;
      changed.push("budgetCurrency");
    }
  }

  const nextMin = input.budgetMin === undefined ? current.budgetMin : input.budgetMin ?? undefined;
  const nextMax = input.budgetMax === undefined ? current.budgetMax : input.budgetMax ?? undefined;
  if ((nextMin !== undefined && nextMin < 0) || (nextMax !== undefined && nextMax < 0)) {
    return { leadPatch: {}, identityPatch: {}, changedFields: [], error: "Budget cannot be negative" };
  }
  if (nextMin !== undefined && nextMax !== undefined && nextMin > nextMax) {
    return { leadPatch: {}, identityPatch: {}, changedFields: [], error: "Minimum budget cannot exceed maximum budget" };
  }
  if (nextMin !== current.budgetMin) {
    leadPatch.budgetMin = nextMin;
    changed.push("budgetMin");
  }
  if (nextMax !== current.budgetMax) {
    leadPatch.budgetMax = nextMax;
    changed.push("budgetMax");
  }

  if (input.preferredAreas !== undefined) {
    const areas = opts.canonicalizeAreas(input.preferredAreas);
    const same =
      areas.length === current.preferredAreas.length &&
      areas.every((a, i) => a === current.preferredAreas[i]);
    if (!same) {
      leadPatch.preferredAreas = areas;
      changed.push("preferredAreas");
    }
  }

  if (input.notes !== undefined) {
    const notes = input.notes.trim();
    if (notes !== current.notes) {
      leadPatch.notes = notes;
      changed.push("notes");
    }
  }

  return { leadPatch, identityPatch, changedFields: changed, error: null };
}
