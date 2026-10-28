"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Download, Mail, Receipt, Undo2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useDownloadReceipt, useRecordPayment } from "@/components/stay/record-payment";
import {
  dateLabel,
  formatTotals,
  methodLabel,
  money,
  thisMonth,
  todayLocal,
  type CurrencyTotals,
  type StayCurrency,
} from "@/lib/stay/format";
import { periodRange } from "../../../../../convex/stay/ledger";
import { useRequireAuth } from "@/hooks/useAuth";

type Row = {
  _id: Id<"stayPayments">;
  leaseId: Id<"stayLeases">;
  receiptNumber: string;
  paidOn: string;
  amount: number;
  currency: StayCurrency;
  method: string;
  reference: string;
  purpose: "rent" | "deposit";
  reversed: boolean;
  reverseReason: string | null;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  recordedBy: string;
};

export default function StayPaymentsPage() {
  const { open: openPayment } = useRecordPayment();
  const downloadReceipt = useDownloadReceipt();
  // Reversals are a director's call (the server enforces it too).
  const { isAdmin: isDirector } = useRequireAuth();

  const month = periodRange(thisMonth());
  const [from, setFrom] = React.useState(month.from);
  const [to, setTo] = React.useState(todayLocal());
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [includeReversed, setIncludeReversed] = React.useState(true);
  const [reversing, setReversing] = React.useState<Row | null>(null);
  const [reason, setReason] = React.useState("");
  const [reverseError, setReverseError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const validRange = !!from && !!to && from <= to;
  const rows = useQuery(
    api.stay.payments.list,
    validRange ? { from, to, q: debounced || undefined, includeReversed } : "skip"
  ) as Row[] | undefined;

  const emailReceipt = useMutation(api.stay.payments.emailReceipt);
  const reverse = useMutation(api.stay.payments.reverse);

  const totals = React.useMemo(() => {
    const rent: CurrencyTotals = {};
    const deposits: CurrencyTotals = {};
    for (const r of rows ?? []) {
      if (r.reversed) continue;
      const t = r.purpose === "deposit" ? deposits : rent;
      t[r.currency] = Math.round(((t[r.currency] ?? 0) + r.amount) * 100) / 100;
    }
    return { rent, deposits, count: (rows ?? []).filter((r) => !r.reversed).length };
  }, [rows]);

  const sendAgain = async (r: Row) => {
    try {
      await emailReceipt({ paymentId: r._id });
      animatedToast.success("Receipt emailed", { description: `${r.receiptNumber} to ${r.tenantName}` });
    } catch (e) {
      animatedToast.error("Could not email the receipt", { description: getErrorMessage(e) });
    }
  };

  const doReverse = async () => {
    if (!reversing) return;
    if (!reason.trim()) return setReverseError("Give a reason for the reversal.");
    setBusy(true);
    setReverseError(null);
    try {
      await reverse({ paymentId: reversing._id, reason: reason.trim() });
      animatedToast.success("Payment reversed", { description: reversing.receiptNumber });
      setReversing(null);
      setReason("");
    } catch (e) {
      setReverseError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const actions = (r: Row) => (
    <div className="flex justify-end gap-1.5">
      <Tooltip content="Download receipt">
        <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Download ${r.receiptNumber}`} onClick={() => downloadReceipt(r._id)}>
          <Download className="h-4 w-4" />
        </Button>
      </Tooltip>
      {!r.reversed && (
        <Tooltip content="Email receipt again">
          <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Email ${r.receiptNumber}`} onClick={() => sendAgain(r)}>
            <Mail className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {isDirector && !r.reversed && (
        <Tooltip content="Reverse payment">
          <Button
            variant="secondary"
            className="h-9 w-9 p-0"
            aria-label={`Reverse ${r.receiptNumber}`}
            onClick={() => {
              setReversing(r);
              setReason("");
              setReverseError(null);
            }}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Payments"
        description="Every payment received, with its receipt. Payments are never deleted; a mistake is reversed."
        actions={
          <Button onClick={() => openPayment()} className="h-11 gap-2 bg-emerald-600 px-5 hover:bg-emerald-700">
            <Receipt className="h-4 w-4" />
            Record payment
          </Button>
        }
      />

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Receipt, tenant, property, reference" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={includeReversed} onChange={(e) => setIncludeReversed(e.target.checked)} />
            Show reversed payments
          </label>
        </div>
        {!validRange && <p className="mt-2 text-sm text-danger">The start date must be on or before the end date.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Rent received" value={formatTotals(totals.rent)} tone="good" />
        <StatTile label="Deposits received" value={formatTotals(totals.deposits)} />
        <StatTile label="Receipts issued" value={String(totals.count)} hint="Excluding reversed" />
      </div>

      {rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments in this period"
          description="Record a payment to issue a numbered receipt."
          action={
            <Button onClick={() => openPayment()} className="gap-2">
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TableRow key={r._id} className={r.reversed ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{r.receiptNumber}</div>
                      <div className="mt-1 flex gap-1">
                        {r.purpose === "deposit" && <Badge variant="info">Deposit</Badge>}
                        {r.reversed && (
                          <span title={r.reverseReason ?? undefined}>
                            <Badge variant="danger">Reversed</Badge>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dateLabel(r.paidOn)}</TableCell>
                    <TableCell>
                      <Link href={`/app/stay/leases/${r.leaseId}`} className="hover:underline">
                        {r.tenantName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.propertyName}, {r.unitLabel}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap font-medium ${r.reversed ? "line-through" : ""}`}>
                      {money(r.amount, r.currency)}
                    </TableCell>
                    <TableCell>{methodLabel(r.method)}</TableCell>
                    <TableCell className="text-sm text-text-muted">{r.reference || "-"}</TableCell>
                    <TableCell className="text-right">{actions(r)}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r._id} className={`rounded-[12px] border border-border-strong bg-card-bg p-4 ${r.reversed ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.tenantName}</p>
                    <p className="truncate text-xs text-text-muted">
                      {r.propertyName}, {r.unitLabel}
                    </p>
                    <p className="text-xs text-text-muted">
                      {r.receiptNumber} · {dateLabel(r.paidOn)} · {methodLabel(r.method)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-semibold ${r.reversed ? "line-through" : ""}`}>{money(r.amount, r.currency)}</p>
                    {r.reversed && <Badge variant="danger">Reversed</Badge>}
                    {r.purpose === "deposit" && !r.reversed && <Badge variant="info">Deposit</Badge>}
                  </div>
                </div>
                <div className="mt-3">{actions(r)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        open={!!reversing}
        title={`Reverse receipt ${reversing?.receiptNumber ?? ""}`}
        description="The payment stays on record, marked reversed. Its amount goes back onto the tenant's balance."
        onClose={() => setReversing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReversing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doReverse} disabled={busy}>
              {busy ? "Reversing..." : "Reverse payment"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormError message={reverseError} />
          {reversing && (
            <p className="text-sm">
              {money(reversing.amount, reversing.currency)} from {reversing.tenantName} on {dateLabel(reversing.paidOn)}.
            </p>
          )}
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: cheque bounced, recorded against the wrong tenant" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
