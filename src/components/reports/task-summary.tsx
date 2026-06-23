"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SectionLoader,
  EmptyState,
  BarsCard,
  SectionToolbar,
  KpiCard,
  COLOR,
} from "./report-ui";
import type { ExportPayload } from "@/lib/report-export";

export function TaskSummarySection({
  start,
  end,
  ownerUserId,
  periodLabel,
}: {
  start: number;
  end: number;
  ownerUserId?: Id<"users">;
  periodLabel: string;
}) {
  const data = useQuery(api.reports.taskSummary, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;

  const { totals, byAgent } = data;
  const hasActivity =
    totals.created || totals.completed || totals.pending || totals.overdue;

  if (!hasActivity) {
    return <EmptyState message="No task activity in this period." />;
  }

  const chartData = byAgent
    .slice(0, 8)
    .map((r) => ({ name: r.name, created: r.created, completed: r.completed }));

  const buildExport = (): ExportPayload => ({
    filename: `tasks-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Task Summary",
    subtitle: periodLabel,
    summary: [
      { label: "Tasks created", value: String(totals.created) },
      { label: "Tasks completed", value: String(totals.completed) },
      { label: "Tasks pending", value: String(totals.pending) },
      { label: "Tasks overdue", value: String(totals.overdue) },
      { label: "Completion rate", value: `${totals.completionRate}%` },
    ],
    tables: [
      {
        name: "Tasks by agent",
        columns: [
          { key: "name", label: "Agent" },
          { key: "created", label: "Created" },
          { key: "completed", label: "Completed" },
          { key: "pending", label: "Pending" },
          { key: "overdue", label: "Overdue" },
          { key: "completionRateText", label: "Completion %" },
        ],
        rows: byAgent.map((r) => ({
          ...r,
          completionRateText: `${r.completionRate}%`,
        })),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Task summary" build={buildExport} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Created" value={totals.created} />
        <KpiCard label="Completed" value={totals.completed} />
        <KpiCard label="Pending" value={totals.pending} />
        <KpiCard label="Overdue" value={totals.overdue} />
        <KpiCard label="Completion rate" value={`${totals.completionRate}%`} />
      </div>

      <BarsCard
        title="Tasks created vs completed"
        data={chartData}
        nameKey="name"
        bars={[
          { key: "created", name: "Created", color: COLOR.info },
          { key: "completed", name: "Completed", color: COLOR.success },
        ]}
      />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Tasks by agent
          </h3>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAgent.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.created}</TableCell>
                  <TableCell className="text-right">{r.completed}</TableCell>
                  <TableCell className="text-right">{r.pending}</TableCell>
                  <TableCell className="text-right">{r.overdue}</TableCell>
                  <TableCell className="text-right">{r.completionRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-text-dim">
        Created and completed count tasks within the selected period. Pending and
        overdue are a current snapshot of open tasks (overdue = scheduled before
        now). Completion rate = completed ÷ (completed + pending + overdue).
      </p>
    </div>
  );
}
