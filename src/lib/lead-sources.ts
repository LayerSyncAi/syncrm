// Single source of truth for lead `source` values and their display labels.
// Keep in sync with the `leads.source` union in convex/schema.ts.

export type LeadSource =
  | "walk_in"
  | "referral"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "website"
  | "property_portal"
  | "other";

export const LEAD_SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
  { value: "property_portal", label: "Property portal" },
  { value: "other", label: "Other" },
];

export const LEAD_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_SOURCE_OPTIONS.map((o) => [o.value, o.label])
);

export function leadSourceLabel(source: string): string {
  return (
    LEAD_SOURCE_LABELS[source] ??
    source.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
