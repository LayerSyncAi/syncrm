"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Archive } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/components/worth/comparable-filters";
import { Field, PageHeader } from "@/components/worth/ui";
import { PURPOSE_LABELS, formatDay, formatMoney } from "@/lib/worth/format";
import type { WorthPurpose, WorthValues } from "../../../../../convex/worth/lib";

function mainValue(v: WorthValues) {
  const m = v.market ?? v.rental ?? v.insurance ?? v.forcedSale;
  if (!m) return "-";
  return `${formatMoney(m.amount, m.currency)}${!v.market && v.rental ? " pm" : ""}`;
}

export default function WorthArchivePage() {
  const { isLoading } = useRequireAuth();
  const settings = useQuery(api.worth.settings.get);
  const allowed = settings?.caps.seesEvidence ?? false;
  const [f, setF] = React.useState({ q: "", suburb: "", purpose: "" as WorthPurpose | "", from: "", to: "" });
  const d = useDebouncedValue(f, 250);
  const rows = useQuery(
    api.worth.reports.archive,
    allowed
      ? {
          q: d.q || undefined,
          suburb: d.suburb || undefined,
          purpose: d.purpose || undefined,
          from: d.from || undefined,
          to: d.to || undefined,
        }
      : "skip"
  );

  if (isLoading || settings === undefined) return <ListSkeleton />;
  if (!allowed) {
    return <EmptyState icon={Archive} title="The archive is for the valuation team" description="Ask a director if you need access." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Archive" description="Every issued valuation, searchable by reference, client, address and suburb." />

      <div className="grid grid-cols-2 gap-3 rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4 md:grid-cols-5">
        <Field label="Search" className="col-span-2 md:col-span-1">
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Reference, client, address" />
        </Field>
        <Field label="Suburb">
          <Input value={f.suburb} onChange={(e) => setF({ ...f, suburb: e.target.value })} />
        </Field>
        <Field label="Purpose">
          <Select value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value as WorthPurpose | "" })}>
            <option value="">All</option>
            {Object.entries(PURPOSE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issued from">
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
        <Field label="Issued to">
          <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </Field>
      </div>

      {rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={Archive} title="No issued valuations match" description="Issued reports appear here automatically." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Reference</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Signed by</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">
                      <Link href={`/app/worth/jobs/${r._id}?tab=report`} className="hover:underline">
                        {r.reference}
                        {r.version > 1 ? ` v${r.version}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[240px] truncate">{r.propertyAddress}</div>
                      <div className="text-xs text-text-muted">{r.suburb}</div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{r.clientName}</TableCell>
                    <TableCell className="text-sm">{PURPOSE_LABELS[r.purpose]}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDay(r.issuedDate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{mainValue(r.values)}</TableCell>
                    <TableCell className="text-sm">{r.signedBy}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Link
                key={r._id}
                href={`/app/worth/jobs/${r._id}?tab=report`}
                className="block rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4"
              >
                <p className="text-xs font-medium text-text-muted">
                  {r.reference} · {formatDay(r.issuedDate)}
                </p>
                <p className="truncate font-medium">{r.propertyAddress}</p>
                <p className="text-sm text-text-muted">
                  {r.suburb} · {mainValue(r.values)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
