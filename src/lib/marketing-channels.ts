// Marketing spend channel values and display labels. Channel values overlap
// with lead `source` values where the platform is the same (facebook,
// instagram, tiktok, website, other) so per-channel spend lines up with
// lead-source attribution in reports. Property-portal and ad channels are
// marketing-only and have their own values.

export type MarketingChannel =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "property_co_zw"
  | "propertybook"
  | "website"
  | "paid_ads"
  | "other";

export const MARKETING_CHANNEL_OPTIONS: { value: MarketingChannel; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "property_co_zw", label: "Property.co.zw" },
  { value: "propertybook", label: "PropertyBook" },
  { value: "website", label: "Website" },
  { value: "paid_ads", label: "Paid Ads" },
  { value: "other", label: "Other" },
];

const MARKETING_CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  MARKETING_CHANNEL_OPTIONS.map((o) => [o.value, o.label])
);

export function marketingChannelLabel(channel: string): string {
  return (
    MARKETING_CHANNEL_LABELS[channel] ??
    channel.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
