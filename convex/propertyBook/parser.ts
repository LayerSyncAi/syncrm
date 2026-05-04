export type PropertyType =
  | "house"
  | "apartment"
  | "land"
  | "commercial"
  | "other";

export type ListingType = "rent" | "sale";

const TITLE_TYPE_RULES: Array<{ pattern: RegExp; type: PropertyType }> = [
  { pattern: /\b(apartment|flat|penthouse|townhouse)\b/i, type: "apartment" },
  { pattern: /\b(stand|plot|vacant\s+land|land)\b/i, type: "land" },
  {
    pattern: /\b(warehouse|office|retail|shop|industrial|commercial)\b/i,
    type: "commercial",
  },
  { pattern: /\b(house|cottage|bungalow|villa|home|cluster)\b/i, type: "house" },
];

export function mapPbType(title: string | undefined, typeIdHint?: string | number): PropertyType {
  const hay = (title || "").toLowerCase();
  for (const rule of TITLE_TYPE_RULES) {
    if (rule.pattern.test(hay)) return rule.type;
  }
  if (typeIdHint !== undefined && typeIdHint !== null) {
    const s = String(typeIdHint).toLowerCase();
    if (/apartment|flat/.test(s)) return "apartment";
    if (/land|stand|plot/.test(s)) return "land";
    if (/commercial|retail|warehouse|office|industrial/.test(s)) return "commercial";
    if (/house|residential/.test(s)) return "house";
  }
  return "other";
}

export function parsePrice(raw: string | undefined | null): { currency: string; price: number } | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const match = /^(USD|ZWL)\s*([\d,]+(?:\.\d+)?)/i.exec(trimmed);
  if (!match) return null;
  const price = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;
  return { currency: match[1].toUpperCase(), price };
}

export function listingTypeFromUrl(url: string): ListingType | null {
  if (/\/listings\/for-sale\//i.test(url)) return "sale";
  if (/\/listings\/to-rent\//i.test(url)) return "rent";
  return null;
}

export function parseArea(
  landSizeHint: string | number | undefined,
  features: Record<string, string>
): number {
  if (typeof landSizeHint === "number" && Number.isFinite(landSizeHint)) {
    return Math.max(0, Math.round(landSizeHint));
  }
  if (typeof landSizeHint === "string") {
    const n = Number(landSizeHint.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  for (const [key, value] of Object.entries(features)) {
    if (/land\s*size|plot\s*size|area/i.test(key)) {
      const n = Number(String(value).replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return 0;
}

export function parseIntSafe(raw: string | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

export function extractRefCodeFromUrl(url: string): string | null {
  const m = /-([a-z]{2,}\d+)$/i.exec(url.replace(/\/+$/, ""));
  return m ? m[1].toUpperCase() : null;
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function capString(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
}
