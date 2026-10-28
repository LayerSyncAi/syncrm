"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { FileBarChart, FileDown, FileSpreadsheet } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/components/worth/comparable-filters";
import { Field, PageHeader, Tabs, worthToast } from "@/components/worth/ui";
import { exportReportPdf, type ExportColumn } from "@/lib/report-export";
import { downloadXlsx } from "@/lib/worth/export";
import { ageBucket, fmtDays, turnaroundBy, workByParty } from "@/lib/worth/reporting";
import {
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  addDaysIso,
  formatArea,
  formatDay,
  formatMoney,
  formatTotals,
  todayIso,
} from "@/lib/worth/format";
import type { WorthPartyType } from "../../../../../convex/worth/lib";

type ReportKey = "register" | "turnaround" | "party" | "unpaid" | "evidence";

type Built = { title: string; columns: ExportColumn[]; rows: Record<string, string | number>[] };

const STAGES = ["new", "assigned", "inspected", "draft", "in_review"] as const;

export default function WorthReportsPage() {
  const { isLoading } = useRequireAuth();
  const settings = useQuery(api.worth.settings.get);
  const [report, setReport] = React.useState<ReportKey>("register");
  const [from, setFrom] = React.useState(addDaysIso(todayIso(), -90));
  const [to, setTo] = React.useState(todayIso());
  const [suburb, setSuburb] = React.useState("");
  const [turnBy, setTurnBy] = React.useState<"valuerName" | "clientName">("valuerName");
  const dSuburb = useDebouncedValue(suburb, 300);
  const seesEvidence = settings?.caps.seesEvidence ?? false;

  const reg = useQuery(api.worth.reports.register, settings && report !== "evidence" ? { from, to } : "skip");
  const ev = useQuery(api.worth.reports.evidence, seesEvidence && report === "evidence" ? { suburb: dSuburb, from, to } : "skip");

  const built: Built | null = React.useMemo(() => {
    if (report === "evidence") {
      if (!ev) return null;
      return {
        title: `Evidence${dSuburb ? `: ${dSuburb}` : ""}`,
        columns: [
          { key: "date", label: "Date" },
          { key: "kind", label: "Kind" },
          { key: "address", label: "Address" },
          { key: "suburb", label: "Suburb" },
          { key: "type", label: "Type" },
          { key: "land", label: "Land" },
          { key: "building", label: "Building" },
          { key: "amount", label: "Price, value or rent" },
        ],
        rows: ev.map((c) => ({
          date: formatDay(c.date),
          kind: c.kind === "sale" ? "Sale" : c.kind === "rental" ? "Rental" : "Valuation",
          address: c.address,
          suburb: c.suburb,
          type: c.propertyType,
          land: formatArea(c.landSizeM2),
          building: formatArea(c.buildingSizeM2),
          amount: c.price ? formatMoney(c.price, c.currency) : c.rent ? `${formatMoney(c.rent, c.currency)} pm` : "-",
        })),
      };
    }
    if (!reg) return null;
    if (report === "register") {
      return {
        title: "Instruction register",
        columns: [
          { key: "reference", label: "Reference" },
          { key: "received", label: "Received" },
          { key: "client", label: "Client" },
          { key: "purpose", label: "Purpose" },
          { key: "property", label: "Property" },
          { key: "valuer", label: "Valuer" },
          { key: "status", label: "Status" },
          { key: "fee", label: "Fee" },
          { key: "paid", label: "Paid" },
        ],
        rows: reg.register.map((r) => ({
          reference: r.reference,
          received: formatDay(r.receivedDate),
          client: r.clientName,
          purpose: PURPOSE_LABELS[r.purpose],
          property: `${r.propertyAddress}, ${r.suburb}`,
          valuer: r.valuerName || "-",
          status: STATUS_LABELS[r.status],
          fee: formatMoney(r.fee, r.currency),
          paid: r.paid ? "Yes" : r.invoiced ? "Invoiced" : "No",
        })),
      };
    }
    if (report === "turnaround") {
      const groups = turnaroundBy(reg.register, turnBy);
      return {
        title: `Turnaround by ${turnBy === "valuerName" ? "valuer" : "client"}`,
        columns: [
          { key: "key", label: turnBy === "valuerName" ? "Valuer" : "Client" },
          { key: "jobs", label: "Jobs" },
          { key: "issued", label: "Issued" },
          { key: "avg", label: "Average days to issue" },
          ...STAGES.map((s) => ({ key: s, label: `Days ${STATUS_LABELS[s].toLowerCase()}` })),
        ],
        rows: groups.map((g) => ({
          key: g.key,
          jobs: g.jobs,
          issued: g.issued,
          avg: fmtDays(g.averageDays),
          ...Object.fromEntries(STAGES.map((s) => [s, fmtDays(g.stageDays[s])])),
        })),
      };
    }
    if (report === "party") {
      return {
        title: "Work by instructing party",
        columns: [
          { key: "client", label: "Instructing party" },
          { key: "type", label: "Type" },
          { key: "jobs", label: "Jobs" },
          { key: "issued", label: "Issued" },
          { key: "fees", label: "Fees" },
          { key: "unpaid", label: "Unpaid" },
        ],
        rows: workByParty(reg.register).map((g) => ({
          client: g.clientName,
          type: PARTY_LABELS[g.partyType as WorthPartyType] ?? g.partyType,
          jobs: g.jobs,
          issued: g.issued,
          fees: formatTotals(g.fees),
          unpaid: formatTotals(g.unpaid),
        })),
      };
    }
    return {
      title: "Unpaid fees",
      columns: [
        { key: "reference", label: "Reference" },
        { key: "client", label: "Client" },
        { key: "issued", label: "Issued" },
        { key: "age", label: "Age (days)" },
        { key: "bucket", label: "Age band" },
        { key: "fee", label: "Fee" },
      ],
      rows: reg.unpaid.map((u) => ({
        reference: u.reference,
        client: u.clientName,
        issued: formatDay(u.issuedDate),
        age: u.ageDays,
        bucket: ageBucket(u.ageDays),
        fee: formatMoney(u.fee, u.currency),
      })),
    };
  }, [report, reg, ev, turnBy, dSuburb]);

  if (isLoading || settings === undefined) return <ListSkeleton />;

  const subtitle = report === "unpaid" ? `As at ${formatDay(todayIso())}` : `${formatDay(from)} to ${formatDay(to)}`;
  const filename = `worth-${report}-${todayIso()}`;

  const exportPdf = () =>
    built &&
    exportReportPdf({ filename, title: built.title, subtitle, tables: [{ name: built.title, columns: built.columns, rows: built.rows }] }).catch(
      (e) => worthToast.failed(e)
    );
  const exportXlsx = () =>
    built &&
    downloadXlsx(filename, [
      { name: built.title, headers: built.columns.map((c) => c.label), rows: built.rows.map((r) => built.columns.map((c) => r[c.key] ?? "")) },
    ]).catch((e) => worthToast.failed(e));

  const tabs: Array<{ key: ReportKey; label: string }> = [
    { key: "register", label: "Instruction register" },
    { key: "turnaround", label: "Turnaround" },
    { key: "party", label: "By instructing party" },
    { key: "unpaid", label: "Unpaid fees" },
    ...(seesEvidence ? [{ key: "evidence" as ReportKey, label: "Evidence" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Valuation reports"
        description={settings.caps.seesAllJobs ? "Every job in the agency." : "Your jobs."}
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf} disabled={!built || built.rows.length === 0}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="secondary" onClick={exportXlsx} disabled={!built || built.rows.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </>
        }
      />
      <Tabs tabs={tabs} value={report} onChange={setReport} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {report !== "unpaid" && (
          <>
            <Field label={report === "evidence" ? "From" : "Received from"}>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </>
        )}
        {report === "evidence" && (
          <Field label="Suburb">
            <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="All suburbs" />
          </Field>
        )}
        {report === "turnaround" && (
          <Field label="Group by">
            <div className="flex gap-1.5">
              {(["valuerName", "clientName"] as const).map((k) => (
                <Button key={k} size="sm" variant={turnBy === k ? "primary" : "secondary"} className="h-10 flex-1" onClick={() => setTurnBy(k)}>
                  {k === "valuerName" ? "Valuer" : "Client"}
                </Button>
              ))}
            </div>
          </Field>
        )}
      </div>

      {built === null ? (
        <ListSkeleton />
      ) : built.rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="Nothing to report" description="Try a wider date range." />
      ) : (
        <Table>
          <thead>
            <tr>
              {built.columns.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">
                  {c.label}
                </TableHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {built.rows.map((r, i) => (
              <TableRow key={i}>
                {built.columns.map((c) => (
                  <TableCell key={c.key} className="whitespace-nowrap text-sm">
                    {r[c.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
