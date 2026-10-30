/**
 * SyncStay report definitions: turn query results into columns, rows and a
 * summary. The same six reports and columns as src/app/app/stay/reports.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { AGE_BUCKET_LABELS, dateLabel, formatTotals, heldInLabel, methodLabel, money, UNIT_STATUS_LABELS, type CurrencyTotals, type StayCurrency } from "@/lib/stay/format";
import type { ReportPayload } from "./pdf";

export type ReportKey = "rent_roll" | "arrears" | "vacancy" | "expiry" | "deposits" | "payments";

export const REPORTS: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: "rent_roll", label: "Rent roll", description: "Every let unit with its tenant, lease dates and monthly rent." },
  { key: "arrears", label: "Arrears by age", description: "Tenants owing money, split by days overdue." },
  { key: "vacancy", label: "Vacancy list", description: "Vacant units and units where the tenant has given notice." },
  { key: "expiry", label: "Lease expiry", description: "Active leases ending soon." },
  { key: "deposits", label: "Deposits held", description: "Deposits currently held, by property and landlord." },
  { key: "payments", label: "Payments received", description: "Payments by payment date. Reversed payments are left out." },
];

/** A column: "money" cells hold an amount and read their currency from the row. */
export type Col = { key: string; label: string; kind?: "money" | "date" | "number"; currencyKey?: string };
export type ReportRow = Record<string, string | number | null | undefined>;
export type Built = {
  columns: Col[];
  rows: ReportRow[];
  summary: Array<{ label: string; value: string }>;
  extra?: Array<{ name: string; columns: Col[]; rows: ReportRow[] }>;
};

export type ReportData = {
  units?: FunctionReturnType<typeof api.stay.reports.units>;
  arrears?: FunctionReturnType<typeof api.stay.arrears.list>;
  expiry?: FunctionReturnType<typeof api.stay.leases.list>;
  deposits?: FunctionReturnType<typeof api.stay.deposits.list>;
  payments?: FunctionReturnType<typeof api.stay.payments.list>;
  expiryDays: number;
};

export function display(row: ReportRow, c: Col): string {
  const v = row[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "money") return money(Number(v), (row[c.currencyKey ?? "currency"] as StayCurrency) ?? "USD");
  if (c.kind === "date") return dateLabel(String(v));
  return String(v);
}

const add = (t: CurrencyTotals, c: StayCurrency, n: number) => {
  t[c] = Math.round(((t[c] ?? 0) + n) * 100) / 100;
};

