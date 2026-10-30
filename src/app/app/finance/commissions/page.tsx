"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowRightLeft, FileText, HandCoins, Lock, Receipt, Wallet } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { METHOD_OPTIONS, dateLabel, formatTotals, money, parseAmount, type CurrencyTotals, type FinCurrency } from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

type Agent = { userId: Id<"users">; name: string; pct: number; amount: number; paid: number };
type Deal = {
  _id: Id<"dealCommissions">;
  client: string;
  property: string;
  closedOn: number;
  currency: FinCurrency;
  dealValue: number;
  commission: number;
  received: number;
  outstanding: number;
  saleDepositHeld: number;
  agents: Agent[];
  crmStatus: string;
};

type Action =
  | { kind: "receive"; deal: Deal }
  | { kind: "deposit"; deal: Deal }
  | { kind: "agent"; deal: Deal; agent: Agent };

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const owedOf = (d: Deal) => r2(d.agents.reduce((s, a) => s + Math.max(0, a.amount - a.paid), 0));

export default function FinanceCommissionsPage() {
  const fin = useQuery(api.finance.settings.get);
  const staff = !!fin?.role.isStaff;
  const deals = useQuery(api.finance.commissions.deals, staff ? {} : "skip") as Deal[] | undefined;
  const invoiceDeal = useMutation(api.finance.commissions.invoiceDeal);

  const [search, setSearch] = React.useState("");
  const [openOnly, setOpenOnly] = React.useState(true);
  const [action, setAction] = React.useState<Action | null>(null);
  const [invoicing, setInvoicing] = React.useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = React.useState<string | null>(null);

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (deals ?? []).filter((d) => {
      if (openOnly && d.outstanding <= 0 && owedOf(d) <= 0) return false;
      return !q || `${d.client} ${d.property} ${d.agents.map((a) => a.name).join(" ")}`.toLowerCase().includes(q);
    });
  }, [deals, search, openOnly]);

  const totals = React.useMemo(() => {
    const outstanding: CurrencyTotals = {};
    const owed: CurrencyTotals = {};
    const held: CurrencyTotals = {};
    for (const d of deals ?? []) {
      if (d.outstanding > 0) outstanding[d.currency] = r2((outstanding[d.currency] ?? 0) + d.outstanding);
      const o = owedOf(d);
      if (o > 0) owed[d.currency] = r2((owed[d.currency] ?? 0) + o);
      if (d.saleDepositHeld > 0) held[d.currency] = r2((held[d.currency] ?? 0) + d.saleDepositHeld);
    }
    return { outstanding, owed, held };
  }, [deals]);

  if (fin === undefined) return <ListSkeleton />;
  if (!staff) {
    return <EmptyState icon={Lock} title="Commissions are for directors and accounts staff" description="Agents can see their own statement under My commission." />;
  }

  const makeInvoice = async (d: Deal) => {
    setInvoicing(d._id);
    try {
      const res = await invoiceDeal({ dealCommissionId: d._id });
      setLastInvoice(res.number);
      animatedToast.success(`Invoice ${res.number} created`, { description: `${money(d.commission, d.currency)} to ${d.client}. Send it from Invoices.` });
    } catch (e) {
      animatedToast.error("Could not create the invoice", { description: getErrorMessage(e) });
    } finally {
      setInvoicing(null);
    }
  };

  return (
    <div className="space-y-6">
      <StayPageHeader title="Sales commission" description="Closed SynCRM deals: commission received from clients and each agent's share paid out." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Commission still to receive" value={formatTotals(totals.outstanding)} tone="warning" />
        <StatTile label="Owed to agents" value={formatTotals(totals.owed)} />
        <StatTile label="Sale deposits held" value={formatTotals(totals.held)} hint="In trust, for deals listed here" />
      </div>

      {lastInvoice && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-primary/40 bg-primary-600/5 p-3 text-sm">
          <span>Invoice {lastInvoice} is ready.</span>
          <Link href="/app/finance/invoices" className="font-medium text-primary-ink hover:underline">
            Open Invoices
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <div className="min-w-[220px] flex-1 space-y-2">
          <Label>Search</Label>
          <Input placeholder="Client, property or agent" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Only deals with money still to receive or pay
        </label>
      </div>

      {deals === undefined ? (
        <ListSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState icon={HandCoins} title="No deals to show" description="Deals appear here when they are closed in SynCRM with a commission split." />
      ) : (
        <div className="space-y-4">
          {shown.map((d) => {
            const c = d.currency;
            return (
              <div key={d._id} className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.client}</p>
                    <p className="text-sm text-text-muted">
                      {d.property ? `${d.property} · ` : ""}closed {dateLabel(day(d.closedOn))} · deal value {money(d.dealValue, c)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {d.outstanding <= 0 ? <Badge variant="success">Commission received</Badge> : d.received > 0 ? <Badge variant="warning">Part received</Badge> : <Badge variant="info">Not received</Badge>}
                    {d.crmStatus === "paid" && <Badge variant="neutral">Agents paid</Badge>}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-text-muted">Commission</dt>
                    <dd className="font-medium">{money(d.commission, c)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Received</dt>
                    <dd>{money(d.received, c)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Still to receive</dt>
                    <dd className={d.outstanding > 0 ? "font-medium text-[var(--status-warning-fg)]" : ""}>{money(d.outstanding, c)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Sale deposit held</dt>
                    <dd>{money(d.saleDepositHeld, c)}</dd>
                  </div>
                </dl>

                {d.agents.length > 0 && (
                  <div className="mt-4 divide-y divide-border rounded-[10px] border border-border">
                    {d.agents.map((a) => {
                      const owed = r2(a.amount - a.paid);
                      return (
                        <div key={a.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-text-muted">
                              {" "}
                              · {a.pct}% · {money(a.amount, c)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-text-muted">Paid {money(a.paid, c)}</span>
                            {owed > 0 ? (
                              <>
                                <span className="font-medium">Owed {money(owed, c)}</span>
                                <Button variant="secondary" className="h-8 gap-1 px-3" onClick={() => setAction({ kind: "agent", deal: d, agent: a })}>
                                  <Wallet className="h-3.5 w-3.5" />
                                  Pay
                                </Button>
                              </>
                            ) : (
                              <Badge variant="success">Paid</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {d.outstanding > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="gap-2" onClick={() => setAction({ kind: "receive", deal: d })}>
                      <Receipt className="h-4 w-4" />
                      Record commission received
                    </Button>
                    {d.saleDepositHeld > 0 && (
                      <Button variant="secondary" className="gap-2" onClick={() => setAction({ kind: "deposit", deal: d })}>
                        <ArrowRightLeft className="h-4 w-4" />
                        Take from sale deposit
                      </Button>
                    )}
                    <Button variant="secondary" className="gap-2" disabled={invoicing === d._id} onClick={() => makeInvoice(d)}>
                      <FileText className="h-4 w-4" />
                      {invoicing === d._id ? "Creating..." : "Create commission invoice"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {action && (
        <MoneyModal
          action={action}
          today={fin.today}
          accounts={fin.accounts.filter((a) => a.isActive && a.currency === action.deal.currency).map((a) => ({ _id: a._id, name: a.name }))}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function MoneyModal({
  action,
  today,
  accounts,
  onClose,
}: {
  action: Action;
  today: string;
  accounts: Array<{ _id: Id<"finAccounts">; name: string }>;
  onClose: () => void;
}) {
  const receive = useMutation(api.finance.commissions.receive);
  const takeFromDeposit = useMutation(api.finance.commissions.takeFromDeposit);
  const payAgent = useMutation(api.finance.commissions.payAgent);
  const d = action.deal;
  const c = d.currency;
  const max =
    action.kind === "receive" ? d.outstanding : action.kind === "deposit" ? r2(Math.min(d.outstanding, d.saleDepositHeld)) : r2(action.agent.amount - action.agent.paid);

  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(String(max));
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [accountId, setAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const title =
    action.kind === "receive" ? `Commission received from ${d.client}` : action.kind === "deposit" ? `Take commission from ${d.client}'s deposit` : `Pay ${action.agent.name}`;
  const description =
    action.kind === "receive"
      ? `Still to receive ${money(d.outstanding, c)}. It goes into a business account.`
      : action.kind === "deposit"
        ? `Moves commission from the sale deposit held in trust (${money(d.saleDepositHeld, c)}) to the business account.`
        : `Their share of ${d.client}: ${money(action.agent.amount, c)}. Owed ${money(max, c)}.`;

  const submit = async () => {
    setError(null);
    const n = parseAmount(amount);
    if (!(n > 0)) return setError("Enter an amount.");
    if (action.kind !== "receive" && n > max) return setError(`The most you can enter here is ${money(max, c)}.`);
    setBusy(true);
    try {
      const acc = (accountId || undefined) as Id<"finAccounts"> | undefined;
      const ref = reference.trim() || undefined;
      if (action.kind === "receive") {
        await receive({ dealCommissionId: d._id, date, amount: n, method, accountId: acc, reference: ref });
        animatedToast.success("Commission received", { description: `${money(n, c)} from ${d.client}` });
      } else if (action.kind === "deposit") {
        await takeFromDeposit({ dealCommissionId: d._id, date, amount: n });
        animatedToast.success("Commission taken from the deposit", { description: `${money(n, c)} for ${d.client}` });
      } else {
        await payAgent({ dealCommissionId: d._id, agentUserId: action.agent.userId, date, amount: n, method, accountId: acc, reference: ref });
        animatedToast.success("Agent paid", { description: `${money(n, c)} to ${action.agent.name}` });
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
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
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
          {action.kind !== "deposit" && (
            <>
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
                <Label>{action.kind === "receive" ? "Into account" : "From account"}</Label>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">{method === "cash" ? `Cash float (${c})` : `Business account (${c})`}</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </div>
        {action.kind !== "deposit" && (
          <div className="space-y-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or slip number" />
          </div>
        )}
      </div>
    </Modal>
  );
}
