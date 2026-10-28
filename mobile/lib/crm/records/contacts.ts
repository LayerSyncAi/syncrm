/**
 * Contacts and owners: labels, options and checks matching the website's
 * contacts and owners pages (src/app/app/contacts, src/app/app/owners).
 */
import { formatMoney, currencies } from "@/lib/currency";
import { OWNER_TYPE_OPTIONS, ownerTypeLabel, type OwnerType } from "@/lib/owner-types";
import { leadSourceLabel } from "@/lib/lead-sources";

export { OWNER_TYPE_OPTIONS, ownerTypeLabel, leadSourceLabel, type OwnerType };

export type PropertyType = "house" | "apartment" | "land" | "commercial" | "other";
export type InterestType = "rent" | "buy";
export type RoleFilter = "buyer_tenant" | "owner" | "all";

export const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
];

export const ROLE_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "buyer_tenant", label: "Buyers and tenants" },
  { value: "owner", label: "Owners" },
  { value: "all", label: "Everyone" },
];

export const CURRENCY_OPTIONS = currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

export const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  under_offer: "Under offer",
  let: "Let",
  sold: "Sold",
  off_market: "Off market",
};

export const interestLabel = (t: string | null | undefined) => (t === "rent" ? "Renting" : t === "buy" ? "Buying" : "");
export const typeLabel = (t: string) => PROPERTY_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
export const listingLabel = (t: string) => (t === "rent" ? "Rent" : t === "sale" ? "Sale" : t);

/** Whole-unit price with its currency symbol, as the website shows prices. */
export const priceLabel = (price: number, currency: string) => formatMoney(price, currency || "USD", { decimals: 0 });

/** Two-decimal amount with its currency, e.g. a deal value. */
export const amountLabel = (amount: number, currency: string | null | undefined) => formatMoney(amount, currency || "USD");

/** "US$100 to US$300", "From $100", "Up to $300" or "". */
export function budgetLabel(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined): string {
  const c = currency || "USD";
  if (min && max) return `${priceLabel(min, c)} to ${priceLabel(max, c)}`;
  if (min) return `From ${priceLabel(min, c)}`;
  if (max) return `Up to ${priceLabel(max, c)}`;
  return "";
}

// The website's form checks, kept word for word where they reach the user.
export function validateName(v: string): string | undefined {
  if (!v.trim()) return "Name is required";
  if (v.trim().length < 2) return "Name must be at least 2 characters";
  return undefined;
}

export function validatePhone(v: string): string | undefined {
  if (!v.trim()) return undefined;
  if (v.replace(/\D/g, "").length < 7) return "Enter a valid phone number";
  return undefined;
}

export function validateEmail(v: string): string | undefined {
  if (!v.trim()) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Enter a valid email address";
  return undefined;
}

/** Whole number from a typed field, or undefined when blank or invalid. */
export function intOrUndefined(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Number from a typed amount ("1,200"), or undefined when blank or invalid. */
export function amountOrUndefined(s: string): number | undefined {
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
