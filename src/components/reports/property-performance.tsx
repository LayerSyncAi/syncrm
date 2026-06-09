"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  PieCard,
  KpiCard,
  SectionToolbar,
  formatCurrencyMap,
} from "./report-ui";
import { MarketingSpendModal } from "./marketing-spend-modal";
import type { ExportPayload } from "@/lib/report-export";

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  under_offer: "Under offer",
  let: "Let",
  sold: "Sold",
  off_market: "Off market",
};

export function PropertyPerformanceSection({
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
  const data = useQuery(api.reports.propertyPerformance, { start, end, ownerUserId });
  const [spendOpen, setSpendOpen] = useState(false);

  const propertyOptions = useMemo(
    () => (data?.rows ?? []).map((r) => ({ _id: r.propertyId, title: r.title })),
    [data]
  );

  if (data === undefined) return <SectionLoader />;

  const statusData = Object.entries(data.statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] ?? status,
    count,
  }));

  const buildExport = (): ExportPayload => ({
    filename: `property-performance-${periodLabel}`.replace(/\s+/g, "-"),
    title: "Property Performance",
    subtitle: periodLabel,
    summary: Object.entries(data.statusCounts).map(([status, count]) => ({
      label: STATUS_LABELS[status] ?? status,
      value: String(count),
    })),
    tables: [
      {
        name: "Property engagement",
        columns: [
          { key: "title", label: "Property" },
          { key: "status", label: "Status" },
          { key: "inquiries", label: "Inquiries" },
          { key: "viewings", label: "Viewings" },
          { key: "offers", label: "Offers" },
          { key: "daysOnMarket", label: "Days on market" },
          { key: "spendText", label: "Marketing spend" },
        ],
        rows: data.rows.map((r) => ({
          ...r,
          status: STATUS_LABELS[r.status] ?? r.status,
          spendText: formatCurrencyMap(r.spend),
        })),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <SectionToolbar title="Property performance" build={buildExport} />
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {(["available", "under_offer", "sold", "let"] as const).map((s) => (
            <KpiCard key={s} label={STATUS_LABELS[s]} value={data.statusCounts[s] ?? 0} />
          ))}
        </div>
        {data.isAdmin ? (
          <Button variant="secondary" className="ml-4 shrink-0" onClick={() => setSpendOpen(true)}>
            <Megaphone className="mr-2 h-4 w-4" />
            Log marketing spend
          </Button>
        ) : null}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState message="No properties to report on yet." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <PieCard title="Listings by status" data={statusData} nameKey="name" valueKey="count" />
          <Card>
            <CardHeader>
              <h3 className="text-h3">
                Property engagement
              </h3>
            </CardHeader>
            <CardContent className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Inq.</TableHead>
                    <TableHead className="text-right">View.</TableHead>
                    <TableHead className="text-right">Offers</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.slice(0, 30).map((r) => (
                    <TableRow key={r.propertyId}>
                      <TableCell className="max-w-[160px] truncate font-medium" title={r.title}>
                        {r.title}
                      </TableCell>
                      <TableCell className="text-right">{r.inquiries}</TableCell>
                      <TableCell className="text-right">{r.viewings}</TableCell>
                      <TableCell className="text-right">{r.offers}</TableCell>
                      <TableCell className="text-right">{r.daysOnMarket}</TableCell>
                      <TableCell className="text-right">{formatCurrencyMap(r.spend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>

            {/* Mobile: stacked cards instead of a horizontally scrolling table */}
            <CardContent className="space-y-3 md:hidden">
              {data.rows.slice(0, 30).map((r) => (
                <div key={r.propertyId} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
                  <p className="truncate font-medium" title={r.title}>{r.title}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      ["Inquiries", r.inquiries],
                      ["Viewings", r.viewings],
                      ["Offers", r.offers],
                      ["Days on market", r.daysOnMarket],
                      ["Spend", formatCurrencyMap(r.spend)],
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
        </div>
      )}

      <p className="text-xs text-text-dim">
        Days on market is approximate: from listing creation to the last update for
        sold/let listings, otherwise to today.
      </p>

      <MarketingSpendModal
        open={spendOpen}
        onClose={() => setSpendOpen(false)}
        properties={propertyOptions}
      />
    </div>
  );
}
