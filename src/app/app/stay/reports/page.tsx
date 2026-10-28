"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { FileBarChart, FileDown, FileSpreadsheet } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { exportReportPdf, type ExportPayload } from "@/lib/report-export";
import { exportReportXlsx } from "@/lib/stay/export";
import { StayPageHeader } from "@/components/stay/page-header";
import {
  AGE_BUCKET_LABELS,
  dateLabel,
  datePrefix,
  formatTotals,
  heldInLabel,
  methodLabel,
  money,
  todayLocal,
  UNIT_STATUS_LABELS,
  type CurrencyTotals,
  type StayCurrency,
} from "@/lib/stay/format";
import { cn } from "@/lib/utils";

type ReportKey = "rent_roll" | "arrears" | "vacancy" | "expiry" | "deposits" | "payments";

const REPORTS: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: "rent_roll", label: "Rent roll", description: "Every let unit with its tenant, lease dates and monthly rent." },
  { key: "arrears", label: "Arrears by age", description: "Tenants owing money, split by days overdue." },
  { key: "vacancy", label: "Vacancy list", description: "Vacant units and units where the tenant has given notice." },
  { key: "expiry", label: "Lease expiry", description: "Active leases ending soon." },
  { key: "deposits", label: "Deposits held", description: "Deposits currently held, by property and landlord." },
  { key: "payments", label: "Payments received", description: "Payments by payment date. Reversed payments are left out." },
];

/** A column: "money" cells hold an amount and read their currency from the row. */
type Col = { key: string; label: string; kind?: "money" | "date" | "number"; currencyKey?: string };
type Row = Record<string, string | number | null>;
type Built = { columns: Col[]; rows: Row[]; summary: Array<{ label: string; value: string }>; extra?: Array<{ name: string; columns: Col[]; rows: Row[] }> };

function display(row: Row, c: Col): string {
  const v = row[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "money") return money(Number(v), (row[c.currencyKey ?? "currency"] as StayCurrency) ?? "USD");
  if (c.kind === "date") return dateLabel(String(v));
  return String(v);
}

function firstOfMonth(): string {
  return `${todayLocal().slice(0, 7)}-01`;
}

