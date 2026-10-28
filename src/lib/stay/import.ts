/**
 * Sync Stay Excel import (BRD Stay ST-06): the template's columns and the
 * pure parser that turns sheet rows into importer.importBatch batches.
 *
 * One row per unit. Rows with the same property name form one property; the
 * landlord and property details are read from the first row that has them.
 * Tenant and lease columns are left blank for a vacant unit.
 */
import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type ImportProperty = FunctionArgs<typeof api.stay.importer.importBatch>["properties"][number];
export type ImportError = { row: number; message: string };

export const IMPORT_COLUMNS = [
  { key: "landlordName", header: "Landlord name", example: "Tendai Moyo" },
  { key: "landlordPhone", header: "Landlord phone", example: "+263 77 123 4567" },
  { key: "landlordEmail", header: "Landlord email", example: "tendai@example.com" },
  { key: "landlordId", header: "Landlord ID or company number", example: "63-123456A63" },
  { key: "landlordType", header: "Landlord type (individual or company)", example: "individual" },
  { key: "bankName", header: "Bank name", example: "CBZ" },
  { key: "accountName", header: "Account name", example: "T Moyo" },
  { key: "accountNumber", header: "Account number", example: "01234567890" },
  { key: "branch", header: "Branch", example: "Avondale" },
  { key: "propertyName", header: "Property name", example: "12 Kings Road" },
  { key: "propertyAddress", header: "Property address", example: "12 Kings Road, Avondale, Harare" },
  { key: "propertyType", header: "Property type (residential or commercial)", example: "residential" },
  { key: "feePct", header: "Management fee %", example: 10 },
  { key: "managerEmail", header: "Manager email", example: "" },
  { key: "unit", header: "Unit", example: "Flat 1" },
  { key: "bedrooms", header: "Bedrooms", example: 2 },
  { key: "tenantName", header: "Tenant name", example: "Rudo Chari" },
  { key: "tenantPhone", header: "Tenant phone", example: "+263 71 555 0101" },
  { key: "tenantEmail", header: "Tenant email", example: "rudo@example.com" },
  { key: "tenantId", header: "Tenant ID number", example: "" },
  { key: "leaseStart", header: "Lease start", example: "2026-01-01" },
  { key: "leaseEnd", header: "Lease end", example: "2026-12-31" },
  { key: "rent", header: "Monthly rent", example: 450 },
  { key: "currency", header: "Currency (USD or ZiG)", example: "USD" },
  { key: "dueDay", header: "Rent due day (1 to 28)", example: 1 },
  { key: "deposit", header: "Deposit", example: 450 },
  { key: "depositHeldIn", header: "Deposit held (trust, business or landlord)", example: "trust" },
  { key: "depositReceived", header: "Deposit received", example: 450 },
  { key: "openingArrears", header: "Opening arrears", example: 0 },
] as const;

type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

export const IMPORT_NOTES = [
  "One row per unit. Repeat the property name on every unit of the same property.",
  "Landlord and property details only need to be on the first row of each property.",
  "Leave the tenant and lease columns blank for a vacant unit.",
  "Dates as YYYY-MM-DD or DD/MM/YYYY. Currency USD or ZiG; amounts are never converted.",
  "Deposit received is what you already hold; it is recorded as an opening balance without a receipt.",
  "Opening arrears is what the tenant owes today, including this month's rent if it has fallen due; it becomes one charge due today. Rent falling due after the import is charged automatically.",
  "Importing the same file twice reuses existing landlords, tenants, properties and units, and skips units that already have an active lease.",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Match a sheet header to a column: by full header, or by its text before "(". */
const HEADER_MAP: Map<string, ColumnKey> = (() => {
  const m = new Map<string, ColumnKey>();
  for (const c of IMPORT_COLUMNS) {
    m.set(norm(c.header), c.key);
    m.set(norm(c.header.split("(")[0]), c.key);
    m.set(norm(c.key), c.key);
  }
  return m;
})();

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[^\d.-]/g, "");
  if (!s) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A cell as "YYYY-MM-DD", or null when it is not a date. */
export function parseDateCell(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // xlsx gives local-midnight dates; read the local calendar day.
    return validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") {
    // Excel serial: days since 1899-12-30.
    if (!Number.isFinite(v) || v < 1) return null;
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  return null;
}

function lower(v: unknown): string {
  return text(v).toLowerCase();
}

/**
 * Turn sheet rows (keyed by header) into one import entry per property.
 * Row numbers in errors are spreadsheet rows (header is row 1). A row with an
 * error is left out; the rest of its property still imports.
 */
