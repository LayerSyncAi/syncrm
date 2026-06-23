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
  COLOR,
  formatCurrencyMap,
} from "./report-ui";
import type { ExportPayload } from "@/lib/report-export";

export function AgentPerformanceSection({
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
  const data = useQuery(api.reports.agentPerformance, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;
  if (data.rows.length === 0) {
    return <EmptyState message="No agent activity in this period." />;
  }

  const chartData = data.rows
    .slice(0, 8)
    .map((r) => ({ name: r.name, leadsAssigned: r.leadsAssigned, dealsClosed: r.dealsClosed }));

  const buildExport = (): ExportPayload => ({
    filename: `agent-performance-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Agent Performance",
    subtitle: periodLabel,
    tables: [
      {
        name: "Agent performance",
        columns: [
          { key: "name", label: "Agent" },
          { key: "leadsAssigned", label: "Assigned" },
          { key: "leadsContacted", label: "Contacted" },
          { key: "viewingsBooked", label: "Viewings" },
          { key: "offersReceived", label: "Offers" },
          { key: "dealsClosed", label: "Closed" },
          { key: "conversionRate", label: "Conversion %" },
          { key: "salesValueText", label: "Sales value" },
          { key: "commissionText", label: "Commission" },
          { key: "tasksCreated", label: "Tasks created" },
          { key: "tasksCompleted", label: "Tasks completed" },
          { key: "tasksPending", label: "Tasks pending" },
          { key: "tasksOverdue", label: "Tasks overdue" },
          { key: "taskCompletionRateText", label: "Task completion %" },
        ],
        rows: data.rows.map((r) => ({
          ...r,
          salesValueText: formatCurrencyMap(r.salesValue),
          commissionText: formatCurrencyMap(r.commission),
          taskCompletionRateText: `${r.taskCompletionRate}%`,
        })),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Agent performance" build={buildExport} />
      <BarsCard
        title="Leads assigned vs deals closed"
        data={chartData}
        nameKey="name"
        bars={[
          { key: "leadsAssigned", name: "Leads assigned", color: COLOR.info },
          { key: "dealsClosed", name: "Deals closed", color: COLOR.success },
        ]}
      />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Agent performance
          </h3>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Viewings</TableHead>
                <TableHead className="text-right">Offers</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Sales value</TableHead>
                <TableHead className="text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.leadsAssigned}</TableCell>
                  <TableCell className="text-right">{r.leadsContacted}</TableCell>
                  <TableCell className="text-right">{r.viewingsBooked}</TableCell>
                  <TableCell className="text-right">{r.offersReceived}</TableCell>
                  <TableCell className="text-right">{r.dealsClosed}</TableCell>
                  <TableCell className="text-right">{r.conversionRate}%</TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(r.salesValue)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(r.commission)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-text-dim">
        Conversion = won ÷ (won + lost) for leads closed in the period. Sales value
        and commission are grouped by currency (no exchange-rate conversion).
      </p>
    </div>
  );
}