export default function StayReportsPage() {
  const [report, setReport] = React.useState<ReportKey>("rent_roll");
  const [expiryDays, setExpiryDays] = React.useState(60);
  const [from, setFrom] = React.useState(firstOfMonth);
  const [to, setTo] = React.useState(todayLocal);
  const [busy, setBusy] = React.useState<"pdf" | "xlsx" | null>(null);

  const needsUnits = report === "rent_roll" || report === "vacancy";
  const units = useQuery(api.stay.reports.units, needsUnits ? {} : "skip");
  const arrears = useQuery(api.stay.arrears.list, report === "arrears" ? {} : "skip");
  const expiry = useQuery(api.stay.leases.list, report === "expiry" ? { status: "active", expiringWithinDays: expiryDays } : "skip");
  const deposits = useQuery(api.stay.deposits.list, report === "deposits" ? { status: "held" } : "skip");
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const payments = useQuery(api.stay.payments.list, report === "payments" && validRange ? { from, to, includeReversed: false } : "skip");

  const built: Built | undefined = React.useMemo(() => {
    switch (report) {
      case "rent_roll": {
        if (!units) return undefined;
        const let_ = units.filter((u) => u.leaseId);
        const total: CurrencyTotals = {};
        for (const u of let_) if (u.currency && u.rentAmount) total[u.currency] = (total[u.currency] ?? 0) + u.rentAmount;
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
          rows: let_.map((u) => ({ ...u, status: UNIT_STATUS_LABELS[u.status] ?? u.status })),
          summary: [
            { label: "Let units", value: `${let_.length} of ${units.length}` },
            { label: "Monthly rent roll", value: formatTotals(total) },
          ],
        };
      }
      case "vacancy": {
        if (!units) return undefined;
        const rows = units.filter((u) => u.status !== "occupied");
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
          rows: rows.map((u) => ({
            ...u,
            status: UNIT_STATUS_LABELS[u.status] ?? u.status,
            tenantName: u.status === "notice" ? u.tenantName : "",
          })),
          summary: [
            { label: "Vacant units", value: String(units.filter((u) => u.status === "vacant").length) },
            { label: "Notice given", value: String(units.filter((u) => u.status === "notice").length) },
            { label: "Total units", value: String(units.length) },
          ],
        };
      }
      case "arrears": {
        if (!arrears) return undefined;
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
          rows: arrears.rows.map((r) => ({
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
            { label: "Tenants in arrears", value: String(arrears.rows.length) },
            { label: "Total arrears", value: formatTotals(arrears.totals) },
            ...(Object.keys(AGE_BUCKET_LABELS) as Array<keyof typeof AGE_BUCKET_LABELS>).map((b) => ({
              label: AGE_BUCKET_LABELS[b],
              value: formatTotals(arrears.bucketTotals[b]),
            })),
          ],
        };
      }
      case "expiry": {
        if (!expiry) return undefined;
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
          rows: expiry.map((l) => ({
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
          summary: [{ label: `Leases ending within ${expiryDays} days`, value: String(expiry.length) }],
        };
      }
      case "deposits": {
        if (!deposits) return undefined;
        const held = deposits.rows.filter((r) => r.held > 0);
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
            { label: "Total held", value: formatTotals(deposits.total) },
            ...Object.entries(deposits.byHeldIn).map(([k, t]) => ({ label: heldInLabel(k), value: formatTotals(t) })),
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
              rows: deposits.byProperty.map((p) => ({ name: p.name, landlordName: p.landlordName, count: p.count, total: formatTotals(p.totals) })),
            },
            {
              name: "By landlord",
              columns: [
                { key: "name", label: "Landlord" },
                { key: "count", label: "Deposits", kind: "number" },
                { key: "total", label: "Held" },
              ],
              rows: deposits.byLandlord.map((l) => ({ name: l.name, count: l.count, total: formatTotals(l.totals) })),
            },
          ],
        };
      }
      case "payments": {
        if (!payments) return undefined;
        const total: CurrencyTotals = {};
        const byMethod: Record<string, CurrencyTotals> = {};
        for (const p of payments) {
          total[p.currency] = (total[p.currency] ?? 0) + p.amount;
          const m = methodLabel(p.method);
          byMethod[m] = byMethod[m] ?? {};
          byMethod[m][p.currency] = (byMethod[m][p.currency] ?? 0) + p.amount;
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
          rows: payments.map((p) => ({
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
            { label: "Payments", value: String(payments.length) },
            { label: "Total received", value: formatTotals(total) },
            ...Object.entries(byMethod).map(([m, t]) => ({ label: m, value: formatTotals(t) })),
          ],
        };
      }
    }
  }, [report, units, arrears, expiry, deposits, payments, expiryDays]);

  const meta = REPORTS.find((r) => r.key === report)!;
  const subtitle =
    report === "payments"
      ? `${dateLabel(from)} to ${dateLabel(to)}`
      : report === "expiry"
        ? `Ending within ${expiryDays} days, as at ${dateLabel(todayLocal())}`
        : `As at ${dateLabel(todayLocal())}`;

  function payload(formatted: boolean): ExportPayload {
    const b = built!;
    const toRows = (cols: Col[], rows: Row[]) =>
      rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, formatted ? display(r, c) : r[c.key] ?? ""])));
    return {
      filename: `${datePrefix()}Stay_${meta.label.replace(/\s+/g, "_")}`,
      title: meta.label,
      subtitle,
      summary: b.summary,
      tables: [
        { name: meta.label, columns: b.columns.map(({ key, label }) => ({ key, label })), rows: toRows(b.columns, b.rows) },
        ...(b.extra ?? []).map((t) => ({ name: t.name, columns: t.columns.map(({ key, label }) => ({ key, label })), rows: toRows(t.columns, t.rows) })),
      ],
    };
  }

  async function doExport(kind: "pdf" | "xlsx") {
    if (!built) return;
    setBusy(kind);
    try {
      // Excel gets raw numbers with a currency column; the PDF gets formatted money.
      if (kind === "pdf") await exportReportPdf(payload(true));
      else await exportReportXlsx(payload(false));
    } catch (e) {
      animatedToast.error("Export failed", { description: getErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Reports"
        description="Export to PDF or Excel. Amounts are shown per currency and never converted."
        actions={
          <>
            <Button variant="secondary" onClick={() => doExport("pdf")} disabled={!built || busy !== null} className="gap-2">
              <FileDown className="h-4 w-4" />
              {busy === "pdf" ? "Preparing..." : "PDF"}
            </Button>
            <Button variant="secondary" onClick={() => doExport("xlsx")} disabled={!built || busy !== null} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              {busy === "xlsx" ? "Preparing..." : "Excel"}
            </Button>
          </>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReport(r.key)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
              report === r.key ? "border-primary-600 bg-primary-600 text-white" : "border-border-strong hover:bg-surface-2"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <p className="text-sm text-text-muted">{meta.description}</p>
        {report === "expiry" && (
          <div className="mt-3 max-w-xs space-y-2">
            <Label>Ending within</Label>
            <Select value={String(expiryDays)} onChange={(e) => setExpiryDays(Number(e.target.value))}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </Select>
          </div>
        )}
        {report === "payments" && (
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {!validRange && <p className="col-span-2 text-sm text-danger">Pick a valid date range.</p>}
          </div>
        )}
      </div>

      {!built ? (
        report === "payments" && !validRange ? null : <ListSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {built.summary.map((s) => (
              <div key={s.label} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{s.label}</p>
                <p className="mt-1 font-semibold break-words">{s.value}</p>
              </div>
            ))}
          </div>
          {built.rows.length === 0 ? (
            <EmptyState icon={FileBarChart} title="Nothing to show" description="This report has no rows right now." />
          ) : (
            <ReportTable columns={built.columns} rows={built.rows} />
          )}
          {built.extra?.map((t) =>
            t.rows.length ? (
              <div key={t.name} className="space-y-2">
                <h2 className="text-base font-semibold">{t.name}</h2>
                <ReportTable columns={t.columns} rows={t.rows} />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function ReportTable({ columns, rows }: { columns: Col[]; rows: Row[] }) {
  const right = (c: Col) => c.kind === "money" || c.kind === "number";
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(right(c) && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(right(c) && "text-right whitespace-nowrap", c.kind === "date" && "whitespace-nowrap")}>
                    {display(r, c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((r, i) => (
          <div key={i} className="rounded-[12px] border border-border-strong bg-card-bg p-4 text-sm">
            <p className="font-medium">{display(r, columns[0])}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {columns.slice(1).map((c) => {
                const v = display(r, c);
                if (!v || c.key === "currency") return null;
                return (
                  <React.Fragment key={c.key}>
                    <dt className="text-text-muted">{c.label}</dt>
                    <dd className="text-right">{v}</dd>
                  </React.Fragment>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
