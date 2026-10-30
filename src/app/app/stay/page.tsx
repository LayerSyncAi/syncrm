"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  Plus,
  Receipt,
  TriangleAlert,
  Upload,
  Wrench,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, StayPageHeader } from "@/components/stay/page-header";
import { useRecordPayment } from "@/components/stay/record-payment";
import { dateLabel, formatTotals, money } from "@/lib/stay/format";

/** Collected as a share of rent due, when both are in one currency. */
function collectedShare(due: Record<string, number | undefined>, collected: Record<string, number | undefined>): number | undefined {
  const currencies = Object.keys(due).filter((c) => (due[c] ?? 0) > 0);
  if (currencies.length !== 1) return undefined;
  const c = currencies[0];
  return (collected[c] ?? 0) / (due[c] ?? 1);
}

/** A big square shortcut for the jobs done on site, shown on phones. */
function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 text-center text-xs font-medium text-text">
      <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-border bg-card-bg shadow-[var(--shadow-card)]">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      {label}
    </Link>
  );
}

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
  const owing = data.tenantsInArrears;
  const share = collectedShare(data.rentDue, data.collected);
  const summary =
    (hasArrears
      ? `${formatTotals(data.arrears)} of rent is outstanding from ${owing} tenant${owing === 1 ? "" : "s"}.`
      : "All rent is up to date.") + ` ${formatTotals(data.collected)} collected so far this month.`;

  const stats = [
    { label: "Properties", value: data.propertyCount, hint: `${data.units} unit${data.units === 1 ? "" : "s"}`, icon: Building2, href: "/app/stay/properties" },
    { label: "Leases ending in 60 days", value: data.expiringCount, icon: CalendarClock, href: "/app/stay/leases?expiring=60" },
    { label: "Open maintenance", value: data.openMaintenance, icon: Wrench, href: "/app/stay/maintenance" },
    { label: "Inspections due in 7 days", value: data.inspectionsDue, icon: ClipboardCheck, href: "/app/stay/inspections" },
  ];

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow={dateLabel(data.today)}
        title="Lettings overview"
        summary={summary}
        actions={
          <>
            {data.canEditLeases && (
              <Link href="/app/stay/leases/new">
                <Button variant="secondary" className="gap-2">
                  <FileSignature className="h-4 w-4" />
                  New lease
                </Button>
              </Link>
            )}
            <Button onClick={() => recordPayment()} className="gap-2">
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
          </>
        }
      />

      {/* Phones: the jobs done on a site visit, one tap away. */}
      <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2 md:hidden">
        <QuickAction href="/app/stay/maintenance?new=1" icon={Wrench} label="Log repair" />
        <QuickAction href="/app/stay/inspections/new" icon={ClipboardCheck} label="Inspection" />
        <QuickAction href="/app/stay/arrears" icon={TriangleAlert} label="Arrears" />
        {data.canEditLeases ? (
          <QuickAction href="/app/stay/leases/new" icon={FileSignature} label="New lease" />
        ) : (
          <QuickAction href="/app/stay/tenants" icon={Building2} label="Tenants" />
        )}
      </nav>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile label="Rent due this month" value={formatTotals(data.rentDue)} href="/app/stay/leases" />
        <KpiTile
          label="Collected so far"
          value={formatTotals(data.collected)}
          note={share !== undefined ? `${Math.round(share * 100)}% of due` : undefined}
          meter={share}
          href="/app/stay/payments"
        />
        <KpiTile
          label="Total arrears"
          value={formatTotals(data.arrears)}
          hint={`${owing} tenant${owing === 1 ? "" : "s"} owing`}
          tone={hasArrears ? "danger" : "default"}
          href="/app/stay/arrears"
        />
        <KpiTile
          label="Occupancy"
          value={`${data.occupancyPct}%`}
          hint={`${data.vacant} vacant · ${data.notice} on notice`}
          meter={data.occupancyPct / 100}
          tone={data.vacant ? "warning" : "default"}
          href="/app/stay/reports"
        />
      </div>

      <Card className="grid grid-cols-2 divide-border p-1 md:grid-cols-4 md:divide-x">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="flex items-center gap-3 rounded-[16px] p-3 hover:bg-row-hover">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-text">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-light leading-tight tabular-nums">{s.value}</span>
                <span className="block text-xs text-text-muted">{s.hint ? `${s.label} · ${s.hint}` : s.label}</span>
              </span>
            </Link>
          );
        })}
      </Card>

      {hasArrears && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[var(--hot-soft)] px-5 py-4 text-sm text-[var(--hot-ink)]">
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {owing} tenant{owing === 1 ? " is" : "s are"} behind with rent ({formatTotals(data.arrears)}). Reminder emails go out automatically.
          </span>
          <Link href="/app/stay/arrears">
            <Button variant="secondary" size="sm">
              Open arrears
            </Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Leases ending soon"
          actions={
            <Link href="/app/stay/leases?expiring=60" className="text-sm text-primary-ink hover:underline">
              All leases
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
              All payments
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
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${p.reversed ? "text-text-muted line-through" : ""}`}>
                    {money(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

    </div>
  );
}