export function buildReport(report: ReportKey, d: ReportData): Built | undefined {
  switch (report) {
    case "rent_roll": {
      if (!d.units) return undefined;
      const units = d.units;
      const let_ = units.filter((u) => u.leaseId);
      const total: CurrencyTotals = {};
      for (const u of let_) if (u.currency && u.rentAmount) add(total, u.currency, u.rentAmount);
      return {
        columns: [
          { key: "propertyName", label: "Property" },
          { key: "unitLabel", label: "Unit" },
          { key: "tenantName", label: "Tenant" },
          { key: "landlordName", label: "Landlord" },
          { key: "startDate", label: "Start", kind: "date" },
          { key: "endDate", label: "End", kind: "date" },
          { key: "status", label: "Status" },
          { key: "currency", label: "Currency" },
          { key: "rentAmount", label: "Monthly rent", kind: "money" },
        ],
        rows: let_.map((u) => ({ ...u, status: UNIT_STATUS_LABELS[u.status] ?? u.status }) as ReportRow),
        summary: [
          { label: "Let units", value: `${let_.length} of ${units.length}` },
          { label: "Monthly rent roll", value: formatTotals(total) },
        ],
      };
    }
    case "vacancy": {
      if (!d.units) return undefined;
      const units = d.units;
      return {
        columns: [
          { key: "propertyName", label: "Property" },
          { key: "unitLabel", label: "Unit" },
          { key: "bedrooms", label: "Bedrooms", kind: "number" },
          { key: "status", label: "Status" },
          { key: "tenantName", label: "Tenant on notice" },
          { key: "vacantSince", label: "Vacant since", kind: "date" },
          { key: "vacantDays", label: "Days vacant", kind: "number" },
          { key: "managerName", label: "Manager" },
        ],
        rows: units
          .filter((u) => u.status !== "occupied")
          .map((u) => ({ ...u, status: UNIT_STATUS_LABELS[u.status] ?? u.status, tenantName: u.status === "notice" ? u.tenantName : "" }) as ReportRow),
        summary: [
          { label: "Vacant units", value: String(units.filter((u) => u.status === "vacant").length) },
          { label: "Notice given", value: String(units.filter((u) => u.status === "notice").length) },
          { label: "Total units", value: String(units.length) },
        ],
      };
    }
    case "arrears": {
      if (!d.arrears) return undefined;
      const a = d.arrears;
      return {
        columns: [
          { key: "tenantName", label: "Tenant" },
          { key: "property", label: "Property" },
          { key: "landlordName", label: "Landlord" },
          { key: "managerName", label: "Manager" },
          { key: "daysOverdue", label: "Days overdue", kind: "number" },
          { key: "currency", label: "Currency" },
          { key: "b0", label: AGE_BUCKET_LABELS["0_30"], kind: "money" },
          { key: "b31", label: AGE_BUCKET_LABELS["31_60"], kind: "money" },
          { key: "b61", label: AGE_BUCKET_LABELS["61_90"], kind: "money" },
          { key: "b90", label: AGE_BUCKET_LABELS["90_plus"], kind: "money" },
          { key: "total", label: "Total", kind: "money" },
        ],
        rows: a.rows.map((r) => ({
          tenantName: r.tenantName,
          property: `${r.propertyName}, ${r.unitLabel}`,
          landlordName: r.landlordName,
          managerName: r.managerName ?? "",
          daysOverdue: r.daysOverdue,
          currency: r.currency,
          b0: r.buckets["0_30"],
          b31: r.buckets["31_60"],
          b61: r.buckets["61_90"],
          b90: r.buckets["90_plus"],
          total: r.total,
        })),
        summary: [
          { label: "Tenants in arrears", value: String(a.rows.length) },
          { label: "Total arrears", value: formatTotals(a.totals) },
          ...(Object.keys(AGE_BUCKET_LABELS) as Array<keyof typeof AGE_BUCKET_LABELS>).map((b) => ({ label: AGE_BUCKET_LABELS[b], value: formatTotals(a.bucketTotals[b]) })),
        ],
      };
    }
    case "expiry": {
      if (!d.expiry) return undefined;
      return {
        columns: [
          { key: "tenantName", label: "Tenant" },
          { key: "property", label: "Property" },
          { key: "landlordName", label: "Landlord" },
          { key: "managerName", label: "Manager" },
          { key: "endDate", label: "Ends", kind: "date" },
          { key: "daysToEnd", label: "Days left", kind: "number" },
          { key: "notice", label: "Notice" },
          { key: "currency", label: "Currency" },
          { key: "rentAmount", label: "Monthly rent", kind: "money" },
        ],
        rows: d.expiry.map((l) => ({
          tenantName: l.tenantName,
          property: `${l.propertyName}, ${l.unitLabel}`,
          landlordName: l.landlordName,
          managerName: l.managerName ?? "",
          endDate: l.endDate,
          daysToEnd: l.daysToEnd,
          notice: l.noticeGivenOn ? `Given ${dateLabel(l.noticeGivenOn)}` : "",
          currency: l.currency,
          rentAmount: l.rentAmount,
        })),
        summary: [{ label: `Leases ending within ${d.expiryDays} days`, value: String(d.expiry.length) }],
      };
    }
    case "deposits": {
      if (!d.deposits) return undefined;
      const dep = d.deposits;
      const held = dep.rows.filter((r) => r.held > 0);
      return {
        columns: [
          { key: "tenantName", label: "Tenant" },
          { key: "property", label: "Property" },
          { key: "landlordName", label: "Landlord" },
          { key: "heldIn", label: "Held in" },
          { key: "currency", label: "Currency" },
          { key: "received", label: "Received", kind: "money" },
          { key: "applied", label: "Applied", kind: "money" },
          { key: "refunded", label: "Refunded", kind: "money" },
          { key: "held", label: "Held", kind: "money" },
        ],
        rows: held.map((r) => ({
          tenantName: r.tenantName,
          property: `${r.propertyName}, ${r.unitLabel}`,
          landlordName: r.landlordName,
          heldIn: heldInLabel(r.heldIn),
          currency: r.currency,
          received: r.received,
          applied: r.applied,
          refunded: r.refunded,
          held: r.held,
        })),
        summary: [
          { label: "Deposits held", value: String(held.length) },
          { label: "Total held", value: formatTotals(dep.total) },
          ...Object.entries(dep.byHeldIn).map(([k, t]) => ({ label: heldInLabel(k), value: formatTotals(t) })),
        ],
        extra: [
          {
            name: "By property",
            columns: [
              { key: "name", label: "Property" },
              { key: "landlordName", label: "Landlord" },
              { key: "count", label: "Deposits", kind: "number" },
              { key: "total", label: "Held" },
            ],
            rows: dep.byProperty.map((p) => ({ name: p.name, landlordName: p.landlordName, count: p.count, total: formatTotals(p.totals) })),
          },
          {
            name: "By landlord",
            columns: [
              { key: "name", label: "Landlord" },
              { key: "count", label: "Deposits", kind: "number" },
              { key: "total", label: "Held" },
            ],
            rows: dep.byLandlord.map((l) => ({ name: l.name, count: l.count, total: formatTotals(l.totals) })),
          },
        ],
      };
    }
    case "payments": {
      if (!d.payments) return undefined;
      const total: CurrencyTotals = {};
      const byMethod: Record<string, CurrencyTotals> = {};
      for (const p of d.payments) {
        add(total, p.currency, p.amount);
        const m = methodLabel(p.method);
        byMethod[m] = byMethod[m] ?? {};
        add(byMethod[m], p.currency, p.amount);
      }
      return {
        columns: [
          { key: "paidOn", label: "Date", kind: "date" },
          { key: "receiptNumber", label: "Receipt" },
          { key: "tenantName", label: "Tenant" },
          { key: "property", label: "Property" },
          { key: "purpose", label: "For" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" },
          { key: "currency", label: "Currency" },
          { key: "amount", label: "Amount", kind: "money" },
        ],
        rows: d.payments.map((p) => ({
          paidOn: p.paidOn,
          receiptNumber: p.receiptNumber,
          tenantName: p.tenantName,
          property: `${p.propertyName}, ${p.unitLabel}`,
          purpose: p.purpose === "deposit" ? "Deposit" : "Rent",
          method: methodLabel(p.method),
          reference: p.reference,
          currency: p.currency,
          amount: p.amount,
        })),
        summary: [
          { label: "Payments", value: String(d.payments.length) },
          { label: "Total received", value: formatTotals(total) },
          ...Object.entries(byMethod).map(([m, t]) => ({ label: m, value: formatTotals(t) })),
        ],
      };
    }
  }
}

/**
 * The export payload. The PDF gets formatted money; the CSV gets raw numbers
 * with a currency column, as the website's Excel export does.
 */
export function reportPayload(report: ReportKey, b: Built, subtitle: string, formatted: boolean): ReportPayload {
  const label = REPORTS.find((r) => r.key === report)!.label;
  const toRows = (cols: Col[], rows: ReportRow[]) => rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, formatted ? display(r, c) : (r[c.key] ?? "")])));
  return {
    filename: `Stay_${label.replace(/\s+/g, "_")}`,
    title: label,
    subtitle,
    summary: b.summary,
    tables: [
      { name: label, columns: b.columns.map(({ key, label }) => ({ key, label })), rows: toRows(b.columns, b.rows) },
      ...(b.extra ?? []).map((t) => ({ name: t.name, columns: t.columns.map(({ key, label }) => ({ key, label })), rows: toRows(t.columns, t.rows) })),
    ],
  };
}
