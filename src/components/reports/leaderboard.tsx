"use client";

import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  SectionLoader,
  EmptyState,
  SectionToolbar,
} from "./report-ui";
import type { ExportPayload } from "@/lib/report-export";
import { formatMoney } from "@/lib/currency";

interface Row {
  userId: string;
  name: string;
  value: number;
  mixedCurrency?: boolean;
}

function Leaderboard({
  title,
  rows,
  format: fmt,
}: {
  title: string;
  rows: Row[];
  format: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-h3">
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
                      i === 0 ? "bg-primary/15 text-primary" : "bg-border text-text-muted"
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

export function LeaderboardSection({
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
  const data = useQuery(api.reports.leaderboards, { start, end, ownerUserId });

  if (data === undefined) return <SectionLoader />;
  if (!data.available) {
    return (
      <EmptyState message="Leaderboards compare agents across the agency and are available to admins viewing all agents." />
    );
  }

  const num = (v: number) => String(v);
  // Revenue is summed across currencies for ranking; render in the default
  // currency (symbol + separators) with the mixed-currency asterisk + footnote
  // conveying the caveat.
  const money = (v: number) => formatMoney(v, "USD", { decimals: 0 });
  const pct = (v: number) => `${v}%`;

  const buildExport = (): ExportPayload => ({
    filename: `leaderboards-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Leaderboards",
    subtitle: periodLabel,
    tables: [
      {
        name: "Most leads managed",
        columns: [
          { key: "name", label: "Agent" },
          { key: "value", label: "Leads" },
        ],
        rows: data.leadsManaged,
      },
      {
        name: "Most viewings conducted",
        columns: [
          { key: "name", label: "Agent" },
          { key: "value", label: "Viewings" },
        ],
        rows: data.viewings,
      },
      {
        name: "Most deals closed",
        columns: [
          { key: "name", label: "Agent" },
          { key: "value", label: "Deals" },
        ],
        rows: data.dealsClosed,
      },
      {
        name: "Highest revenue",
        columns: [
          { key: "name", label: "Agent" },
          { key: "value", label: "Revenue (mixed currency)" },
        ],
        rows: data.revenue,
      },
      {
        name: "Highest conversion rate",
        columns: [
          { key: "name", label: "Agent" },
          { key: "value", label: "Conversion %" },
        ],
        rows: data.conversionRate,
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Leaderboards" build={buildExport} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Leaderboard title="Most leads managed" rows={data.leadsManaged} format={num} />
        <Leaderboard title="Most viewings conducted" rows={data.viewings} format={num} />
        <Leaderboard title="Most deals closed" rows={data.dealsClosed} format={num} />
        <Leaderboard title="Highest revenue" rows={data.revenue} format={money} />
        <Leaderboard title="Highest conversion rate" rows={data.conversionRate} format={pct} />
      </div>
      <p className="text-xs text-text-dim">
        Rankings reflect the selected period. Revenue sums deal values across currencies
        for ranking; * marks agents with mixed currencies.
      </p>
    </div>
  );
}
