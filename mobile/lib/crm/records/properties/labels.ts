/**
 * Property labels, options and formatting, matching the website's properties
 * pages (src/app/app/properties). Prices show whole units with the currency
 * symbol, the same as the web list.
 */
import { formatMoney, currencies } from "@/lib/currency";
import type { BadgeTone } from "../../../../components/ui";

export type PropertyType = "house" | "apartment" | "land" | "commercial" | "other";
export type ListingType = "rent" | "sale";
export type PropertyStatus = "available" | "under_offer" | "let" | "sold" | "off_market";
export type CommercialType = "warehouse" | "office" | "retail_shop" | "industrial" | "mixed_use" | "other";

export const TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
];

export const LISTING_OPTIONS: Array<{ value: ListingType; label: string }> = [
  { value: "sale", label: "Sale" },
  { value: "rent", label: "Rent" },
];

export const STATUS_OPTIONS: Array<{ value: PropertyStatus; label: string }> = [
  { value: "available", label: "Available" },
  { value: "under_offer", label: "Under offer" },
  { value: "let", label: "Let" },
  { value: "sold", label: "Sold" },
  { value: "off_market", label: "Off market" },
];

export const COMMERCIAL_OPTIONS: Array<{ value: CommercialType; label: string }> = [
  { value: "warehouse", label: "Warehouse" },
  { value: "office", label: "Office" },
  { value: "retail_shop", label: "Retail / shop" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed use" },
  { value: "other", label: "Other" },
];

export const CURRENCY_OPTIONS = currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

const find = <T extends string>(opts: Array<{ value: T; label: string }>, v: string | undefined | null) =>
  opts.find((o) => o.value === v)?.label ?? v ?? "";

export const typeLabel = (t: string | undefined | null) => find(TYPE_OPTIONS, t);
export const listingLabel = (t: string | undefined | null) => find(LISTING_OPTIONS, t);
export const statusLabel = (t: string | undefined | null) => find(STATUS_OPTIONS, t);
export const commercialLabel = (t: string | undefined | null) => find(COMMERCIAL_OPTIONS, t);

export const STATUS_TONE: Record<PropertyStatus, BadgeTone> = {
  available: "success",
  under_offer: "warning",
  let: "info",
  sold: "neutral",
  off_market: "neutral",
};

/** "$250,000" or "ZiG4,000", whole units. */
export function priceLabel(price: number, currency: string): string {
  return formatMoney(price, currency, { decimals: 0 });
}

/** Any amount with its currency, two decimals (marketing spend). */
export function amountLabel(amount: number, currency: string): string {
  return formatMoney(amount, currency || "USD");
}

/** Bedrooms and bathrooms only apply to homes. */
export const isResidential = (t: PropertyType) => t !== "commercial" && t !== "land";

/** yyyy-MM-dd to a midday-local timestamp, as the web marketing tab stores it. */
export function dateToTs(date: string): number {
  return new Date(`${date}T12:00:00`).getTime();
}

/** A stored timestamp as yyyy-MM-dd. */
export function tsToDate(ts: number | undefined | null): string {
  if (typeof ts !== "number") return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Who holds the record: "Company" or the agent names. */
export function agentOwnerSummary(ownershipType: string | undefined, ownerNames: string[] | undefined): string {
  if (ownershipType === "company") return "Company (no individual agent)";
  if (ownerNames && ownerNames.length > 0) return ownerNames.join(", ");
  return "Unassigned";
}
