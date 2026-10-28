/**
 * Lead CSV import helpers, matching the website's import page and its parse
 * worker: field list, header auto-mapping and row mapping. Parsing itself uses
 * the website's parseCSV.
 */

export const LEAD_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "fullName", label: "Full name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "source", label: "Source (optional)" },
  { key: "interestType", label: "Interest type" },
  { key: "budgetCurrency", label: "Budget currency" },
  { key: "budgetMin", label: "Budget min" },
  { key: "budgetMax", label: "Budget max" },
  { key: "preferredAreas", label: "Preferred areas" },
  { key: "notes", label: "Notes" },
];

export type ImportMode = "create_only" | "upsert" | "skip_duplicates";

export const IMPORT_MODES: Array<{ value: ImportMode; label: string }> = [
  { value: "create_only", label: "Create only (fail on duplicates)" },
  { value: "upsert", label: "Update matches by email or phone" },
  { value: "skip_duplicates", label: "Skip duplicates" },
];

export type MappedRow = {
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  interestType: string;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas?: string;
  notes?: string;
};

const squash = (s: string) => s.toLowerCase().replace(/[_\s-]/g, "");

/** Match headers to fields by key or label, ignoring case, spaces and dashes. */
export function autoMapColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const labels: Record<string, string> = {
    fullName: "Full Name",
    phone: "Phone",
    email: "Email",
    source: "Source",
    interestType: "Interest Type",
    budgetCurrency: "Budget Currency",
    budgetMin: "Budget Min",
    budgetMax: "Budget Max",
    preferredAreas: "Preferred Areas",
    notes: "Notes",
  };
  for (const f of LEAD_FIELDS) {
    const hit = headers.find((h) => squash(h) === squash(f.key)) ?? headers.find((h) => squash(h) === squash(labels[f.key] ?? f.label));
    if (hit) map[f.key] = hit;
  }
  return map;
}

export function mapRows(rows: string[][], headers: string[], columnMap: Record<string, string>): MappedRow[] {
  return rows.map((row) => {
    const get = (key: string): string => {
      const h = columnMap[key];
      if (!h) return "";
      const i = headers.indexOf(h);
      return i >= 0 ? (row[i] || "").trim() : "";
    };
    return {
      fullName: get("fullName"),
      phone: get("phone"),
      email: get("email") || undefined,
      source: get("source") || undefined,
      interestType: get("interestType") || "buy",
      budgetCurrency: get("budgetCurrency") || undefined,
      budgetMin: get("budgetMin") ? Number(get("budgetMin")) : undefined,
      budgetMax: get("budgetMax") ? Number(get("budgetMax")) : undefined,
      preferredAreas: get("preferredAreas") || undefined,
      notes: get("notes") || undefined,
    };
  });
}
