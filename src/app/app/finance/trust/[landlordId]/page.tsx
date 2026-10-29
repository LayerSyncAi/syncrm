"use client";

import * as React from "react";
import Link from "next/link";
import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Banknote, Download, FileText, Mail } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import type { FinanceDocument } from "@/lib/finance/pdf";
import { addMonths, dateLabel, money, signed, thisMonth } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type Statement = FunctionReturnType<typeof api.finance.trust.landlordStatement>;
type StatementSection = Statement["sections"][number];

const KIND_LABELS: Record<string, string> = {
  opening: "Opening balance",
  received: "Received",
  commission: "Commission",
  expense: "Expense",
  payout: "Paid to landlord",
  deposit: "Deposit applied",
  other: "Other",
};

export default function LandlordStatementPage({ params }: { params: Promise<{ landlordId: string }> }) {
  const { landlordId } = use(params);
  const id = landlordId as Id<"contacts">;
  const [month, setMonth] = React.useState(() => addMonths(thisMonth(), -1));
  const validMonth = /^\d{4}-\d{2}$/.test(month);
  const st = useQuery(api.finance.trust.landlordStatement, validMonth ? { landlordId: id, month } : "skip");
  const fin = useQuery(api.finance.settings.get);
  const send = useMutation(api.finance.trust.sendLandlordStatements);
  const pdf = useFinancePdf();
  const [sending, setSending] = React.useState(false);

  const download = () =>
    pdf(() => {
      if (!st) return null;
      const doc: FinanceDocument = {
        agency: st.agency,
        title: "Landlord statement",
        number: st.monthLabel,
        party: { label: "Statement for", name: st.landlord.name, lines: st.landlord.email ? [st.landlord.email] : [] },
        tables: st.sections.flatMap((s) => [
          {
            title: `${s.currency} movements`,
            head: ["Date", "Item", "Property", "Amount"],
            body: s.movements.map((m) => [dateLabel(m.date), [m.number, m.description].filter(Boolean).join(" "), m.property, signed(m.amount, s.currency)]),
            alignRight: [3],
          },
          {
            title: `${s.currency} by property`,
            head: ["Property", "Rent charged", "Received", "Arrears", "Commission", "Expenses", "Paid out", "Deposit applied"],
            body: s.properties.map((p) => [
              p.name,
              money(p.charged, s.currency),
              money(p.received, s.currency),
              money(p.arrears, s.currency),
              money(p.commission, s.currency),
              money(p.expenses, s.currency),
              money(p.payouts, s.currency),
              money(p.deposit, s.currency),
            ]),
            alignRight: [1, 2, 3, 4, 5, 6, 7],
          },
        ]),
        totals: st.sections.flatMap((s) => [
          [`${s.currency} brought forward`, money(s.opening, s.currency)],
          [`${s.currency} received`, money(s.totals.received, s.currency)],
          [`${s.currency} commission`, money(s.totals.commission, s.currency)],
          [`${s.currency} expenses`, money(s.totals.expenses, s.currency)],
          [`${s.currency} paid to you`, money(s.totals.payouts, s.currency)],
          [`${s.currency} balance held`, money(s.closing, s.currency)],
        ]) as Array<[string, string]>,
        notes: st.sections.length ? undefined : [`There was no activity on this account in ${st.monthLabel}.`],
        fileName: `Statement ${st.landlord.name} ${st.month}`,
      };
      return doc;
    });

  const email = async () => {
    if (!st) return;
    setSending(true);
    try {
      const res = await send({ month, landlordIds: [id] });
      if (res.sent) animatedToast.success("Statement emailed", { description: `${st.landlord.name}, ${st.monthLabel}` });
      else animatedToast.error("Not sent", { description: "This landlord has no email address." });
    } catch (e) {
      animatedToast.error("Could not email the statement", { description: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const isStaff = !!fin?.role.isStaff;

  return (
    <div className="space-y-6">
      <StayPageHeader
        back={{ href: "/app/finance/trust", label: "Trust and landlords" }}
        title={st ? st.landlord.name : "Landlord statement"}
        description={st ? `Statement for ${st.monthLabel}${st.landlord.email ? `. ${st.landlord.email}` : ". No email address on file."}` : undefined}
        actions={
          <>
            <Button variant="secondary" className="gap-2" onClick={download} disabled={!st}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            {isStaff && (
              <Button variant="secondary" className="gap-2" onClick={email} disabled={!st || sending || !st.landlord.email}>
                <Mail className="h-4 w-4" />
                {sending ? "Sending..." : "Email"}
              </Button>
            )}
            <Link href="/app/finance/payouts">
              <Button className="gap-2">
                <Banknote className="h-4 w-4" />
                Pay out
              </Button>
            </Link>
          </>
        }
      />

      <LandlordRates landlordId={id} />

      <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="space-y-2">
          <Label>Month</Label>
          <Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {!validMonth && <p className="pb-2 text-sm text-danger">Pick a month.</p>}
      </div>

      {validMonth && st === undefined ? (
        <ListSkeleton />
      ) : !st ? null : st.sections.length === 0 ? (
        <EmptyState icon={FileText} title={`No activity in ${st.monthLabel}`} description="Nothing was received, charged or paid for this landlord in the month." />
      ) : (
        st.sections.map((s) => <CurrencySection key={s.currency} s={s} />)
      )}
    </div>
  );
}

function CurrencySection({ s }: { s: StatementSection }) {
  const c = s.currency;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{c}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="Brought forward" value={money(s.opening, c)} />
        <StatTile label="Received" value={money(s.totals.received, c)} tone="good" />
        <StatTile label="Commission" value={money(s.totals.commission, c)} />
        <StatTile label="Expenses" value={money(s.totals.expenses, c)} />
        <StatTile label="Paid out" value={money(s.totals.payouts, c)} />
        <StatTile label="Balance held" value={money(s.closing, c)} tone={s.closing < 0 ? "danger" : "default"} />
      </div>

      <Section title="Movements">
        {s.movements.length === 0 ? (
          <p className="text-sm text-text-muted">No money moved this month.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </tr>
                </thead>
                <tbody>
                  <TableRow>
                    <TableCell />
                    <TableCell className="text-text-muted">Brought forward</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="whitespace-nowrap text-right text-text-muted">{money(s.opening, c)}</TableCell>
                  </TableRow>
                  {s.movements.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{dateLabel(m.date)}</TableCell>
                      <TableCell>
                        {m.description}
                        {m.number && <div className="text-xs text-text-muted">{m.number}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{m.property}</TableCell>
                      <TableCell className="text-sm text-text-muted">{KIND_LABELS[m.kind] ?? m.kind}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right font-medium", m.amount > 0 && "text-[var(--status-success-fg)]")}>{signed(m.amount, c)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell />
                    <TableCell className="font-semibold">Balance held</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="whitespace-nowrap text-right font-semibold">{money(s.closing, c)}</TableCell>
                  </TableRow>
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {s.movements.map((m, i) => (
                <li key={i} className="flex justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p>{m.description}</p>
                    <p className="text-xs text-text-muted">
                      {dateLabel(m.date)} · {m.property} · {KIND_LABELS[m.kind] ?? m.kind}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">{signed(m.amount, c)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="By property">
        {s.properties.length === 0 ? (
          <p className="text-sm text-text-muted">No property activity.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Rent charged</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Arrears</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Paid out</TableHead>
                    <TableHead className="text-right">Deposit applied</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {s.properties.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.charged, c)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.received, c)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right", p.arrears > 0 && "text-danger")}>{money(p.arrears, c)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.commission, c)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.expenses, c)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.payouts, c)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.deposit, c)}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {s.properties.map((p) => (
                <div key={p.name} className="rounded-[10px] border border-border p-3 text-sm">
                  <p className="font-medium">{p.name}</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <dt className="text-text-muted">Rent charged</dt>
                    <dd className="text-right">{money(p.charged, c)}</dd>
                    <dt className="text-text-muted">Received</dt>
                    <dd className="text-right">{money(p.received, c)}</dd>
                    <dt className="text-text-muted">Arrears</dt>
                    <dd className="text-right">{money(p.arrears, c)}</dd>
                    <dt className="text-text-muted">Commission</dt>
                    <dd className="text-right">{money(p.commission, c)}</dd>
                    <dt className="text-text-muted">Expenses</dt>
                    <dd className="text-right">{money(p.expenses, c)}</dd>
                    <dt className="text-text-muted">Paid out</dt>
                    <dd className="text-right">{money(p.payouts, c)}</dd>
                    <dt className="text-text-muted">Deposit applied</dt>
                    <dd className="text-right">{money(p.deposit, c)}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/**
 * FN-30: the landlord's commission rate. Setting it applies to all their
 * properties; a property can then be changed in Sync Stay and a lease can
 * have its own rate.
 */
function LandlordRates({ landlordId }: { landlordId: Id<"contacts"> }) {
  const rates = useQuery(api.finance.posting.landlordRates, { landlordId });
  const setRate = useMutation(api.finance.posting.setLandlordRate);
  const [pct, setPct] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (!rates) return null;
  const save = async () => {
    const n = Number(pct);
    if (!pct.trim() || !(n >= 0 && n <= 100)) return animatedToast.error("Enter a rate between 0 and 100");
    setBusy(true);
    try {
      const res = await setRate({ landlordId, pct: n });
      animatedToast.success(`Commission set to ${n}%`, { description: `Applied to ${res.properties} ${res.properties === 1 ? "property" : "properties"}` });
      setPct("");
    } catch (e) {
      animatedToast.error("Could not set the rate", { description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Commission rate">
      <div className="space-y-3 text-sm">
        <p className="text-text-muted">
          {rates.landlordPct !== null ? `This landlord's rate is ${rates.landlordPct}%.` : "No landlord rate set; each property has its own."} A property
          can differ (change it in Sync Stay) and a lease can have its own rate (on the lease).
        </p>
        {rates.properties.length > 0 && (
          <ul className="divide-y divide-border">
            {rates.properties.map((p) => (
              <li key={p._id} className="flex justify-between gap-3 py-1.5">
                <span>{p.name}</span>
                <span className="text-text-muted">
                  {p.pct}%{p.leaseOverrides ? `, ${p.leaseOverrides} lease${p.leaseOverrides === 1 ? "" : "s"} with own rate` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {rates.canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Set for all their properties (%)</Label>
              <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="w-32" placeholder={rates.landlordPct !== null ? String(rates.landlordPct) : "10"} />
            </div>
            <Button variant="secondary" onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Apply"}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