export function parseImportRows(rows: Record<string, unknown>[]): {
  properties: ImportProperty[];
  errors: ImportError[];
} {
  const errors: ImportError[] = [];
  const byName = new Map<string, ImportProperty>();
  const order: string[] = [];

  rows.forEach((raw, i) => {
    const row = i + 2;
    const r: Partial<Record<ColumnKey, unknown>> = {};
    for (const [k, val] of Object.entries(raw)) {
      const key = HEADER_MAP.get(norm(k));
      if (key) r[key] = val;
    }
    // Skip blank lines.
    if (Object.values(r).every((x) => text(x) === "")) return;
    const err = (message: string) => errors.push({ row, message });

    const propertyName = text(r.propertyName);
    if (!propertyName) return err("Property name is missing");
    const unitLabel = text(r.unit) || "Main";
    const key = propertyName.toLowerCase();

    let prop = byName.get(key);
    if (!prop) {
      const landlordName = text(r.landlordName);
      if (!landlordName) return err(`Landlord name is missing for ${propertyName}`);
      const kindRaw = lower(r.propertyType);
      if (kindRaw && kindRaw !== "residential" && kindRaw !== "commercial") {
        return err(`Property type must be residential or commercial, not "${text(r.propertyType)}"`);
      }
      const fee = num(r.feePct);
      if (fee !== undefined && (isNaN(fee) || fee < 0 || fee > 100)) return err("Management fee must be between 0 and 100");
      const typeRaw = lower(r.landlordType);
      if (typeRaw && typeRaw !== "individual" && typeRaw !== "company") {
        return err(`Landlord type must be individual or company, not "${text(r.landlordType)}"`);
      }
      const opt = (v: unknown) => text(v) || undefined;
      prop = {
        landlord: {
          name: landlordName,
          phone: opt(r.landlordPhone),
          email: opt(r.landlordEmail),
          idNumber: opt(r.landlordId),
          entityKind: typeRaw ? (typeRaw as "individual" | "company") : undefined,
          bankName: opt(r.bankName),
          accountName: opt(r.accountName),
          accountNumber: opt(r.accountNumber),
          branch: opt(r.branch),
        },
        name: propertyName,
        address: text(r.propertyAddress) || propertyName,
        kind: (kindRaw || "residential") as "residential" | "commercial",
        feePct: fee ?? 0,
        managerEmail: opt(r.managerEmail),
        units: [],
      };
      byName.set(key, prop);
      order.push(key);
    }

    if (prop.units.some((u) => u.label.toLowerCase() === unitLabel.toLowerCase())) {
      return err(`${propertyName} has unit "${unitLabel}" twice`);
    }
    const beds = num(r.bedrooms);
    if (beds !== undefined && (isNaN(beds) || beds < 0)) return err("Bedrooms must be a number");
    const unit: ImportProperty["units"][number] = { label: unitLabel, bedrooms: beds };

    const tenantName = text(r.tenantName);
    const hasLease = [r.tenantName, r.leaseStart, r.leaseEnd, r.rent].some((x) => text(x) !== "");
    if (hasLease) {
      if (!tenantName) return err("Tenant name is missing");
      const startDate = parseDateCell(r.leaseStart);
      const endDate = parseDateCell(r.leaseEnd);
      if (!startDate) return err("Lease start is not a valid date");
      if (!endDate) return err("Lease end is not a valid date");
      if (endDate <= startDate) return err("Lease end must be after lease start");
      const rent = num(r.rent);
      if (rent === undefined || isNaN(rent) || rent <= 0) return err("Monthly rent must be more than zero");
      const cur = text(r.currency).toUpperCase();
      const currency = cur === "" || cur === "USD" ? "USD" : cur === "ZIG" ? "ZiG" : null;
      if (!currency) return err(`Currency must be USD or ZiG, not "${text(r.currency)}"`);
      const dueDay = num(r.dueDay) ?? 1;
      if (isNaN(dueDay) || dueDay < 1 || dueDay > 28 || !Number.isInteger(dueDay)) return err("Rent due day must be a whole number from 1 to 28");
      const deposit = num(r.deposit) ?? 0;
      if (isNaN(deposit) || deposit < 0) return err("Deposit must be a number");
      const heldRaw = lower(r.depositHeldIn);
      if (heldRaw && !["trust", "business", "landlord"].includes(heldRaw)) {
        return err(`Deposit held must be trust, business or landlord, not "${text(r.depositHeldIn)}"`);
      }
      const depositReceived = num(r.depositReceived);
      if (depositReceived !== undefined && (isNaN(depositReceived) || depositReceived < 0)) return err("Deposit received must be a number");
      const openingArrears = num(r.openingArrears);
      if (openingArrears !== undefined && (isNaN(openingArrears) || openingArrears < 0)) return err("Opening arrears must be a number");
      unit.lease = {
        tenant: {
          name: tenantName,
          phone: text(r.tenantPhone) || undefined,
          email: text(r.tenantEmail) || undefined,
          idNumber: text(r.tenantId) || undefined,
        },
        startDate,
        endDate,
        rent,
        currency,
        dueDay,
        deposit,
        depositHeldIn: heldRaw ? (heldRaw as "trust" | "business" | "landlord") : undefined,
        depositReceived: depositReceived || undefined,
        openingArrears: openingArrears || undefined,
      };
    }
    prop.units.push(unit);
  });

  return { properties: order.map((k) => byName.get(k)!), errors };
}

/** Split into batches for importBatch (the server takes at most 25). */
export function batches<T>(list: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
