"use client";

import { useQuery } from "convex/react";
import { DollarSign, TrendingUp, Wallet } from "lucide-react";
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
  SectionToolbar,
  BarsCard,
  KpiCard,
  COLOR,
  formatCurrencyMap,
  currencyMapTotal,
} from "./report-ui";
import type { ExportPayload } from "@/lib/report-export";

export function RevenueSummarySection({
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
  const data = useQuery(api.reports.revenueSummary, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;

  const pipelineData = data.pipelineByStage.map((s) => ({
    name: s.name,
    weighted: Math.round(currencyMapTotal(s.weightedValue)),
    estimated: Math.round(currencyMapTotal(s.estimatedValue)),
  }));

  const buildExport = (): ExportPayload => ({
    filename: `revenue-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Revenue & Pipeline",
    subtitle: periodLabel,
    summary: [
      { label: "Sales value (closed)", value: formatCurrencyMap(data.salesValue) },
      { label: "Commission earned", value: formatCurrencyMap(data.commission) },
      { label: "Forecast (open pipeline)", value: formatCurrencyMap(data.forecast) },
    ],
    tables: [
      {
        name: "Pipeline by stage",
        columns: [
          { key: "name", label: "Stage" },
          { key: "openCount", label: "Open" },
          { key: "winProbabilityText", label: "Win %" },
          { key: "estimatedText", label: "Estimated" },
          { key: "weightedText", label: "Weighted" },
        ],
        rows: data.pipelineByStage.map((s) => ({
          name: s.name,
          openCount: s.openCount,
          winProbabilityText: s.winProbability !== null ? `${s.winProbability}%` : "-",
          estimatedText: formatCurrencyMap(s.estimatedValue),
          weightedText: formatCurrencyMap(s.weightedValue),
        })),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Revenue & pipeline" build={buildExport} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Sales value (closed)"
          value={formatCurrencyMap(data.salesValue)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiCard
          label="Commission earned"
          value={formatCurrencyMap(data.commission)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="Forecast (open pipeline)"
          value={formatCurrencyMap(data.forecast)}
          hint="Estimated value × stage win-probability"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <BarsCard
        title="Pipeline value by stage"
        data={pipelineData}
        nameKey="name"
        bars={[
          { key: "estimated", name: "Estimated", color: COLOR.info },
          { key: "weighted", name: "Weighted forecast", color: COLOR.primary },
        ]}
      />

      <Card>
        <CardHeader>
          <h3 className="text-h3">
            Pipeline by stage
          </h3>
        </CardHeader>
        <CardContent className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Win %</TableHead>
                <TableHead className="text-right">Estimated</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pipelineByStage.map((s) => (
                <TableRow key={s.stageId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right">{s.openCount}</TableCell>
                  <TableCell className="text-right">
                    {s.winProbability !== null ? `${s.winProbability}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(s.estimatedValue)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyMap(s.weightedValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* Mobile: stacked cards instead of a horizontally scrolling table */}
        <CardContent className="space-y-3 md:hidden">
          {data.pipelineByStage.map((s) => (
            <div key={s.stageId} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
              <p className="font-medium">{s.name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {[
                  ["Open", s.openCount],
                  ["Win %", s.winProbability !== null ? `${s.winProbability}%` : "—"],
                  ["Estimated", formatCurrencyMap(s.estimatedValue)],
                  ["Weighted", formatCurrencyMap(s.weightedValue)],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2">
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="text-right tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-text-dim">
        Forecast estimates open-lead value from deal value or budget, weighted by each
        stage&apos;s win-probability (set under Admin → Stages). Sales value and commission
        are grouped by currency (no exchange-rate conversion).
      </p>
    </div>
  );
}
