"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowLeftRight, Banknote, Landmark, Wallet } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { PhoneMainAction } from "@/components/ui/phone-main-action";
import { SuggestionCard } from "@/components/ui/suggestion-card";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { ACCOUNT_TYPE_LABELS, dateLabel, money } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type Range = "week" | "month";

export default function FinanceDashboardPage() {
  const fin = useQuery(api.finance.settings.get);
  const isStaff = !!fin?.role.isStaff;
  const [range, setRange] = React.useState<Range>("month");
  const data = useQuery(api.finance.reports.dashboard, isStaff ? { range } : "skip");

  if (fin === undefined) return <ListSkeleton />;

  if (!isStaff) {
    return (
      <div className="space-y-6">
        <StayPageHeader title="SyncFinance" description="See what the agency holds for the landlords of the properties you manage." />
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Trust and landlords" value="Landlord balances and statements" href="/app/finance/trust" />
          <StatTile label="Payouts" value="What each landlord is due" href="/app/finance/payouts" />
        </div>
      </div>
    );
  }

  const toggle = (
    <div className="inline-flex rounded-full border border-border-strong bg-card-bg p-0.5" role="group" aria-label="Period">
      {(["week", "month"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            range === r ? "bg-primary-600 text-primary-foreground" : "text-text-muted hover:text-text"
          )}
        >
          {r === "week" ? "This week" : "This month"}
        </button>
      ))}
    </div>
  );

  const period = range === "week" ? "this week" : "this month";
  const awaiting = data?.payoutsAwaitingApproval ?? 0;
  const summary =
    data === undefined
      ? null
      : `${data.totals.moneyIn} in and ${data.totals.moneyOut} out ${period}, with ${data.heldInTrust} held in trust.` +
        (awaiting ? ` ${awaiting} landlord payout${awaiting === 1 ? " is" : "s are"} waiting for approval.` : "");

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow={data ? `${dateLabel(data.from)} to ${dateLabel(data.to)}` : period}
        title="Money overview"
        summary={summary}
        actions={
          <>
            <Link href="/app/finance/money">
              <Button variant="secondary" className="gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                Money in and out
              </Button>
            </Link>
            <Link href="/app/finance/money?new=in">
              <Button className="gap-2">
                <ArrowDownLeft className="h-4 w-4" />
                Money in
              </Button>
            </Link>
          </>
        }
      />

      {/* The period applies on every screen size, so it sits outside the
          desktop-only header actions. USD and ZiG are never added together. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toggle}
        <p className="text-xs text-text-muted">USD and ZiG are shown separately.</p>
      </div>

      {data === undefined ? (
        <ListSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Money in" value={data.totals.moneyIn} tone="good" hint="Excluding transfers between accounts" />
            <StatTile label="Money out" value={data.totals.moneyOut} hint="Excluding transfers between accounts" />
            <StatTile label="Balance" value={data.totals.balance} hint="All active accounts today" />
          </div>

          {awaiting > 0 && (
            <SuggestionCard
              action={
                <Link href="/app/finance/payouts" className="w-fit">
                  <Button className="gap-2">
                    <Banknote className="h-4 w-4" />
                    Review payouts
                  </Button>
                </Link>
              }
            >
              {awaiting} landlord payout{awaiting === 1 ? " is" : "s are"} waiting for approval ({data.payoutsDue} due). Landlords are
              paid once a director approves.
            </SuggestionCard>
          )}

          <Section title="Accounts">
            {data.accounts.length === 0 ? (
              <EmptyState icon={Wallet} title="No accounts yet" description="A director adds bank accounts and cash floats in Finance settings." />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Money in</TableHead>
                        <TableHead className="text-right">Money out</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((a) => (
                        <TableRow key={a._id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>
                            <Badge variant="neutral">{ACCOUNT_TYPE_LABELS[a.type]}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money(a.moneyIn, a.currency)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money(a.moneyOut, a.currency)}</TableCell>
                          <TableCell className={cn("whitespace-nowrap text-right font-semibold", a.balance < 0 && "text-danger")}>
                            {money(a.balance, a.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-semibold">{data.totals.moneyIn}</TableCell>
                        <TableCell className="text-right font-semibold">{data.totals.moneyOut}</TableCell>
                        <TableCell className="text-right font-semibold">{data.totals.balance}</TableCell>
                      </TableRow>
                    </tbody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {data.accounts.map((a) => (
                    <div key={a._id} className="rounded-[10px] border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</p>
                        </div>
                        <p className={cn("shrink-0 font-semibold", a.balance < 0 && "text-danger")}>{money(a.balance, a.currency)}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        In {money(a.moneyIn, a.currency)}, out {money(a.moneyOut, a.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Held in trust" value={data.heldInTrust} hint="Landlords, deposits, sales and developers" href="/app/finance/trust" />
            <StatTile label="Commission earned" value={data.commissionEarned} tone="good" hint={range === "week" ? "This week" : "This month"} />
            <StatTile
              label="Landlord payouts due"
              value={data.payoutsDue}
              href="/app/finance/payouts"
              tone={data.payoutsAwaitingApproval > 0 ? "warning" : "default"}
              hint={
                data.payoutsAwaitingApproval > 0
                  ? `${data.payoutsAwaitingApproval} awaiting approval`
                  : "None awaiting approval"
              }
            />
            <StatTile
              label="Unpaid invoices"
              value={data.unpaidInvoices.total}
              hint={`${data.unpaidInvoices.count} ${data.unpaidInvoices.count === 1 ? "invoice" : "invoices"}`}
              href="/app/finance/invoices"
            />
            <StatTile label="Tenant arrears" value={data.tenantArrears} tone={data.tenantArrears === "USD 0" ? "default" : "danger"} hint="Rent and charges past due" />
          </div>

          <PhoneMainAction label="Money in" icon={ArrowDownLeft} href="/app/finance/money?new=in" />

          <div className="flex flex-wrap gap-2">
            <Link href="/app/finance/trust">
              <Button variant="secondary" className="gap-2">
                <Landmark className="h-4 w-4" />
                Trust and landlords
              </Button>
            </Link>
            <Link href="/app/finance/payouts">
              <Button variant="secondary" className="gap-2">
                <Banknote className="h-4 w-4" />
                Payouts
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
