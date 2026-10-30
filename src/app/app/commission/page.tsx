"use client";

import * as React from "react";
import { useConvex, useQuery } from "convex/react";
import { Download, HandCoins } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import { useRequireAuth } from "@/hooks/useAuth";
import { dateLabel, formatTotals, money, todayLocal, type CurrencyTotals } from "@/lib/finance/format";

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const add = (t: CurrencyTotals, c: "USD" | "ZiG", n: number) => {
  t[c] = Math.round(((t[c] ?? 0) + n) * 100) / 100;
};

function paidBadge(paid: number, unpaid: number) {
  if (unpaid <= 0) return <Badge variant="success">Paid</Badge>;
  if (paid > 0) return <Badge variant="warning">Part paid</Badge>;
  return <Badge variant="info">Unpaid</Badge>;
}

export default function MyCommissionPage() {
  const { isLoading, user } = useRequireAuth();
  const data = useQuery(api.finance.commissions.myStatement, !isLoading && user ? {} : "skip");
  const convex = useConvex();
  const pdf = useFinancePdf();

  const totals = React.useMemo(() => {
    const commission: CurrencyTotals = {};
    const mine: CurrencyTotals = {};
    const paid: CurrencyTotals = {};
    const unpaid: CurrencyTotals = {};
    for (const r of data?.rows ?? []) {
      add(commission, r.currency, r.commission);
      add(mine, r.currency, r.amount);
      add(paid, r.currency, r.paid);
      add(unpaid, r.currency, r.unpaid);
    }
    return { commission, mine, paid, unpaid };
  }, [data]);

  if (isLoading || data === undefined) return <ListSkeleton />;

  const download = () =>
    pdf(async () => {
      const b = await convex.query(api.branding.get, {});
      const currencies = (["USD", "ZiG"] as const).filter((c) => data.rows.some((r) => r.currency === c));
      return {
        agency: { name: b.orgName, phone: b.contactPhone || undefined, email: b.contactEmail || undefined },
        title: "Commission statement",
        date: dateLabel(todayLocal()),
        party: { label: "Agent", name: data.name },
        tables: [
          {
            head: ["Closed", "Client", "Property", "Commission", "Split", "Your share", "Paid", "Unpaid"],
            body: data.rows.map((r) => [
              dateLabel(day(r.closedOn)),
              r.client,
              r.property,
              money(r.commission, r.currency),
              `${r.pct}%`,
              money(r.amount, r.currency),
              money(r.paid, r.currency),
              money(r.unpaid, r.currency),
            ]),
            alignRight: [3, 4, 5, 6, 7],
          },
        ],
        totals: currencies.flatMap((c): Array<[string, string]> => [
          [`Your share (${c})`, money(totals.mine[c] ?? 0, c)],
          [`Paid (${c})`, money(totals.paid[c] ?? 0, c)],
          [`Unpaid (${c})`, money(totals.unpaid[c] ?? 0, c)],
        ]),
        notes: data.withFinance ? undefined : ["Paid status follows the commission status recorded in the CRM."],
        fileName: `Commission statement ${data.name}`,
      };
    });

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="My commission"
        description="Deals you closed, your share of the commission and what has been paid to you."
        actions={
          <Button variant="secondary" className="gap-2" onClick={download} disabled={!data.rows.length}>
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        }
      />

      {!data.withFinance && <p className="text-sm text-text-muted">Paid status follows the commission status recorded in the CRM.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Deals closed" value={String(data.rows.length)} />
        <StatTile label="Your share" value={formatTotals(totals.mine)} />
        <StatTile label="Paid to you" value={formatTotals(totals.paid)} tone="good" />
        <StatTile label="Still to be paid" value={formatTotals(totals.unpaid)} tone="warning" />
      </div>

      {data.rows.length === 0 ? (
        <EmptyState icon={HandCoins} title="No commission yet" description="Deals you close with a commission split show here." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Closed</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Your split</TableHead>
                  <TableHead className="text-right">Your share</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Unpaid</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="whitespace-nowrap">{dateLabel(day(r.closedOn))}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.client}</div>
                      {r.property && <div className="text-xs text-text-muted">{r.property}</div>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(r.commission, r.currency)}</TableCell>
                    <TableCell className="text-right">{r.pct}%</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{money(r.amount, r.currency)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(r.paid, r.currency)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(r.unpaid, r.currency)}</TableCell>
                    <TableCell>{paidBadge(r.paid, r.unpaid)}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {data.rows.map((r) => (
              <div key={r._id} className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.client}</p>
                    <p className="truncate text-xs text-text-muted">{r.property}</p>
                    <p className="text-xs text-text-muted">
                      Closed {dateLabel(day(r.closedOn))} · {r.pct}% of {money(r.commission, r.currency)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{money(r.amount, r.currency)}</p>
                    {paidBadge(r.paid, r.unpaid)}
                  </div>
                </div>
                {r.unpaid > 0 && <p className="mt-2 text-sm text-text-muted">Unpaid {money(r.unpaid, r.currency)}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4 text-sm">
            <h2 className="mb-2 font-semibold">Totals</h2>
            {(["USD", "ZiG"] as const)
              .filter((c) => data.rows.some((r) => r.currency === c))
              .map((c) => (
                <div key={c} className="flex flex-wrap justify-between gap-2 py-1">
                  <span className="font-medium">{c}</span>
                  <span className="text-text-muted">
                    Commission {money(totals.commission[c] ?? 0, c)} · your share {money(totals.mine[c] ?? 0, c)} · paid {money(totals.paid[c] ?? 0, c)} · unpaid{" "}
                    {money(totals.unpaid[c] ?? 0, c)}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
