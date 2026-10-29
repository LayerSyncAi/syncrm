"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Download, FileText, Lock, Mail, Receipt, Undo2 } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Facts, FormError, Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import { METHOD_OPTIONS, PLAN_STATUS_LABELS, dateLabel, methodLabel, money, parseAmount, type FinCurrency } from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger"> = {
  paid: "success",
  part_paid: "warning",
  due: "info",
  overdue: "danger",
};


export default function StandStatementPage() {
  const params = useParams<{ standId: string }>();
  const standId = params.standId as Id<"finStands">;
  const fin = useQuery(api.finance.settings.get);
  const staff = !!fin?.role.isStaff;
  const d = useQuery(api.finance.stands.getStandStatement, staff ? { standId } : "skip");
  const emailStatement = useMutation(api.finance.stands.emailStandStatement);
  const pdf = useFinancePdf();
  const [moneyMode, setMoneyMode] = React.useState<"receive" | "refund" | null>(null);
  const [emailing, setEmailing] = React.useState(false);

  if (fin === undefined || (staff && d === undefined)) return <ListSkeleton />;
  if (!staff) {
    return <EmptyState icon={Lock} title="Statements are for directors and accounts staff" description="Ask your director if you need access." />;
  }
  if (!d) {
    return <EmptyState icon={FileText} title="Client plan not found" description="It may have been removed, or the link is wrong." />;
  }

  const c = d.stand.currency;
  // What can still be paid back on a cancelled sale.
  const received = d.refundable;
  const accounts = fin.accounts.filter((a) => a.isActive && a.currency === c).map((a) => ({ _id: a._id, name: a.name }));
  const title = `Stand ${d.stand.standNumber}, ${d.development.name}`;

  const sendStatement = async () => {
    setEmailing(true);
    try {
      await emailStatement({ standId });
      animatedToast.success("Statement emailed", { description: `To ${d.buyer.name}` });
    } catch (e) {
      animatedToast.error("Could not email the statement", { description: getErrorMessage(e) });
    } finally {
      setEmailing(false);
    }
  };

  const download = () =>
    pdf(() => ({
      agency: d.agency,
      title: "Statement",
      number: `Stand ${d.stand.standNumber}`,
      date: dateLabel(d.today),
      party: { label: "Buyer", name: d.buyer.name, lines: [d.buyer.phone, d.buyer.email].filter(Boolean) },
      facts: [
        ["Development", d.development.name],
        ["Stand", d.stand.standNumber],
        ["Price", money(d.stand.price, c)],
        ["Deposit", money(d.stand.deposit, c)],
        ...(d.interest > 0 ? ([["Interest charged", money(d.interest, c)]] as Array<[string, string]>) : []),
        ...(d.nextDueDate ? ([["Next payment", `${money(d.nextDueAmount ?? 0, c)} on ${dateLabel(d.nextDueDate)}`]] as Array<[string, string]>) : []),
      ],
      tables: [
        {
          title: "Payment plan",
          head: ["Due", "Item", "Amount", "Paid", "Status"],
          body: d.rows.map((r) => [dateLabel(r.dueDate), r.label, money(r.amount, c), money(r.paid, c), PLAN_STATUS_LABELS[r.status] ?? r.status]),
          alignRight: [2, 3],
        },
        {
          title: "Payments received",
          head: ["Date", "Receipt", "Method", "Reference", "Amount"],
          body: [
            ...(d.stand.openingPaid > 0 ? [["", "Paid before go-live", "", "", money(d.stand.openingPaid, c)]] : []),
            ...d.payments.map((p) => [dateLabel(p.date), p.number, methodLabel(p.method), p.reference, money(p.amount, c)]),
            ...d.refunds.map((p) => [dateLabel(p.date), p.number, "Refund", "", `-${money(p.amount, c)}`]),
          ],
          alignRight: [4],
        },
      ],
      totals: [
        ["Paid to date", money(d.paidToDate, c)],
        ["Overdue", money(d.overdue, c)],
        ["Balance", money(d.balance, c)],
      ],
      stamp: d.stand.status === "cancelled" ? "CANCELLED" : undefined,
      fileName: `Statement stand ${d.stand.standNumber} ${d.buyer.name}`,
    }));

  return (
    <div className="space-y-6">
      <StayPageHeader
        back={{ href: "/app/finance/instalments", label: "Instalments" }}
        title={d.buyer.name}
        description={title}
        actions={
          <>
            {d.stand.status === "active" && (
              <Button className="gap-2" onClick={() => setMoneyMode("receive")}>
                <Receipt className="h-4 w-4" />
                Receive payment
              </Button>
            )}
            {d.stand.status === "cancelled" && received > 0 && (
              <Button variant="secondary" className="gap-2" onClick={() => setMoneyMode("refund")}>
                <Undo2 className="h-4 w-4" />
                Refund buyer
              </Button>
            )}
            <Button variant="secondary" className="gap-2" onClick={sendStatement} disabled={!d.buyer.email || emailing}>
              <Mail className="h-4 w-4" />
              {emailing ? "Sending..." : "Email statement"}
            </Button>
            <Button variant="secondary" className="gap-2" onClick={download}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </>
        }
      />

      {d.stand.status === "cancelled" && <Badge variant="neutral">This sale is cancelled</Badge>}
      {!d.buyer.email && <p className="text-sm text-text-muted">The buyer has no email address, so statements cannot be emailed.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Paid to date" value={money(d.paidToDate, c)} tone="good" />
        <StatTile label="Balance" value={money(d.balance, c)} />
        <StatTile label="Overdue" value={money(d.overdue, c)} tone={d.overdue > 0 ? "danger" : "default"} />
        <StatTile label="Next due" value={d.nextDueDate ? money(d.nextDueAmount ?? 0, c) : "-"} hint={d.nextDueDate ? dateLabel(d.nextDueDate) : undefined} />
      </div>

      <Section title="Details">
        <Facts
          items={[
            { label: "Buyer", value: d.buyer.name },
            { label: "Phone", value: d.buyer.phone },
            { label: "Email", value: d.buyer.email },
            { label: "Development", value: d.development.name },
            { label: "Developer", value: d.development.developerName },
            { label: "Stand", value: d.stand.standNumber },
            { label: "Price", value: money(d.stand.price, c) },
            { label: "Deposit", value: money(d.stand.deposit, c) },
            { label: "Interest charged", value: d.interest > 0 ? money(d.interest, c) : `None${d.development.interestPctPerMonth ? ` (${d.development.interestPctPerMonth}% a month on overdue)` : ""}` },
            { label: "Money held by", value: d.development.moneyHeldBy === "developer" ? "The developer" : "Us, in trust, for the developer" },
          ]}
        />
      </Section>

      <Section title="Payment plan">
        <PlanTable rows={d.rows} currency={c} />
      </Section>

      <Section title="Payments received">
        {d.payments.length === 0 && d.stand.openingPaid <= 0 ? (
          <p className="text-sm text-text-muted">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </tr>
              </thead>
              <tbody>
                {d.stand.openingPaid > 0 && (
                  <TableRow>
                    <TableCell>-</TableCell>
                    <TableCell colSpan={3} className="text-text-muted">
                      Paid before go-live
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(d.stand.openingPaid, c)}</TableCell>
                  </TableRow>
                )}
                {d.payments.map((p) => (
                  <TableRow key={p._id} className={p.reversed ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap">{dateLabel(p.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.number || "-"}
                      {p.reversed && (
                        <Badge variant="danger" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                      {p.isReversal && (
                        <Badge variant="neutral" className="ml-2">
                          Reversal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.method ? methodLabel(p.method) : "-"}</TableCell>
                    <TableCell className="text-sm text-text-muted">{p.reference || "-"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{money(p.amount, c)}</TableCell>
                  </TableRow>
                ))}
                {d.refunds.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="whitespace-nowrap">{dateLabel(p.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.number || "-"}
                      <Badge variant="warning" className="ml-2">
                        Refund
                      </Badge>
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-sm text-text-muted">Paid back to the buyer</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">-{money(p.amount, c)}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Section>

      {moneyMode && (
        <StandMoneyModal
          mode={moneyMode}
          standId={standId}
          currency={c}
          buyerName={d.buyer.name}
          buyerEmail={d.buyer.email}
          defaultAmount={moneyMode === "receive" ? (d.overdue > 0 ? d.overdue : d.nextDueAmount ?? 0) : received}
          today={fin.today}
          accounts={accounts}
          onClose={() => setMoneyMode(null)}
        />
      )}
    </div>
  );
}

function PlanTable({
  rows,
  currency,
}: {
  rows: Array<{ dueDate: string; label: string; amount: number; paid: number; status: string; kind?: string }>;
  currency: FinCurrency;
}) {
  if (!rows.length) return <p className="text-sm text-text-muted">No plan rows.</p>;
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <TableHead>Due</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead>Status</TableHead>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap">{dateLabel(r.dueDate)}</TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{money(r.amount, currency)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{money(r.paid, currency)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "info"}>{PLAN_STATUS_LABELS[r.status] ?? r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-[10px] border border-border p-3 text-sm">
            <div>
              <p className="font-medium">{r.label}</p>
              <p className="text-xs text-text-muted">
                {dateLabel(r.dueDate)} · paid {money(r.paid, currency)}
              </p>
            </div>
            <div className="text-right">
              <p>{money(r.amount, currency)}</p>
              <Badge variant={STATUS_VARIANT[r.status] ?? "info"}>{PLAN_STATUS_LABELS[r.status] ?? r.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StandMoneyModal({
  mode,
  standId,
  currency,
  buyerName,
  buyerEmail,
  defaultAmount,
  today,
  accounts,
  onClose,
}: {
  mode: "receive" | "refund";
  standId: Id<"finStands">;
  currency: FinCurrency;
  buyerName: string;
  buyerEmail: string;
  defaultAmount: number;
  today: string;
  accounts: Array<{ _id: Id<"finAccounts">; name: string }>;
  onClose: () => void;
}) {
  const receive = useMutation(api.finance.stands.receivePayment);
  const refund = useMutation(api.finance.stands.refundStand);
  const c = currency;
  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(defaultAmount > 0 ? String(defaultAmount) : "");
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [accountId, setAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [sendStatement, setSendStatement] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    const n = parseAmount(amount);
    if (!(n > 0)) return setError("Enter the amount.");
    setBusy(true);
    try {
      const common = { standId, date, amount: n, method, accountId: (accountId || undefined) as Id<"finAccounts"> | undefined, reference: reference.trim() || undefined };
      if (mode === "receive") {
        const res = await receive({ ...common, emailStatement: sendStatement && !!buyerEmail });
        animatedToast.success("Payment received", { description: `Receipt ${res.number}: ${money(n, c)} from ${buyerName}` });
      } else {
        const res = await refund(common);
        animatedToast.success("Refund recorded", { description: `Payment ${res.number}: ${money(n, c)} to ${buyerName}` });
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={mode === "receive" ? `Receive payment from ${buyerName}` : `Refund ${buyerName}`}
      description={mode === "receive" ? "Money is set against the oldest instalment first." : "The sale is cancelled. You can refund up to what was received since go-live."}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : mode === "receive" ? "Receive payment" : "Record refund"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Amount ({c})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{mode === "receive" ? "Into account (optional)" : "From account (optional)"}</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Default for this development</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or slip number" />
        </div>
        {mode === "receive" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={sendStatement && !!buyerEmail} disabled={!buyerEmail} onChange={(e) => setSendStatement(e.target.checked)} />
            {buyerEmail ? "Email the buyer an updated statement" : "The buyer has no email address, so no statement is sent"}
          </label>
        )}
      </div>
    </Modal>
  );
}
