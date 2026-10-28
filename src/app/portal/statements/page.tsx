"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentList, KindGuard, PageTitle, PortalLoading } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { downloadLandlordStatementPdf } from "@/lib/stay/pdf";

/** Last month as YYYY-MM: the statement a landlord usually wants. */
function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Inner() {
  const [month, setMonth] = useState(lastMonth);
  const st = useQuery(api.portal.landlord.statement, month ? { month } : "skip");
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
            {st && (
              <Button variant="secondary" onClick={() => downloadLandlordStatementPdf(st, portal?.logoUrl)}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {st === undefined ? (
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
