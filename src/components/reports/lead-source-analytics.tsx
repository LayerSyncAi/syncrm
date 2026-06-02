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
import { leadSourceLabel } from "@/lib/lead-sources";
import {
  SectionLoader,
  EmptyState,
  BarsCard,
  PieCard,
  SectionToolbar,
  COLOR,
  formatCurrencyMap,
} from "./report-ui";
import type { ExportPayload } from "@/lib/report-export";

export function LeadSourceSection({
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
  const data = useQuery(api.reports.leadSourceAnalytics, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;
  if (data.bySource.length === 0) {
    return <EmptyState message="No leads or marketing spend in this period." />;
  }

  const chartData = data.bySource.map((s) => ({
    name: leadSourceLabel(s.source),
    leads: s.leads,
    conversionRate: s.conversionRate,
  }));

  const buildExport = (): ExportPayload => ({
    filename: `lead-sources-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Lead Source Analytics",
    subtitle: periodLabel,
    tables: [
      {
        name: "Lead source breakdown",
        columns: [
          { key: "sourceLabel", label: "Source" },
          { key: "leads", label: "Leads" },
          { key: "won", label: "Won" },
          { key: "conversionRate", label: "Conversion %" },
          { key: "salesValueText", label: "Sales value" },
          { key: "spendText", label: "Marketing spend" },
        ],
        rows: data.bySource.map((s) => ({
          ...s,
          sourceLabel: leadSourceLabel(s.source),
          salesValueText: formatCurrencyMap(s.salesValue),
          spendText: formatCurrencyMap(s.spend),
        })),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Lead source analytics" build={buildExport} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PieCard title="Leads by source" data={chartData} nameKey="name" valueKey="leads" />
        <BarsCard
          title="Conversion rate by source (%)"
          data={chartData}
          nameKey="name"
          bars={[{ key: "conversionRate", name: "Conversion %", color: COLOR.success }]}
        />
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Lead source breakdown
          </h3>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Sales value</TableHead>
                <TableHead className="text-right">Marketing spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bySource.map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-medium">{leadSourceLabel(s.source)}</TableCell>
                  <TableCell className="text-right">{s.leads}</TableCell>
                  <TableCell className="text-right">{s.won}</TableCell>
                  <TableCell className="text-right">{s.conversionRate}%</TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(s.salesValue)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(s.spend)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-text-dim">
        Marketing spend is matched to a source by channel name. Log spend from the
        Properties tab.
      </p>
    </div>
  );
}
