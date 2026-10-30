"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlarmClock, CalendarClock, ClipboardList, Coins, Plus, Timer } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { PhoneMainAction } from "@/components/ui/phone-main-action";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";
import { InstructionForm } from "@/components/worth/instruction-form";
import { DueText, Section, StatTile, StatusBadge } from "@/components/worth/ui";
import { OPEN_STATUSES, type WorthStatus } from "../../../../convex/worth/lib";
import { STATUS_LABELS, formatNumber, formatTotals } from "@/lib/worth/format";

type Row = {
  _id: string;
  reference: string;
  propertyAddress: string;
  clientName: string;
  status: WorthStatus;
  dueDate: string;
  valuerName: string | null;
  dueFlag: "overdue" | "due_soon" | null;
};

function JobList({ rows, empty, inspect }: { rows: Row[]; empty: string; inspect?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((j) => (
        <li key={j._id} className="flex items-center justify-between gap-3 py-2.5">
          <Link href={`/app/worth/jobs/${j._id}`} className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{j.propertyAddress}</p>
            <p className="truncate text-xs text-text-muted">
              {j.reference} · {j.clientName}
              {j.valuerName && !inspect ? ` · ${j.valuerName}` : ""}
            </p>
          </Link>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            <DueText dueDate={j.dueDate} flag={j.dueFlag} />
            {inspect && (j.status === "assigned" || j.status === "new") ? (
              <Link href={`/app/worth/jobs/${j._id}?tab=inspection`}>
                <Button size="sm" className="h-7">
                  Start inspection
                </Button>
              </Link>
            ) : (
              <StatusBadge status={j.status} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The valuer's next job, large, with the button to start it. */
function NextJob({ job }: { job: Row }) {
  const canStart = job.status === "assigned" || job.status === "new";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-eyebrow text-text-muted">Your next job</p>
        <Link href={`/app/worth/jobs/${job._id}`} className="block text-h2 hover:underline">
          {job.propertyAddress}
        </Link>
        <p className="text-sm text-text-muted">
          {job.reference} · {job.clientName} · due <DueText dueDate={job.dueDate} flag={job.dueFlag} />
        </p>
      </div>
      {canStart ? (
        <Link href={`/app/worth/jobs/${job._id}?tab=inspection`}>
          <Button>Start inspection</Button>
        </Link>
      ) : (
        <StatusBadge status={job.status} />
      )}
    </Card>
  );
}

export default function WorthDashboardPage() {
  const { isLoading } = useRequireAuth();
  const data = useQuery(api.worth.dashboard.overview);
  const [creating, setCreating] = React.useState(false);

  if (isLoading || data === undefined) return <ListSkeleton />;
  const { caps, fees } = data;
  const feesOnly = !caps.seesValues;
  const overdue = data.overdue.length;
  const dueSoon = data.dueThisWeek.length;
  const summary = feesOnly
    ? fees.unpaidCount
      ? `${formatTotals(fees.unpaid)} in fees is unpaid across ${fees.unpaidCount} job${fees.unpaidCount === 1 ? "" : "s"}.`
      : "Every issued valuation fee is paid."
    : `${data.openCount} open job${data.openCount === 1 ? "" : "s"}. ` +
      (overdue ? `${overdue} ${overdue === 1 ? "is" : "are"} overdue` : "Nothing is overdue") +
      `, and ${dueSoon} ${dueSoon === 1 ? "is" : "are"} due this week.`;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow={today}
        title="Valuations"
        summary={summary}
        actions={
          <>
            {caps.canWorkAssigned && !caps.canAdmin && (
              <Link href="/app/worth/settings">
                <Button variant="secondary">My valuer profile</Button>
              </Link>
            )}
            {caps.canManageJobs && (
              <Button onClick={() => setCreating(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Log instruction
              </Button>
            )}
          </>
        }
      />

      {!feesOnly && data.myJobs.length > 0 && <NextJob job={data.myJobs[0]} />}
      {!feesOnly && data.myJobs.length > 1 && (
        <Section title="My other jobs" description="By due date.">
          <JobList rows={data.myJobs.slice(1)} empty="" inspect />
        </Section>
      )}

      {!feesOnly && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open jobs" value={data.openCount} icon={ClipboardList} href="/app/worth/jobs" />
          <StatTile
            label="Overdue"
            value={data.overdue.length}
            icon={AlarmClock}
            tone={data.overdue.length ? "warning" : "good"}
          />
          <StatTile label="Due this week" value={data.dueThisWeek.length} icon={CalendarClock} />
          <StatTile
            label="Average turnaround"
            value={data.averageTurnaroundDays === null ? "-" : `${formatNumber(data.averageTurnaroundDays, 1)} days`}
            hint={`Instruction to issue, last 90 days (${data.turnaroundSample} jobs)`}
            icon={Timer}
          />
        </div>
      )}

      {(caps.seesAllJobs || caps.canManageFees) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Fees issued this month" value={formatTotals(fees.issuedThisMonth)} icon={Coins} />
          <StatTile label="Invoiced this month" value={formatTotals(fees.invoicedThisMonth)} icon={Coins} />
          <StatTile
            label="Unpaid fees"
            value={formatTotals(fees.unpaid)}
            hint={`${fees.unpaidCount} job${fees.unpaidCount === 1 ? "" : "s"}`}
            tone={fees.unpaidCount ? "warning" : "default"}
            icon={Coins}
            href="/app/worth/reports"
          />
        </div>
      )}

      {!feesOnly && (
        <>
          <Section title="Status run" description="Open jobs at each step, from instruction to sign-off.">
            {/* One row of steps; scrolls sideways on phones. */}
            <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
              {OPEN_STATUSES.map((s, i) => {
                const n = data.byStatus[s] ?? 0;
                return (
                  <li
                    key={s}
                    className={`min-w-[120px] flex-1 rounded-[16px] border px-4 py-3 ${n ? "border-border bg-card-bg" : "border-transparent bg-surface-2"}`}
                  >
                    <p className="text-[11px] font-medium text-text-dim">{s === "on_hold" ? "Paused" : `Step ${i + 1}`}</p>
                    <p className="text-2xl font-light tabular-nums tracking-[-0.03em]">{n}</p>
                    <p className="truncate text-xs text-text-muted">{STATUS_LABELS[s]}</p>
                  </li>
                );
              })}
            </ol>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Overdue">
              <JobList rows={data.overdue} empty="Nothing overdue." />
            </Section>
            <Section title="Due this week">
              <JobList rows={data.dueThisWeek} empty="Nothing due in the next seven days." />
            </Section>
          </div>

          {data.workload.length > 0 && (
            <Section title="Workload per valuer">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Valuer</TableHead>
                    <TableHead className="text-right">Open jobs</TableHead>
                    <TableHead className="text-right">Issued this month</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.map((w) => (
                    <TableRow key={w.userId}>
                      <TableCell>{w.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.open}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.issuedThisMonth}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}
        </>
      )}

      {caps.canManageJobs && <PhoneMainAction label="Log instruction" icon={Plus} onClick={() => setCreating(true)} />}
      <InstructionForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
