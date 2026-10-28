"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Plus, UsersRound } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StayPageHeader } from "@/components/stay/page-header";
import { formatTotals, type CurrencyTotals } from "@/lib/stay/format";

function hasAmount(t: CurrencyTotals) {
  return Object.values(t).some((n) => (n ?? 0) > 0);
}

export default function StayTenantsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [status, setStatus] = React.useState<"current" | "past" | "all">("current");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const tenants = useQuery(api.stay.people.listTenants, { q: debounced || undefined, status });

  const newLease = (
    <Link href="/app/stay/leases/new">
      <Button className="h-10 gap-2">
        <Plus className="h-4 w-4" />
        New lease
      </Button>
    </Link>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader title="Tenants" description="Everyone on a lease you manage, with what they owe." actions={newLease} />

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Name, phone, email, unit" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Show</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="current">Current tenants</option>
              <option value="past">Past tenants</option>
              <option value="all">All tenants</option>
            </Select>
          </div>
          <div className="flex items-end">
            <p className="text-sm text-text-muted">
              {tenants ? `${tenants.length} tenant${tenants.length === 1 ? "" : "s"}` : "Loading..."}
            </p>
          </div>
        </div>
      </div>

      {tenants === undefined ? (
        <ListSkeleton />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={debounced ? "No matching tenants" : "No tenants yet"}
          description={debounced ? "Try a different search." : "A tenant is added when you create their lease."}
          action={!debounced ? newLease : undefined}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <TableRow key={t._id} className="cursor-pointer" onClick={() => router.push(`/app/stay/tenants/${t._id}`)}>
                    <TableCell>
                      <Link href={`/app/stay/tenants/${t._id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      {t.email && <div className="text-xs text-text-muted">{t.email}</div>}
                    </TableCell>
                    <TableCell>{t.phone || "-"}</TableCell>
                    <TableCell className="text-sm">{t.units.join("; ") || <span className="text-text-muted">No active lease</span>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {hasAmount(t.owed) ? formatTotals(t.owed) : hasAmount(t.credit) ? <span className="text-[var(--status-success-fg)]">Credit {formatTotals(t.credit)}</span> : "-"}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap ${hasAmount(t.overdue) ? "font-medium text-danger" : ""}`}>
                      {hasAmount(t.overdue) ? formatTotals(t.overdue) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {tenants.map((t) => (
              <Link
                key={t._id}
                href={`/app/stay/tenants/${t._id}`}
                className="block rounded-[12px] border border-border-strong bg-card-bg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}</p>
                    <p className="truncate text-xs text-text-muted">{t.units.join("; ") || "No active lease"}</p>
                    {t.phone && <p className="text-xs text-text-muted">{t.phone}</p>}
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {hasAmount(t.overdue) ? (
                      <>
                        <p className="font-medium text-danger">{formatTotals(t.overdue)}</p>
                        <p className="text-xs text-text-muted">overdue</p>
                      </>
                    ) : hasAmount(t.owed) ? (
                      <>
                        <p>{formatTotals(t.owed)}</p>
                        <p className="text-xs text-text-muted">balance</p>
                      </>
                    ) : (
                      <p className="text-xs text-text-muted">Up to date</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
