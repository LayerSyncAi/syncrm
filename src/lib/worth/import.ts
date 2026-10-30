/**
 * SyncWorth spreadsheet import (VW-34): map rows read from an Excel sheet to
 * comparables. Headers are matched loosely ("Land size (m2)", "land_size",
 * "Land m²" all work). Pure, so it is unit-tested; the page reads the file
 * with xlsx and sends valid rows to the server in batches.
 */

export type ImportKind = "sale" | "rental" | "valuation";

export type ImportRow = {
  rowNumber: number;
  kind: ImportKind;
  address: string;
  suburb: string;
  propertyType: string;
  landSizeM2?: number;
  buildingSizeM2?: number;
  bedrooms?: number;
  price?: number;
  rent?: number;
  forcedSaleValue?: number;
  currency: "USD" | "ZiG";
  date: string;
  sourceNote?: string;
  notes?: string;
  externalRef?: string;
};

type Field = keyof Omit<ImportRow, "rowNumber">;

/** Template columns, in order. The first word of each is what matters. */
export const TEMPLATE_HEADERS = [
  "Kind",
  "Date",
  "Address",
  "Suburb",
  "Property type",
  "Land size m2",
  "Building size m2",
  "Bedrooms",
  "Price or value",
  "Rent per month",
  "Forced-sale value",
  "Currency",
  "Source",
  "Reference",
  "Notes",
] as const;

export const TEMPLATE_EXAMPLE = [
  "sale",
  "2026-03-14",
  "12 Glenara Avenue",
  "Highlands",
  "House",
  2000,
  320,
  4,
  285000,
  "",
  "",
  "USD",
  "Deeds office transfer",
  "",
  "Sold with borehole and solar",
];

const ALIASES: Record<Field, string[]> = {
  kind: ["kind", "evidence type", "type of evidence", "record type"],
  date: ["date", "sale date", "valuation date", "transaction date"],
  address: ["address", "property address", "property"],
  suburb: ["suburb", "area", "location", "township"],
  propertyType: ["property type", "type", "use"],
  landSizeM2: ["land size m2", "land size", "land m2", "land area", "erf size", "stand size"],
  buildingSizeM2: ["building size m2", "building size", "building m2", "building area", "floor area", "gla"],
  bedrooms: ["bedrooms", "beds"],
  price: ["price or value", "price", "sale price", "market value", "value"],
  rent: ["rent per month", "rent", "monthly rent", "market rental"],
  forcedSaleValue: ["forced-sale value", "forced sale value", "forced sale", "fsv"],
  currency: ["currency", "ccy"],
  sourceNote: ["source"],
  externalRef: ["reference", "ref", "job reference", "valuation reference"],
  notes: ["notes", "comments", "remarks"],
};

export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/m²/g, "m2")
    .replace(/[()_.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Column index for each field found in the header row. */
export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const norm = headers.map((h) => normaliseHeader(String(h ?? "")));
  const out: Partial<Record<Field, number>> = {};
  const taken = new Set<number>();
  // Longest aliases first, so "land size m2" wins over "type" style clashes.
  const pairs = (Object.keys(ALIASES) as Field[])
    .flatMap((f) => ALIASES[f].map((a) => ({ f, a })))
    .sort((x, y) => y.a.length - x.a.length);
  for (const { f, a } of pairs) {
    if (out[f] !== undefined) continue;
    const i = norm.findIndex((h, idx) => !taken.has(idx) && h === a);
    if (i >= 0) {
      out[f] = i;
      taken.add(i);
    }
  }
  return out;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Excel serial day numbers, Date objects and common text formats to YYYY-MM-DD. */
export function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel's day 0 is 1899-12-30 (allowing for its 1900 leap-year bug).
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // Day first, as written in Zimbabwe and South Africa: 14/03/2026.
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return date.toISOString().slice(0, 10);
}

function kindOf(v: string, hasRentOnly: boolean, fallback: ImportKind): ImportKind | null {
  const k = v.toLowerCase();
  if (!k) return hasRentOnly ? "rental" : fallback;
  if (k.startsWith("sale") || k === "sold") return "sale";
  if (k.startsWith("rent") || k.startsWith("let") || k.startsWith("lease")) return "rental";
  if (k.startsWith("val")) return "valuation";
  return null;
}

function currencyOf(v: string): "USD" | "ZiG" | null {
  const c = v.toUpperCase().replace(/[^A-Z$]/g, "");
  if (!c || c === "USD" || c === "US" || c === "US$" || c === "$") return "USD";
  if (c === "ZIG" || c === "ZWG") return "ZiG";
  return null;
}

/**
 * Turn a sheet (first row headers) into rows ready to import, and a list of
 * rows that cannot be imported with the reason. Blank rows are skipped.
 * `defaultKind` applies when there is no Kind column ("valuation" for a
 * sheet of past valuations).
 */
export function parseSheet(
  sheet: unknown[][],
  defaultKind: ImportKind = "sale"
): { rows: ImportRow[]; errors: Array<{ rowNumber: number; message: string }>; missing: string[] } {
  const [header, ...body] = sheet;
  const map = mapHeaders((header ?? []).map((h) => str(h)));
  const missing = (["address", "suburb", "date"] as Field[]).filter((f) => map[f] === undefined);
  if (map.price === undefined && map.rent === undefined) missing.push("price");
  if (missing.length) return { rows: [], errors: [], missing };
  const get = (r: unknown[], f: Field) => (map[f] === undefined ? undefined : r[map[f]!]);
  const rows: ImportRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];
  body.forEach((r, i) => {
    const rowNumber = i + 2;
    if (!r || r.every((c) => str(c) === "")) return;
    const price = num(get(r, "price"));
    const rent = num(get(r, "rent"));
    const kind = kindOf(str(get(r, "kind")), !price && !!rent, defaultKind);
    const currency = currencyOf(str(get(r, "currency")));
    const date = toIsoDate(get(r, "date"));
    const address = str(get(r, "address"));
    const suburb = str(get(r, "suburb"));
    const problem = !address
      ? "address is missing"
      : !suburb
        ? "suburb is missing"
        : !date
          ? "date is not a valid date"
          : !kind
            ? "kind must be sale, rental or valuation"
            : !currency
              ? "currency must be USD or ZiG"
              : !(price && price > 0) && !(rent && rent > 0)
                ? "price, value or rent is missing"
                : null;
    if (problem) {
      errors.push({ rowNumber, message: problem });
      return;
    }
    rows.push({
      rowNumber,
      kind: kind!,
      address,
      suburb,
      propertyType: str(get(r, "propertyType")) || "Other",
      landSizeM2: num(get(r, "landSizeM2")),
      buildingSizeM2: num(get(r, "buildingSizeM2")),
      bedrooms: num(get(r, "bedrooms")),
      price,
      rent,
      forcedSaleValue: num(get(r, "forcedSaleValue")),
      currency: currency!,
      date: date!,
      sourceNote: str(get(r, "sourceNote")) || undefined,
      notes: str(get(r, "notes")) || undefined,
      externalRef: str(get(r, "externalRef")) || undefined,
    });
  });
  return { rows, errors, missing: [] };
}

/** Split into batches the server accepts in one mutation. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
