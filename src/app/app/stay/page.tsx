"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Building2, FileSignature, Plus, Receipt, TriangleAlert, Upload } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useRecordPayment } from "@/components/stay/record-payment";
import { dateLabel, formatTotals, money } from "@/lib/stay/format";

export default function StayDashboardPage() {
  const data = useQuery(api.stay.dashboard.summary);
  const recent = useQuery(api.stay.payments.recent);
  const { open: recordPayment } = useRecordPayment();

  if (data === undefined) return <ListSkeleton />;

  if (data.propertyCount === 0) {
    return (
      <div className="space-y-6">
        <StayPageHeader title="SyncStay" description="Leases, rent, receipts and arrears in one place." />
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add the properties you manage with their landlord and units, or bring them in from your spreadsheet."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/app/stay/properties/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add property
                </Button>
              </Link>
              {data.isDirector && (
                <Link href="/app/stay/import">
                  <Button variant="secondary" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import from Excel
                  </Button>
                </Link>
              )}
            </div>
          }
        />
      </div>
    );
  }

  const hasArrears = Object.values(data.arrears).some((n) => (n ?? 0) > 0);

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="SyncStay"
        description={`Today is ${dateLabel(data.today)}.`}
        actions={
          <>
            <Button onClick={() => recordPayment()} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
            {data.canEditLeases && (
              <Link href="/app/stay/leases/new">
                <Button variant="secondary" className="gap-2">
                  <FileSignature className="h-4 w-4" />
                  New lease
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Rent due this month" value={formatTotals(data.rentDue)} href="/app/stay/leases" />
        <StatTile label="Collected so far" value={formatTotals(data.collected)} tone="good" href="/app/stay/payments" />
        <StatTile
          label="Total arrears"
          value={formatTotals(data.arrears)}
          hint={`${data.tenantsInArrears} tenant${data.tenantsInArrears === 1 ? "" : "s"} owing`}
          tone={hasArrears ? "danger" : "default"}
          href="/app/stay/arrears"
        />
        <StatTile
          label="Vacant units"
          value={String(data.vacant)}
          hint={`${data.occupancyPct}% occupied, ${data.units} units, ${data.notice} on notice`}
          tone={data.vacant ? "warning" : "default"}
          href="/app/stay/reports"
        />
        <StatTile
          label="Leases expiring in 60 days"
          value={String(data.expiringCount)}
          tone={data.expiringCount ? "warning" : "default"}
          href="/app/stay/leases?expiring=60"
        />
        <StatTile label="Open maintenance requests" value={String(data.openMaintenance)} href="/app/stay/maintenance" />
        <StatTile label="Inspections due" value={String(data.inspectionsDue)} hint="Due or overdue within 7 days" href="/app/stay/inspections" />
        <StatTile label="Properties" value={String(data.propertyCount)} href="/app/stay/properties" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Leases ending soon"
          actions={
            <Link href="/app/stay/leases?expiring=60" className="text-sm text-primary-ink hover:underline">
              All
            </Link>
          }
        >
          {data.expiring.length === 0 ? (
            <p className="text-sm text-text-muted">No leases end in the next 60 days.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.expiring.map((l) => (
                <li key={l._id}>
                  <Link href={`/app/stay/leases/${l._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-row-hover">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.tenantName}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {l.propertyName}, {l.unitLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-text-muted">{dateLabel(l.endDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Recent payments"
          actions={
            <Link href="/app/stay/payments" className="text-sm text-primary-ink hover:underline">
              All
            </Link>
          }
        >
          {recent === undefined ? (
            <p className="text-sm text-text-muted">Loading...</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-text-muted">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.tenantName}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {p.receiptNumber}, {dateLabel(p.paidOn)}, {p.unit}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-medium ${p.reversed ? "text-text-muted line-through" : ""}`}>
                    {money(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {hasArrears && (
        <Link href="/app/stay/arrears" className="flex items-center gap-2 rounded-[12px] border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {data.tenantsInArrears} tenant{data.tenantsInArrears === 1 ? " is" : "s are"} behind with rent. Open the arrears list.
        </Link>
      )}
    </div>
  );
}
