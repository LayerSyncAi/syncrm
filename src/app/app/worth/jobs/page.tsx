"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useRequireAuth } from "@/hooks/useAuth";
import { InstructionForm } from "@/components/worth/instruction-form";
import { DueText, Field, PageHeader, StatusBadge } from "@/components/worth/ui";
import { PURPOSE_LABELS, STATUS_LABELS, formatMoney } from "@/lib/worth/format";
import type { WorthStatus } from "../../../../../convex/worth/lib";

type StatusFilter = WorthStatus | "open" | "";

export default function WorthJobsPage() {
  const { isLoading } = useRequireAuth();
  const settings = useQuery(api.worth.settings.get);
  const caps = settings?.caps;
  const [status, setStatus] = React.useState<StatusFilter>("open");
  const [valuerId, setValuerId] = React.useState("");
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const jobs = useQuery(api.worth.jobs.list, {
    status: status || undefined,
    valuerId: (valuerId as Id<"users">) || undefined,
    q: dq || undefined,
  });
  const valuers = useQuery(api.worth.jobs.valuers, caps?.seesAllJobs ? {} : "skip");

  if (isLoading) return <ListSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Valuation jobs"
        description={caps?.seesAllJobs ? "Every instruction from log to signed report." : "Jobs assigned to you."}
        actions={
          caps?.canManageJobs && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Log instruction
            </Button>
          )
        }
      />

      <div className="grid gap-3 rounded-[12px] border border-border-strong bg-card-bg p-4 md:grid-cols-3">
        <Field label="Search">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, client, address or suburb" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="open">All open</option>
            <option value="">All</option>
            {(Object.keys(STATUS_LABELS) as WorthStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {caps?.seesAllJobs && (
          <Field label="Valuer">
            <Select value={valuerId} onChange={(e) => setValuerId(e.target.value)}>
              <option value="">All valuers</option>
              {valuers?.map((v) => (
                <option key={v.userId} value={v.userId}>
                  {v.name} ({v.openJobs} open)
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {jobs === undefined ? (
        <ListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={dq || status !== "open" ? "No matching jobs" : "No open valuations"}
          description={
            caps?.canManageJobs
              ? "Log an instruction when a bank, owner or lawyer asks for a valuation."
              : "Jobs assigned to you will appear here."
          }
        />
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
                  <TableHead>Valuer</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <TableRow key={j._id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/app/worth/jobs/${j._id}`} className="hover:underline">
                        {j.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[240px] truncate">{j.propertyAddress}</div>
                      <div className="text-xs text-text-muted">{j.suburb}</div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{j.clientName}</TableCell>
                    <TableCell className="text-sm">{PURPOSE_LABELS[j.purpose]}</TableCell>
                    <TableCell className="text-sm">{j.valuerName ?? <span className="text-text-dim">Unassigned</span>}</TableCell>
                    <TableCell className="text-sm">
                      <DueText dueDate={j.dueDate} flag={j.dueFlag} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatMoney(j.fee, j.currency)}
                      {j.paid && <div className="text-xs text-[var(--status-success-fg)]">Paid</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {jobs.map((j) => (
              <Link
                key={j._id}
                href={`/app/worth/jobs/${j._id}`}
                className="block rounded-[12px] border border-border-strong bg-card-bg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted">{j.reference}</p>
                    <p className="truncate font-medium">{j.propertyAddress}</p>
                    <p className="truncate text-sm text-text-muted">
                      {j.suburb} · {j.clientName}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <DueText dueDate={j.dueDate} flag={j.dueFlag} />
                  <span className="text-text-muted">{j.valuerName ?? "Unassigned"}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <InstructionForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
