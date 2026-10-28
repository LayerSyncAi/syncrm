"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2, FileSpreadsheet, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StayPageHeader } from "@/components/stay/page-header";
import { formatTotals } from "@/lib/stay/format";

function UnitCounts({ occupied, vacant, notice, units }: { occupied: number; vacant: number; notice: number; units: number }) {
  return (
    <span className="text-sm">
      {units} unit{units === 1 ? "" : "s"}
      <span className="text-text-muted">
        {" "}
        ({occupied} let{vacant ? `, ${vacant} vacant` : ""}
        {notice ? `, ${notice} on notice` : ""})
      </span>
    </span>
  );
}

export default function StayPropertiesPage() {
  const router = useRouter();
  const hub = useQuery(api.hub.getContext);
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const rows = useQuery(api.stay.properties.list, { q: q || undefined });

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Properties"
        description="Buildings you manage for landlords, with their units and the agreed management fee."
        actions={
          <>
            {hub?.isAdmin && (
              <Link href="/app/stay/import">
                <Button variant="secondary" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Import from Excel
                </Button>
              </Link>
            )}
            <Link href="/app/stay/properties/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add property
              </Button>
            </Link>
          </>
        }
      />

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <Input placeholder="Search by name, address, landlord or manager" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q ? "No matching properties" : "No properties yet"}
          description={
            q ? "Try a different search." : "Add the first property you manage, or import your existing list from Excel."
          }
          action={
            !q ? (
              <Link href="/app/stay/properties/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add property
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Property</TableHead>
                  <TableHead>Landlord</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Rent roll</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TableRow key={r._id} className="cursor-pointer" onClick={() => router.push(`/app/stay/properties/${r._id}`)}>
                    <TableCell className="py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-text-muted">{r.address}</div>
                    </TableCell>
                    <TableCell>{r.landlordName}</TableCell>
                    <TableCell className="text-text-muted">{r.managerName ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <UnitCounts {...r} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatTotals(r.rentRoll)}</TableCell>
                    <TableCell className="text-right">{r.managementFeePct}%</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Link
                key={r._id}
                href={`/app/stay/properties/${r._id}`}
                className="block rounded-[12px] border border-border-strong bg-card-bg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="truncate text-xs text-text-muted">{r.address}</p>
                  </div>
                  <span className="shrink-0 text-sm text-text-muted">{r.managementFeePct}%</span>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <UnitCounts {...r} />
                  <p className="text-text-muted">
                    {r.landlordName}
                    {r.managerName ? ` · ${r.managerName}` : ""}
                  </p>
                  <p>{formatTotals(r.rentRoll)} a month</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
