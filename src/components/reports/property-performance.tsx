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
  formatCurrencyMap,
} from "./report-ui";
import { MarketingSpendModal } from "./marketing-spend-modal";

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
}: {
  start: number;
  end: number;
  ownerUserId?: Id<"users">;
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

  return (
    <div className="space-y-6">
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Property engagement
              </h3>
            </CardHeader>
            <CardContent className="overflow-x-auto">
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
