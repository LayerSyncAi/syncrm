"use client";

import * as React from "react";
import Link from "next/link";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Banknote, CalendarClock, Check, Download, Mail, Undo2, X } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import type { FinanceDocument } from "@/lib/finance/pdf";
import { ACCOUNT_TYPE_LABELS, METHOD_OPTIONS, PAYOUT_STATUS_LABELS, dateLabel, money, parseAmount, signed } from "@/lib/finance/format";

type Fin = NonNullable<FunctionReturnType<typeof api.finance.settings.get>>;
type Payable = FunctionReturnType<typeof api.finance.payouts.payable>[number];
type Payout = FunctionReturnType<typeof api.finance.payouts.list>[number];
type Method = (typeof METHOD_OPTIONS)[number]["value"];
type Currency = "USD" | "ZiG";

const LEDGER_LABEL: Record<string, string> = { landlord: "Landlord", sale: "Seller", developer: "Developer" };

export default function PayoutsPage() {
  const fin = useQuery(api.finance.settings.get);
  const isStaff = !!fin?.role.isStaff;
  const payable = useQuery(api.finance.payouts.payable, fin ? {} : "skip");
  const prepared = useQuery(api.finance.payouts.list, isStaff ? { status: "prepared" } : "skip");
  const all = useQuery(api.finance.payouts.list, isStaff ? {} : "skip");
  const emailRemittance = useMutation(api.finance.payouts.emailRemittance);
  const convex = useConvex();
  const pdf = useFinancePdf();

  const [preparing, setPreparing] = React.useState<Payable | null>(null);
  const [approving, setApproving] = React.useState<Payout | null>(null);
  const [cancelling, setCancelling] = React.useState<Payout | null>(null);
  const [monthly, setMonthly] = React.useState(false);

  if (fin === undefined) return <ListSkeleton />;

  const oneApprover = fin.settings.approvers === "one";
  const canPayNow = fin.role.canApprove && oneApprover;
  const history = (all ?? []).filter((p) => p.status !== "prepared");
  const ready = (payable ?? []).filter((p) => p.available > 0 || p.prepared > 0);

  const remittance = (p: Payout) =>
    pdf(async () => {
      const d = await convex.query(api.finance.payouts.get, { payoutId: p._id });
      if (!d) return null;
      const doc: FinanceDocument = {
        agency: d.agency,
        title: "Remittance advice",
        number: d.number,
        date: dateLabel(d.date),
        party: { label: "Paid to", name: d.payeeName, lines: d.payeeEmail ? [d.payeeEmail] : [] },
        facts: [
          ["Method", d.method],
          ...(d.reference ? ([["Reference", d.reference]] as Array<[string, string]>) : []),
          ["Paid from", d.account],
        ],
        highlight: { label: "Paid to you", value: money(d.amount, d.currency) },
        tables: [
          {
            title: "Since your last payment",
            head: ["Date", "Item", "Amount"],
            body: d.lines.map((l) => [dateLabel(l.date), l.description, signed(l.amount, d.currency)]),
            alignRight: [2],
          },
        ],
        totals: [
          ["Received", money(d.received, d.currency)],
          ["Commission and expenses", money(d.deducted, d.currency)],
          ["Paid to you", money(d.amount, d.currency)],
        ],
        stamp: d.status === "cancelled" ? "CANCELLED" : undefined,
        fileName: `Remittance ${d.number} ${d.payeeName}`,
      };
      return doc;
    });

  const sendRemittance = async (p: Payout) => {
    try {
      await emailRemittance({ payoutId: p._id });
      animatedToast.success("Remittance emailed", { description: `${p.number} to ${p.payeeName}` });
    } catch (e) {
      animatedToast.error("Could not email the remittance", { description: getErrorMessage(e) });
    }
  };

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Payouts"
        description={
          isStaff
            ? oneApprover
              ? "One approver: a director can prepare and pay in one step. Payouts prepared by accounts wait for a director."
              : "Two approvers: one person prepares a payout and a different director approves and pays it."
            : "What each of your landlords is due. Accounts prepares the payouts and a director pays them."
        }
        actions={
          isStaff ? (
            <Button onClick={() => setMonthly(true)} className="gap-2">
              <CalendarClock className="h-4 w-4" />
              Monthly payout run
            </Button>
          ) : undefined
        }
      />

      <Section title="Ready to pay">
        {payable === undefined ? (
          <ListSkeleton />
        ) : ready.length === 0 ? (
          <EmptyState icon={Banknote} title="Nobody to pay" description="Landlords, sellers and developers appear here once we hold money for them." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Payee</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                    <TableHead className="text-right">Awaiting approval</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Last paid</TableHead>
                    {isStaff && <TableHead className="text-right">Action</TableHead>}
                  </tr>
                </thead>
                <tbody>
                  {ready.map((p) => (
                    <TableRow key={`${p.ledger}:${p.key}:${p.currency}`}>
                      <TableCell>
                        {p.ledger === "landlord" ? (
                          <Link href={`/app/finance/trust/${p.key}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}
                        <div className="text-xs text-text-muted">{LEDGER_LABEL[p.ledger]}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(p.held, p.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-text-muted">{p.prepared ? money(p.prepared, p.currency) : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold">{money(p.available, p.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-text-muted">{p.lastPaidOn ? dateLabel(p.lastPaidOn) : "Never"}</TableCell>
                      {isStaff && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="secondary" disabled={p.available <= 0} onClick={() => setPreparing(p)}>
                            Prepare
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {ready.map((p) => (
                <div key={`${p.ledger}:${p.key}:${p.currency}`} className="rounded-[10px] border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-text-muted">
                        {LEDGER_LABEL[p.ledger]}. Held {money(p.held, p.currency)}
                        {p.prepared ? `, ${money(p.prepared, p.currency)} awaiting approval` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{money(p.available, p.currency)}</p>
                  </div>
                  {isStaff && p.available > 0 && (
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPreparing(p)}>
                      Prepare
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {isStaff && (
        <>
          <Section title={`Awaiting approval${prepared?.length ? ` (${prepared.length})` : ""}`}>
            {prepared === undefined ? (
              <ListSkeleton />
            ) : prepared.length === 0 ? (
              <p className="text-sm text-text-muted">No payouts waiting.</p>
            ) : (
              <ul className="divide-y divide-border">
                {prepared.map((p) => (
                  <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.payeeName} <span className="font-semibold">{money(p.amount, p.currency)}</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        {p.number}, {dateLabel(p.date)}, {p.method}
                        {p.reference ? `, ref ${p.reference}` : ""}. Prepared by {p.preparedBy}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {fin.role.canApprove && (
                        <Tooltip content={p.canApprove ? "Approve and pay" : "Another director must approve a payout you prepared"}>
                          <Button size="sm" className="gap-1" disabled={!p.canApprove} onClick={() => setApproving(p)}>
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </Tooltip>
                      )}
                      <Button size="sm" variant="secondary" className="gap-1" onClick={() => setCancelling(p)}>
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="History">
            {all === undefined ? (
              <ListSkeleton />
            ) : history.length === 0 ? (
              <p className="text-sm text-text-muted">No payouts made yet.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Payout</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((p) => (
                        <TableRow key={p._id} className={p.status === "cancelled" ? "opacity-60" : ""}>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium">{p.number}</div>
                            <div className="text-xs text-text-muted">
                              {p.method}
                              {p.reference ? `, ${p.reference}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{dateLabel(p.date)}</TableCell>
                          <TableCell>
                            {p.payeeName}
                            <div className="text-xs text-text-muted">{p.approvedBy ? `Approved by ${p.approvedBy}` : `Prepared by ${p.preparedBy}`}</div>
                          </TableCell>
                          <TableCell className={`whitespace-nowrap text-right font-medium ${p.status === "cancelled" ? "line-through" : ""}`}>{money(p.amount, p.currency)}</TableCell>
                          <TableCell>
                            <span title={p.cancelReason ?? undefined}>
                              <Badge variant={p.status === "paid" ? "success" : "danger"}>{PAYOUT_STATUS_LABELS[p.status]}</Badge>
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{historyActions(p)}</TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="space-y-2 md:hidden">
                  {history.map((p) => (
                    <div key={p._id} className={`rounded-[10px] border border-border p-3 text-sm ${p.status === "cancelled" ? "opacity-70" : ""}`}>
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{p.payeeName}</p>
                          <p className="text-xs text-text-muted">
                            {p.number}, {dateLabel(p.date)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">{money(p.amount, p.currency)}</p>
                          <Badge variant={p.status === "paid" ? "success" : "danger"}>{PAYOUT_STATUS_LABELS[p.status]}</Badge>
                        </div>
                      </div>
                      <div className="mt-2">{historyActions(p)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </>
      )}

      {isStaff && (
        <>
          <PrepareModal row={preparing} onClose={() => setPreparing(null)} fin={fin} canPayNow={canPayNow} />
          <ApproveModal row={approving} onClose={() => setApproving(null)} />
          <CancelModal row={cancelling} onClose={() => setCancelling(null)} />
          <MonthlyModal open={monthly} onClose={() => setMonthly(false)} fin={fin} canPayNow={canPayNow} />
        </>
      )}
    </div>
  );

  function historyActions(p: Payout) {
    return (
      <div className="flex justify-end gap-1.5">
        <Tooltip content="Download remittance">
          <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Download remittance ${p.number}`} onClick={() => remittance(p)}>
            <Download className="h-4 w-4" />
          </Button>
        </Tooltip>
        {p.status === "paid" && (
          <Tooltip content="Email remittance">
            <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Email remittance ${p.number}`} onClick={() => sendRemittance(p)}>
              <Mail className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
        {p.status === "paid" && fin?.role.canApprove && (
          <Tooltip content="Reverse payout">
            <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Reverse ${p.number}`} onClick={() => setCancelling(p)}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  }
}

function MethodSelect({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Method)}>
      {METHOD_OPTIONS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}

function PrepareModal({ row, onClose, fin, canPayNow }: { row: Payable | null; onClose: () => void; fin: Fin; canPayNow: boolean }) {
  const prepare = useMutation(api.finance.payouts.prepare);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(fin.today);
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [accountId, setAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const accounts = fin.accounts.filter((a) => a.isActive && a.currency === row?.currency);

  React.useEffect(() => {
    if (!row) return;
    setAmount(String(row.available));
    setDate(fin.today);
    setMethod("bank_transfer");
    const trust = fin.accounts.find((a) => a.isActive && a.type === "trust" && a.currency === row.currency);
    setAccountId(trust?._id ?? "");
    setReference("");
    setEmail(row.email);
    setError(null);
  }, [row, fin.today, fin.accounts]);

  const save = async (payNow: boolean) => {
    if (!row) return;
    const n = parseAmount(amount);
    if (!(n > 0)) return setError("Enter an amount more than zero.");
    if (n > row.available) return setError(`Only ${money(row.available, row.currency)} is available.`);
    setBusy(true);
    setError(null);
    try {
      await prepare({
        ledger: row.ledger,
        key: row.key,
        currency: row.currency,
        amount: n,
        date,
        method,
        accountId: (accountId || undefined) as Id<"finAccounts"> | undefined,
        reference: reference.trim() || undefined,
        payeeEmail: email.trim() || undefined,
        payNow: payNow || undefined,
      });
      animatedToast.success(payNow ? "Payout paid" : "Payout prepared", {
        description: `${money(n, row.currency)} to ${row.name}${payNow ? "" : ". It now waits for a director's approval."}`,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!row}
      title={`Pay ${row?.name ?? ""}`}
      description={row ? `${money(row.available, row.currency)} available. The money leaves the trust account once the payout is paid.` : undefined}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={canPayNow ? "secondary" : "primary"} onClick={() => save(false)} disabled={busy}>
            {busy ? "Saving..." : "Prepare for approval"}
          </Button>
          {canPayNow && (
            <Button onClick={() => save(true)} disabled={busy}>
              {busy ? "Paying..." : "Pay now"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Amount{row ? ` (${row.currency})` : ""}</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} max={fin.today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <MethodSelect value={method} onChange={setMethod} />
          </div>
          <div className="space-y-2">
            <Label>Paid from</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Main trust account</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({ACCOUNT_TYPE_LABELS[a.type]}, balance {money(a.balance, a.currency)})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference" />
          </div>
          <div className="space-y-2">
            <Label>Email remittance to</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
        </div>
        <p className="text-xs text-text-muted">The remittance advice is emailed once the payout is paid.</p>
      </div>
    </Modal>
  );
}

function ApproveModal({ row, onClose }: { row: Payout | null; onClose: () => void }) {
  const approve = useMutation(api.finance.payouts.approve);
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setReference(row?.reference ?? "");
    setError(null);
  }, [row]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await approve({ payoutId: row._id, reference: reference.trim() || undefined });
      animatedToast.success("Payout approved and paid", { description: `${money(row.amount, row.currency)} to ${row.payeeName}` });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!row}
      title={`Approve ${row?.number ?? ""}`}
      description={row ? `Pay ${money(row.amount, row.currency)} to ${row.payeeName} from trust. Make the bank payment, then enter its reference.` : undefined}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Paying..." : "Approve and pay"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Bank reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference from the bank payment" />
        </div>
      </div>
    </Modal>
  );
}

function CancelModal({ row, onClose }: { row: Payout | null; onClose: () => void }) {
  const cancel = useMutation(api.finance.payouts.cancel);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setReason("");
    setError(null);
  }, [row]);

  const save = async () => {
    if (!row) return;
    if (!reason.trim()) return setError("Give a reason.");
    setBusy(true);
    setError(null);
    try {
      await cancel({ payoutId: row._id, reason: reason.trim() });
      animatedToast.success(row.status === "paid" ? "Payout reversed" : "Payout cancelled", { description: row.number });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!row}
      title={`${row?.status === "paid" ? "Reverse" : "Cancel"} ${row?.number ?? ""}`}
      description={
        row?.status === "paid"
          ? "The money goes back on the payee's balance in trust and the payout is marked cancelled. Use this when the payment bounced or was recorded by mistake."
          : "The payout stays on record, marked cancelled. No money has left the trust account."
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={save} disabled={busy}>
            {busy ? "Saving..." : row?.status === "paid" ? "Reverse payout" : "Cancel payout"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: landlord asked us to hold the money" />
        </div>
      </div>
    </Modal>
  );
}

function MonthlyModal({ open, onClose, fin, canPayNow }: { open: boolean; onClose: () => void; fin: Fin; canPayNow: boolean }) {
  const run = useMutation(api.finance.payouts.prepareMonthly);
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [date, setDate] = React.useState(fin.today);
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [payNow, setPayNow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrency("USD");
    setDate(fin.today);
    setMethod("bank_transfer");
    setPayNow(false);
    setError(null);
  }, [open, fin.today]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await run({ currency, date, method, payNow: canPayNow && payNow ? true : undefined });
      animatedToast.success(
        res.count ? `${res.count} ${res.count === 1 ? "payout" : "payouts"} ${canPayNow && payNow ? "paid" : "prepared"}` : "No landlord has money available",
        { description: currency }
      );
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Monthly payout run"
      description="Prepare a payout for every landlord with money available in one currency, for the full amount available."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Working..." : canPayNow && payNow ? "Prepare and pay" : "Prepare payouts"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} max={fin.today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <MethodSelect value={method} onChange={setMethod} />
          </div>
        </div>
        {canPayNow && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
            Pay them now as well (you are the only approver needed)
          </label>
        )}
        <p className="text-xs text-text-muted">Payouts are made from the main {currency} trust account. Landlords with an email address get a remittance advice once paid.</p>
      </div>
    </Modal>
  );
}
