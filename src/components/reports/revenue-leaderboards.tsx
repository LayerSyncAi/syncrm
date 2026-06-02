"use client";

import { useQuery } from "convex/react";
import { Trophy, DollarSign, TrendingUp, Wallet } from "lucide-react";
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
  BarsCard,
  KpiCard,
  COLOR,
  formatCurrencyMap,
  currencyMapTotal,
} from "./report-ui";

function Leaderboard({
  title,
  rows,
  format: fmt,
}: {
  title: string;
  rows: { userId: string; name: string; value: number; mixedCurrency?: boolean }[];
  format: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
          <Trophy className="h-4 w-4 text-primary" />
          {title}
        </h3>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">No data for this period</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                      i === 0
                        ? "bg-primary/15 text-primary"
                        : "bg-border text-text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {r.name}
                </span>
                <span className="font-medium">
                  {fmt(r.value)}
                  {r.mixedCurrency ? <span className="ml-1 text-xs text-text-dim">*</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function RevenueLeaderboardsSection({
  start,
  end,
  ownerUserId,
}: {
  start: number;
  end: number;
  ownerUserId?: Id<"users">;
}) {
  const data = useQuery(api.reports.revenueAndLeaderboards, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;

  const pipelineData = data.pipelineByStage.map((s) => ({
    name: s.name,
    weighted: Math.round(currencyMapTotal(s.weightedValue)),
    estimated: Math.round(currencyMapTotal(s.estimatedValue)),
  }));

  return (
    <div className="space-y-6">
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Pipeline by stage
          </h3>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
      </Card>

      {data.leaderboards ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Leaderboard
            title="Most leads managed"
            rows={data.leaderboards.leadsManaged}
            format={(v) => String(v)}
          />
          <Leaderboard
            title="Most deals closed"
            rows={data.leaderboards.dealsClosed}
            format={(v) => String(v)}
          />
          <Leaderboard
            title="Highest revenue"
            rows={data.leaderboards.revenue}
            format={(v) => Math.round(v).toLocaleString("en-US")}
          />
        </div>
      ) : null}

      <p className="text-xs text-text-dim">
        Forecast estimates open-lead value from deal value or budget, weighted by each
        stage&apos;s win-probability (set under Admin → Stages). Revenue leaderboard sums
        deal values across currencies for ranking; * marks agents with mixed currencies.
      </p>
    </div>
  );
}
