"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { FileSignature, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StayPageHeader } from "@/components/stay/page-header";
import { LeaseStatusBadge } from "@/components/stay/badges";
import { dateLabel, money } from "@/lib/stay/format";

type Status = "active" | "ended" | "renewed" | "all";

function LeasesList() {
  const router = useRouter();
  const params = useSearchParams();
  const expiringParam = params.get("expiring");
  const [status, setStatus] = React.useState<Status>("active");
  const [expiring, setExpiring] = React.useState<string>(expiringParam ?? "");
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const leases = useQuery(api.stay.leases.list, {
    status: expiring ? "active" : status,
    q: debounced || undefined,
    expiringWithinDays: expiring ? Number(expiring) : undefined,
  });

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Leases"
        description="Every tenancy: who rents which unit, for how long and at what rent."
        actions={
          <Link href="/app/stay/leases/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New lease
            </Button>
          </Link>
        }
      />

      <div className="grid gap-3 rounded-[12px] border border-border-strong bg-card-bg p-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Search</Label>
          <Input placeholder="Tenant, property, unit, landlord" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} disabled={!!expiring} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="renewed">Renewed</option>
            <option value="all">All</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Ending within</Label>
          <Select value={expiring} onChange={(e) => setExpiring(e.target.value)}>
            <option value="">Any time</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </Select>
        </div>
      </div>

      {leases === undefined ? (
        <ListSkeleton />
      ) : leases.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={debounced || expiring ? "No matching leases" : "No leases yet"}
          description={debounced || expiring ? "Try a different search or filter." : "Create a lease when you let a unit."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <TableRow key={l._id} className="cursor-pointer" onClick={() => router.push(`/app/stay/leases/${l._id}`)}>
                    <TableCell className="font-medium">{l.tenantName}</TableCell>
                    <TableCell>
                      {l.propertyName}, {l.unitLabel}
                      <div className="text-xs text-text-muted">{l.landlordName}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dateLabel(l.startDate)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {dateLabel(l.moveOutDate ?? l.endDate)}
                      {l.status === "active" && l.daysToEnd >= 0 && l.daysToEnd <= 60 && (
                        <div className="text-xs text-[var(--status-warning-fg)]">in {l.daysToEnd} days</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(l.rentAmount, l.currency)}</TableCell>
                    <TableCell>
                      <LeaseStatusBadge status={l.status} notice={!!l.noticeGivenOn} />
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {leases.map((l) => (
              <Link key={l._id} href={`/app/stay/leases/${l._id}`} className="block rounded-[12px] border border-border-strong bg-card-bg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.tenantName}</p>
                    <p className="truncate text-sm text-text-muted">
                      {l.propertyName}, {l.unitLabel}
                    </p>
                  </div>
                  <LeaseStatusBadge status={l.status} notice={!!l.noticeGivenOn} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-text-muted">
                    {dateLabel(l.startDate)} to {dateLabel(l.moveOutDate ?? l.endDate)}
                  </span>
                  <span className="font-medium">{money(l.rentAmount, l.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function LeasesPage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <LeasesList />
    </React.Suspense>
  );
}
