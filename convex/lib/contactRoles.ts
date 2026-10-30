/**
 * Which side of the business a contact belongs to.
 *
 * A person can be a buyer/tenant, a property owner (seller/landlord), or both —
 * the same human often is. Both are stored as role flags on one contact record
 * so phone dedupe, agent assignment and the activity timeline work across both
 * sides instead of being duplicated.
 *
 * Pure and Convex-free so the legacy-row semantics can be unit tested.
 */

export type OwnerTypeValue = "seller" | "landlord" | "both";

export interface ContactRoles {
  ownerType?: string;
  isBuyerTenant?: boolean;
}

/**
 * Contacts created before the Owners module have neither flag set, and must
 * read as buyers/tenants so they keep appearing where they always did. Once a
 * record carries an owner role, an unset `isBuyerTenant` means owner-only.
 */
export function isBuyerTenantContact(contact: ContactRoles): boolean {
  return contact.isBuyerTenant ?? contact.ownerType === undefined;
}

export function isOwnerContact(contact: ContactRoles): boolean {
  return contact.ownerType !== undefined;
}

/**
 * Does a contact's owner role match a filter? An owner marked "both" is a
 * seller and a landlord, so it matches either.
 */
export function ownerTypeMatches(
  ownerType: string | undefined,
  filter: OwnerTypeValue | undefined
): boolean {
  if (!filter) return true;
  if (ownerType === undefined) return false;
  if (ownerType === "both") return true;
  return ownerType === filter;
}

/**
 * The role to record when linking an owner to a property. An owner marked
 * "both" is still either selling or letting any given property, so fall back to
 * the listing type rather than guessing.
 */
export function roleForProperty(
  ownerType: OwnerTypeValue,
  listingType: "rent" | "sale"
): "seller" | "landlord" {
  if (ownerType !== "both") return ownerType;
  return listingType === "rent" ? "landlord" : "seller";
}

export interface ContactTagFields extends ContactRoles {
  isLeaseTenant?: boolean;
  isValuationClient?: boolean;
  isSupplier?: boolean;
}

/**
 * Display tags for a Hub contact, one per side of the business it touches
 * (HB-30). Order is stable so lists read the same way everywhere.
 */
export function contactTags(contact: ContactTagFields): string[] {
  const tags: string[] = [];
  if (contact.ownerType === "seller" || contact.ownerType === "both") tags.push("Seller");
  if (contact.ownerType === "landlord" || contact.ownerType === "both") tags.push("Landlord");
  if (contact.isLeaseTenant) tags.push("Tenant");
  if (contact.isValuationClient) tags.push("Valuation client");
  if (contact.isSupplier) tags.push("Supplier");
  return tags;
}

/** Digits only, so "+263 77-123" and "26377123" compare equal. */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Too short to identify anyone; a match on fewer digits is noise. */
export const MIN_DUPLICATE_PHONE_DIGITS = 7;

/**
 * Why an existing contact looks like the person being entered, or null
 * (HB-33). Phone compares digits only; email ignores case and spaces.
 */
export function duplicateReason(
  existing: { phone?: string; normalizedPhone?: string; email?: string },
  input: { phone?: string; email?: string }
): "Phone match" | "Email match" | null {
  const phone = input.phone ? digitsOnly(input.phone) : "";
  if (phone.length >= MIN_DUPLICATE_PHONE_DIGITS) {
    const theirs = existing.normalizedPhone || (existing.phone ? digitsOnly(existing.phone) : "");
    if (theirs === phone) return "Phone match";
  }
  const email = input.email?.trim().toLowerCase();
  if (email && email.includes("@") && existing.email?.trim().toLowerCase() === email) {
    return "Email match";
  }
  return null;
}
