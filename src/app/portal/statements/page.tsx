"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Download } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentList, KindGuard, PageTitle, PortalLoading } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { downloadLandlordStatementPdf } from "@/lib/stay/pdf";
import { downloadFinancePdf } from "@/lib/finance/pdf";
import { dateLabel } from "@/lib/finance/format";

/** Last month as YYYY-MM: the statement a landlord usually wants. */
function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type FinanceStatement = NonNullable<FunctionReturnType<typeof api.portal.landlord.financeStatement>>;

/** Statement and remittance advices from SyncFinance, read-only. */
function FinanceView({ fin, logoUrl }: { fin: FinanceStatement; logoUrl?: string | null }) {
  const pdf = () =>
    downloadFinancePdf(
      {
        agency: fin.agency,
        title: "Landlord statement",
        number: fin.monthLabel,
        party: { label: "Statement for", name: fin.landlord.name },
        tables: fin.sections.map((s) => ({
          title: s.currency,
          head: ["Date", "Item", "Property", "Amount"],
          body: s.movements.map((m) => [dateLabel(m.date), m.description, m.property, formatMoney(m.amount, s.currency)]),
          alignRight: [3],
        })),
        totals: fin.sections.flatMap((s) => [
          [`${s.currency} brought forward`, formatMoney(s.opening, s.currency)] as [string, string],
          [`${s.currency} balance held for you`, formatMoney(s.closing, s.currency)] as [string, string],
        ]),
        fileName: `Statement_${fin.month}`,
      },
      logoUrl
    );
  const remittance = (p: FinanceStatement["payouts"][number]) =>
    downloadFinancePdf(
      {
        agency: fin.agency,
        title: "Remittance advice",
        number: p.number,
        date: dateLabel(p.date),
        party: { label: "Paid to", name: fin.landlord.name },
        tables: [{ head: ["Date", "Item", "Amount"], body: p.lines.map((l) => [dateLabel(l.date), l.description, formatMoney(l.amount, p.currency)]), alignRight: [2] }],
        totals: [
          ["Method", `${p.method}${p.reference ? `, ${p.reference}` : ""}`],
          ["Paid to you", formatMoney(p.amount, p.currency)],
        ],
        fileName: `Remittance_${p.number}`,
      },
      logoUrl
    );
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={pdf}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>
      {fin.sections.length === 0 ? (
        <p className="text-sm text-text-muted">No activity on your account in {fin.monthLabel}.</p>
      ) : (
        fin.sections.map((s) => (
          <dl key={s.currency} className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-text-muted">Brought forward</dt>
            <dd className="text-right text-text">{formatMoney(s.opening, s.currency)}</dd>
            <dt className="text-text-muted">Rent received</dt>
            <dd className="text-right text-text">{formatMoney(s.totals.received, s.currency)}</dd>
            <dt className="text-text-muted">Commission</dt>
            <dd className="text-right text-text">-{formatMoney(s.totals.commission, s.currency)}</dd>
            <dt className="text-text-muted">Expenses</dt>
            <dd className="text-right text-text">-{formatMoney(s.totals.expenses, s.currency)}</dd>
            <dt className="text-text-muted">Paid to you</dt>
            <dd className="text-right text-text">-{formatMoney(s.totals.payouts, s.currency)}</dd>
            <dt className="border-t border-border pt-2 font-medium text-text">Held for you</dt>
            <dd className="border-t border-border pt-2 text-right font-semibold text-text">{formatMoney(s.closing, s.currency)}</dd>
          </dl>
        ))
      )}
      {fin.payouts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Remittance advices</h3>
          <ul className="divide-y divide-border text-sm">
            {fin.payouts.map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-text">
                  {dateLabel(p.date)} · {p.number}
                </span>
                <span className="flex items-center gap-2">
                  {formatMoney(p.amount, p.currency)}
                  <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Download ${p.number}`} onClick={() => remittance(p)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Inner() {
  const [month, setMonth] = useState(lastMonth);
  const fin = useQuery(api.portal.landlord.financeStatement, month ? { month } : "skip");
  const st = useQuery(api.portal.landlord.statement, month && fin === null ? { month } : "skip");
  const portal = useQuery(api.portal.context.get);
  const docs = useQuery(api.portal.landlord.documents);

  return (
    <>
      <PageTitle title="Statements" />
      <Card className="mb-4">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="space-y-1 text-xs font-medium text-text-muted">
              Month
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
            </label>
            {fin === null && st && (
              <Button variant="secondary" onClick={() => downloadLandlordStatementPdf(st, portal?.logoUrl)}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fin ? (
            <FinanceView fin={fin} logoUrl={portal?.logoUrl} />
          ) : st === undefined ? (
            <PortalLoading />
          ) : !st || st.sections.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing collected or spent in {st?.monthLabel ?? "this month"}.</p>
          ) : (
            <div className="space-y-4">
              {st.sections.map((s) => (
                <dl key={s.currency} className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-text-muted">Rent collected</dt>
                  <dd className="text-right text-text">{formatMoney(s.collected, s.currency)}</dd>
                  {s.depositApplied > 0 && (
                    <>
                      <dt className="text-text-muted">Deposit applied</dt>
                      <dd className="text-right text-text">{formatMoney(s.depositApplied, s.currency)}</dd>
                    </>
                  )}
                  <dt className="text-text-muted">Management fee</dt>
                  <dd className="text-right text-text">-{formatMoney(s.fee, s.currency)}</dd>
                  <dt className="text-text-muted">Expenses</dt>
                  <dd className="text-right text-text">-{formatMoney(s.expenses, s.currency)}</dd>
                  <dt className="border-t border-border pt-2 font-medium text-text">Due to you</dt>
                  <dd className="border-t border-border pt-2 text-right font-semibold text-text">
                    {formatMoney(s.net, s.currency)}
                  </dd>
                </dl>
              ))}
              <p className="text-xs text-text-dim">The PDF lists every receipt and expense behind these figures.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-medium text-text">Shared documents</h2>
        </CardHeader>
        <CardContent>{docs === undefined ? <PortalLoading /> : <DocumentList docs={docs} />}</CardContent>
      </Card>
    </>
  );
}

export default function PortalStatementsPage() {
  return (
    <KindGuard kind="landlord">
      <Inner />
    </KindGuard>
  );
}
