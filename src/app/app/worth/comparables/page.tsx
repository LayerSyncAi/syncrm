"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { FileSpreadsheet, Landmark, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";
import { ComparableForm, type ComparableView } from "@/components/worth/comparable-form";
import { ComparableImport } from "@/components/worth/comparable-import";
import {
  ComparableFilterBar,
  emptyFilters,
  toSearchArgs,
  useDebouncedValue,
} from "@/components/worth/comparable-filters";
import { PageHeader, attempt, worthToast } from "@/components/worth/ui";
import { formatArea, formatDay, formatMoney } from "@/lib/worth/format";

const KIND = { sale: "Sale", rental: "Rental", valuation: "Valuation" } as const;
const SOURCE = { own_valuation: "Own valuation", import: "Imported", manual: "Added", crm_sale: "SynCRM deal" } as const;

function amount(c: ComparableView) {
  const parts = [];
  if (c.price) parts.push(formatMoney(c.price, c.currency));
  if (c.rent) parts.push(`${formatMoney(c.rent, c.currency)} pm`);
  return parts.join(" · ") || "-";
}

export default function ComparablesPage() {
  const { isLoading } = useRequireAuth();
  const settings = useQuery(api.worth.settings.get);
  const allowed = settings?.caps.seesEvidence ?? false;
  const [filters, setFilters] = React.useState(() => emptyFilters());
  const debounced = useDebouncedValue(filters);
  const data = useQuery(api.worth.comparables.search, allowed ? { ...toSearchArgs(debounced), limit: 300 } : "skip");
  const remove = useMutation(api.worth.comparables.remove);
  const pullCrm = useMutation(api.worth.comparables.importCrmSales);
  const [editing, setEditing] = React.useState<ComparableView | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [pulling, setPulling] = React.useState(false);

  if (isLoading || settings === undefined) return <ListSkeleton />;
  if (!allowed) {
    return <EmptyState icon={Landmark} title="Comparables are for the valuation team" description="Ask a director if you need access." />;
  }
  const canEdit = data?.canEdit ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comparables"
        description="Your agency's sales, rentals and past valuations. Every issued valuation is added automatically."
        actions={
          canEdit && (
            <>
              <Button
                variant="secondary"
                disabled={pulling}
                onClick={async () => {
                  setPulling(true);
                  await attempt(async () => {
                    const res = await pullCrm({});
                    worthToast.done(res.added ? `${res.added} closed deals added` : "No new closed deals");
                  });
                  setPulling(false);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Pull SynCRM deals
              </Button>
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                Import Excel
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add comparable
              </Button>
            </>
          )
        }
      />

      <div className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <ComparableFilterBar value={filters} onChange={setFilters} />
        <p className="mt-3 text-sm text-text-muted">
          {data ? `${data.total} match${data.total === 1 ? "" : "es"}${data.total > data.items.length ? `, showing ${data.items.length}` : ""}` : "Searching..."}
        </p>
      </div>

      {data === undefined ? (
        <ListSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No comparables found"
          description="Import your past valuations and sales from Excel, or add evidence as you find it."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Address</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Land</TableHead>
                  <TableHead className="text-right">Building</TableHead>
                  <TableHead className="text-right">Price or rent</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell>
                      <div className="max-w-[240px] truncate font-medium">{c.address}</div>
                      <div className="text-xs text-text-muted">{c.suburb}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDay(c.date)}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{KIND[c.kind]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.propertyType}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatArea(c.landSizeM2)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatArea(c.buildingSizeM2)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{amount(c)}</TableCell>
                    <TableCell className="text-sm">
                      {c.jobId && c.jobRef ? (
                        <Link href={`/app/worth/jobs/${c.jobId}`} className="hover:underline">
                          {c.jobRef}
                        </Link>
                      ) : (
                        <span title={c.sourceNote}>{SOURCE[c.source]}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && c.source !== "own_valuation" && (
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" className="h-9 w-9 p-0" aria-label="Edit" onClick={() => setEditing(c)}>
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            className="h-9 w-9 p-0"
                            aria-label="Delete"
                            onClick={() => {
                              if (window.confirm(`Delete ${c.address}?`)) void attempt(() => remove({ comparableId: c._id }), "Comparable deleted");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {data.items.map((c) => (
              <div key={c._id} className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.address}</p>
                    <p className="text-sm text-text-muted">
                      {c.suburb} · {c.propertyType} · {formatDay(c.date)}
                    </p>
                  </div>
                  <Badge variant="neutral">{KIND[c.kind]}</Badge>
                </div>
                <p className="mt-2 text-sm">
                  {amount(c)} · land {formatArea(c.landSizeM2)} · building {formatArea(c.buildingSizeM2)}
                </p>
                {canEdit && c.source !== "own_valuation" && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <ComparableForm open={adding || !!editing} editing={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      <ComparableImport open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
