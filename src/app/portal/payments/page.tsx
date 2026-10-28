"use client";

import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { Download, Loader2, Receipt } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KindGuard, LeaseSelect, PageTitle, PortalLoading, useSelectedLease } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { formatDay } from "@/lib/stay-ops/labels";
import { downloadReceiptPdf } from "@/lib/stay/pdf";
import { toast } from "sonner";

function ReceiptDownload({ paymentId, logoUrl }: { paymentId: Id<"stayPayments">; logoUrl: string | null }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Download receipt"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await convex.query(api.portal.tenant.receipt, { paymentId });
          await downloadReceiptPdf(r, logoUrl);
        } catch {
          toast.error("Could not download the receipt");
        } finally {
          setBusy(false);
        }
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-row-hover"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
  );
}

const bal = (n: number, c: string) => (n < 0 ? `${formatMoney(Math.abs(n), c)} CR` : formatMoney(n, c));

function Inner() {
  const leases = useQuery(api.portal.tenant.home);
  const [leaseId, setLeaseId] = useSelectedLease(leases);
  const st = useQuery(api.portal.tenant.statement, leaseId ? { leaseId: leaseId as Id<"stayLeases"> } : "skip");
  const portal = useQuery(api.portal.context.get);

  if (leases === undefined) return <PortalLoading />;
  if (leases.length === 0) return <EmptyState icon={Receipt} title="No payments yet" />;

  return (
    <>
      <PageTitle title="Payments" />
      <LeaseSelect leases={leases} value={leaseId} onChange={setLeaseId} />
      {!st ? (
        <PortalLoading />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader><h2 className="font-medium text-text">Statement</h2></CardHeader>
            <CardContent>
              {st.lines.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing to show yet.</p>
              ) : (
                <>
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-muted">
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium">Description</th>
                        <th className="py-2 text-right font-medium">Charge</th>
                        <th className="py-2 text-right font-medium">Payment</th>
                        <th className="py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.lines.map((l, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-2">{formatDay(l.date)}</td>
                          <td className="py-2">{l.description}</td>
                          <td className="py-2 text-right">{l.debit ? formatMoney(l.debit, st.currency) : ""}</td>
                          <td className="py-2 text-right">{l.credit ? formatMoney(l.credit, st.currency) : ""}</td>
                          <td className="py-2 text-right font-medium">{bal(l.balance, st.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="divide-y divide-border md:hidden">
                    {st.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-text">{l.description}</p>
                          <p className="text-xs text-text-muted">{formatDay(l.date)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={l.credit ? "text-[var(--status-success-fg)]" : "text-text"}>
                            {l.credit ? `- ${formatMoney(l.credit, st.currency)}` : formatMoney(l.debit, st.currency)}
                          </p>
                          <p className="text-xs text-text-muted">Balance {bal(l.balance, st.currency)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-text-muted">CR means the account is in credit.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="font-medium text-text">Receipts</h2></CardHeader>
            <CardContent>
              {st.receipts.length === 0 ? (
                <p className="text-sm text-text-muted">No receipts yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {st.receipts.map((r) => (
                    <li key={r._id} className="flex justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium text-text">{r.receiptNumber}</p>
                        <p className="text-xs text-text-muted">
                          {formatDay(r.paidOn)}. {r.method.replace(/_/g, " ")}
                          {r.purpose === "deposit" ? ". Deposit" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-text">{formatMoney(r.amount, r.currency)}</p>
                        <ReceiptDownload paymentId={r._id} logoUrl={portal?.logoUrl ?? null} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function PortalPaymentsPage() {
  return <KindGuard kind="tenant"><Inner /></KindGuard>;
}
