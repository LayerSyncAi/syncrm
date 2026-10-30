"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Camera, Coins, Download, Landmark, Mail, Undo2, Wallet } from "lucide-react";
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
import { FormError, Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import type { FinanceDocument } from "@/lib/finance/pdf";
import { uploadPhoto } from "@/lib/stay-ops/photos";
import {
  ACCOUNT_TYPE_LABELS,
  METHOD_OPTIONS,
  TX_KIND_LABELS,
  dateLabel,
  formatTotals,
  money,
  parseAmount,
  periodRange,
  signed,
  thisMonth,
  todayLocal,
  type CurrencyTotals,
} from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type Fin = NonNullable<FunctionReturnType<typeof api.finance.settings.get>>;
type Account = Fin["accounts"][number];
type Row = FunctionReturnType<typeof api.finance.money.list>[number];
type Kind = "receipt" | "payment" | "transfer" | "opening";
type Method = (typeof METHOD_OPTIONS)[number]["value"];
type AccountType = Account["type"];

const round2 = (n: number) => Math.round(n * 100) / 100;

function FinanceMoney() {
  // ?new=in (the dashboard's phone action) opens "Money in" straight away.
  const params = useSearchParams();
  const fin = useQuery(api.finance.settings.get);
  const isStaff = !!fin?.role.isStaff;

  const [tab, setTab] = React.useState<"list" | "cashup">("list");
  const [from, setFrom] = React.useState(periodRange(thisMonth()).from);
  const [to, setTo] = React.useState(todayLocal());
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [kind, setKind] = React.useState("");

  const [modal, setModal] = React.useState<"in" | "out" | "transfer" | null>(params.get("new") === "in" ? "in" : null);
  const [transferFrom, setTransferFrom] = React.useState<{ accountId: string; amount: number } | null>(null);
  const [reversing, setReversing] = React.useState<Row | null>(null);
  const [emailing, setEmailing] = React.useState<Row | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const validRange = !!from && !!to && from <= to;
  const rows = useQuery(
    api.finance.money.list,
    isStaff && validRange
      ? {
          from,
          to,
          q: debounced.trim() || undefined,
          accountId: (accountId || undefined) as Id<"finAccounts"> | undefined,
          kind: (kind || undefined) as Kind | undefined,
        }
      : "skip"
  );

  const pdf = useFinancePdf();
  const convex = useConvex();

  const totals = React.useMemo(() => {
    const moneyIn: CurrencyTotals = {};
    const moneyOut: CurrencyTotals = {};
    for (const r of rows ?? []) {
      if (r.reversed || r.isReversal || r.kind === "transfer" || r.kind === "opening") continue;
      const t = r.amount >= 0 ? moneyIn : moneyOut;
      t[r.currency] = round2((t[r.currency] ?? 0) + Math.abs(r.amount));
    }
    return { moneyIn, moneyOut };
  }, [rows]);

  if (fin === undefined) return <ListSkeleton />;
  if (!isStaff) {
    return (
      <EmptyState
        icon={Wallet}
        title="Money in and out is for the director and accounts"
        description="You can see the landlords of the properties you manage under Trust and landlords."
      />
    );
  }

  const canApprove = fin.role.canApprove;
  const accounts = fin.accounts.filter((a) => a.isActive);

  const download = (r: Row) =>
    pdf(async () => {
      const d = await convex.query(api.finance.money.get, { txId: r._id });
      if (!d) return null;
      const title = d.kind === "receipt" ? "Receipt" : d.kind === "payment" ? "Payment voucher" : d.kind === "transfer" ? "Transfer" : "Opening balance";
      const isIn = d.kind === "receipt";
      const doc: FinanceDocument = {
        agency: d.agency,
        title,
        number: d.number || undefined,
        date: dateLabel(d.date),
        party: d.counterparty ? { label: isIn ? "Received from" : "Paid to", name: d.counterparty } : undefined,
        facts: [
          ["For", d.description],
          ...(d.method ? ([["Method", d.method]] as Array<[string, string]>) : []),
          ...(d.reference ? ([["Reference", d.reference]] as Array<[string, string]>) : []),
          ["Recorded by", d.recordedBy],
        ],
        highlight: { label: isIn ? "Amount received" : d.kind === "transfer" ? "Amount moved" : "Amount paid", value: money(d.amount, d.currency) },
        tables: [
          {
            title: "Where the money went",
            head: ["Item", "Amount"],
            body: d.lines.map((l) => [l.side === "account" ? `Account: ${l.label}` : `For: ${l.label}`, signed(l.amount, d.currency)]),
            alignRight: [1],
          },
        ],
        notes: d.reversed ? [`Reversed${d.reverseReason ? `: ${d.reverseReason}` : ""}.`] : undefined,
        stamp: d.reversed ? "REVERSED" : undefined,
        fileName: `${title} ${d.number || d.description}`,
      };
      return doc;
    });

  const reverseBlock = (r: Row): string | null => {
    if (r.reversed) return "Already reversed";
    if (r.isReversal) return "This is a reversal";
    if (r.fromStay) return "Recorded in SyncStay. Reverse it there and Finance follows.";
    if (r.isFee) return "Commission. Reverse the receipt it came from.";
    if (r.isPayout) return "A payout. Reverse it from Payouts.";
    if (r.kind === "opening") return "Opening balances are undone from the import screen";
    return null;
  };

  const actions = (r: Row) => {
    const block = reverseBlock(r);
    return (
      <div className="flex justify-end gap-1.5">
        <Tooltip content={r.kind === "receipt" ? "Download receipt" : "Download voucher"}>
          <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Download ${r.number || r.description}`} onClick={() => download(r)}>
            <Download className="h-4 w-4" />
          </Button>
        </Tooltip>
        {r.kind === "receipt" && !r.reversed && !r.isReversal && (
          <Tooltip content="Email receipt">
            <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Email ${r.number}`} onClick={() => setEmailing(r)}>
              <Mail className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
        {canApprove && !r.reversed && !r.isReversal && (
          <Tooltip content={block ?? "Reverse"} side="bottom">
            <Button
              variant="secondary"
              className="h-9 w-9 p-0"
              aria-label={`Reverse ${r.number || r.description}`}
              disabled={!!block}
              onClick={() => setReversing(r)}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  const amountCell = (r: Row) =>
    r.kind === "transfer" ? (
      <span className="text-text-muted">{money(r.gross, r.currency)}</span>
    ) : (
      <span className={cn(r.amount > 0 && "text-[var(--status-success-fg)]", r.reversed && "line-through")}>{signed(r.amount, r.currency)}</span>
    );

  const badges = (r: Row) => (
    <div className="mt-1 flex flex-wrap gap-1">
      <Badge variant={r.kind === "receipt" ? "success" : r.kind === "payment" ? "neutral" : "info"}>{TX_KIND_LABELS[r.kind]}</Badge>
      {r.fromStay && <Badge variant="neutral">SyncStay</Badge>}
      {r.isFee && <Badge variant="neutral">Commission</Badge>}
      {r.hasSlip && <Badge variant="neutral">Slip</Badge>}
      {r.reversed && (
        <span title={r.reverseReason ?? undefined}>
          <Badge variant="danger">Reversed</Badge>
        </span>
      )}
      {r.isReversal && <Badge variant="warning">Reversal</Badge>}
    </div>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Money in and out"
        description="Every amount received, paid or moved between accounts. Nothing is deleted; a mistake is reversed."
        actions={
          <>
            <Button onClick={() => setModal("in")} className="h-11 gap-2 px-4">
              <ArrowDownLeft className="h-4 w-4" />
              Money in
            </Button>
            <Button onClick={() => setModal("out")} variant="secondary" className="h-11 gap-2 px-4">
              <ArrowUpRight className="h-4 w-4" />
              Money out
            </Button>
            <Button
              onClick={() => {
                setTransferFrom(null);
                setModal("transfer");
              }}
              variant="secondary"
              className="h-11 gap-2 px-4"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Transfer
            </Button>
          </>
        }
      />

      <div className="inline-flex rounded-[10px] border border-border-strong p-0.5" role="tablist">
        {(
          [
            ["list", "Transactions"],
            ["cashup", "Cash-up"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("rounded-[8px] px-4 py-1.5 text-sm font-medium", tab === k ? "bg-primary-600 text-primary-foreground" : "text-text-muted hover:text-text")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cashup" ? (
        <CashUp
          today={fin.today}
          onBank={(f) => {
            setTransferFrom(f);
            setModal("transfer");
          }}
        />
      ) : (
        <>
          <div className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">All accounts</option>
                  {fin.accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">Everything</option>
                  {Object.entries(TX_KIND_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search</Label>
                <Input placeholder="Number, description, who, reference" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {!validRange && <p className="mt-2 text-sm text-danger">The start date must be on or before the end date.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Money in" value={formatTotals(totals.moneyIn)} tone="good" hint="Excluding transfers and reversed items" />
            <StatTile label="Money out" value={formatTotals(totals.moneyOut)} hint="Excluding transfers and reversed items" />
            <StatTile label="Items" value={String(rows?.length ?? 0)} />
          </div>

          {rows === undefined ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState icon={Coins} title="Nothing in this period" description="Rent and deposits arrive from SyncStay. Record other money here." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>For</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <TableRow key={r._id} className={r.reversed ? "opacity-60" : ""}>
                        <TableCell className="whitespace-nowrap align-top py-2">{dateLabel(r.date)}</TableCell>
                        <TableCell className="py-2">
                          <div className="font-medium">{r.description}</div>
                          <div className="text-xs text-text-muted">
                            {[r.number, r.method, r.reference && `Ref ${r.reference}`].filter(Boolean).join(" · ")}
                          </div>
                          {badges(r)}
                        </TableCell>
                        <TableCell className="py-2 text-sm">{r.counterparty || "-"}</TableCell>
                        <TableCell className="py-2 text-sm">{r.accounts}</TableCell>
                        <TableCell className="py-2 text-sm text-text-muted">{r.allocation || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap py-2 text-right font-medium">{amountCell(r)}</TableCell>
                        <TableCell className="py-2 text-right">{actions(r)}</TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {rows.map((r) => (
                  <div key={r._id} className={cn("rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4", r.reversed && "opacity-70")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{r.description}</p>
                        <p className="truncate text-xs text-text-muted">{[r.counterparty, r.accounts].filter(Boolean).join(" · ")}</p>
                        <p className="text-xs text-text-muted">{[r.number, dateLabel(r.date), r.method].filter(Boolean).join(" · ")}</p>
                      </div>
                      <p className="shrink-0 font-semibold">{amountCell(r)}</p>
                    </div>
                    {badges(r)}
                    <div className="mt-3">{actions(r)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <MoneyInModal open={modal === "in"} onClose={() => setModal(null)} fin={fin} accounts={accounts} />
      <MoneyOutModal open={modal === "out"} onClose={() => setModal(null)} fin={fin} accounts={accounts} />
      <TransferModal open={modal === "transfer"} onClose={() => setModal(null)} fin={fin} accounts={accounts} preset={transferFrom} />
      <ReverseModal row={reversing} onClose={() => setReversing(null)} />
      <EmailModal row={emailing} onClose={() => setEmailing(null)} />
    </div>
  );
}

export default function FinanceMoneyPage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <FinanceMoney />
    </React.Suspense>
  );
}

// ── Shared form bits ─────────────────────────────────────────────────

/** Accounts suited to the entry first, the rest under "Other accounts". */
function AccountSelect({
  accounts,
  value,
  onChange,
  suited,
  currency,
  exclude,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  suited?: AccountType[];
  currency?: string;
  exclude?: string;
}) {
  const list = accounts.filter((a) => (!currency || a.currency === currency) && a._id !== exclude);
  const good = suited ? list.filter((a) => suited.includes(a.type)) : list;
  const other = suited ? list.filter((a) => !suited.includes(a.type)) : [];
  const opt = (a: Account) => (
    <option key={a._id} value={a._id}>
      {a.name} ({ACCOUNT_TYPE_LABELS[a.type]}, {a.currency}, balance {money(a.balance, a.currency)})
    </option>
  );
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pick an account</option>
      {other.length ? (
        <>
          <optgroup label="Suggested">{good.map(opt)}</optgroup>
          <optgroup label="Other accounts">{other.map(opt)}</optgroup>
        </>
      ) : (
        good.map(opt)
      )}
    </Select>
  );
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function ModalFooter({ onClose, onSave, busy, label }: { onClose: () => void; onSave: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={busy}>
        {busy ? "Saving..." : label}
      </Button>
    </div>
  );
}

// ── Money in ─────────────────────────────────────────────────────────

type InPurpose = "income" | "sale_deposit" | "landlord";

function MoneyInModal({ open, onClose, fin, accounts }: { open: boolean; onClose: () => void; fin: Fin; accounts: Account[] }) {
  const recordIn = useMutation(api.finance.money.recordIn);
  const [purpose, setPurpose] = React.useState<InPurpose>("income");
  const [date, setDate] = React.useState(fin.today);
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [leadId, setLeadId] = React.useState("");
  const [landlordId, setLandlordId] = React.useState("");
  const [counterparty, setCounterparty] = React.useState("");
  const [emailTo, setEmailTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const deals = useQuery(api.finance.commissions.saleDeals, open && purpose === "sale_deposit" ? {} : "skip");
  const landlords = useQuery(api.finance.trust.landlords, open && purpose === "landlord" ? {} : "skip");
  const deal = deals?.find((d) => d.leadId === leadId);
  const landlord = landlords?.find((l) => l._id === landlordId);

  React.useEffect(() => {
    if (!open) return;
    setPurpose("income");
    setDate(fin.today);
    setAccountId("");
    setAmount("");
    setMethod("bank_transfer");
    setReference("");
    setDescription("");
    setCategoryId("");
    setLeadId("");
    setLandlordId("");
    setCounterparty("");
    setEmailTo("");
    setError(null);
  }, [open, fin.today]);

  const account = accounts.find((a) => a._id === accountId);
  const incomeCats = fin.categories.filter((c) => c.kind === "income" && c.isActive);

  const save = async () => {
    const n = parseAmount(amount);
    if (!account) return setError("Pick the account the money went into.");
    if (!(n > 0)) return setError("Enter an amount more than zero.");
    if (purpose === "income" && !categoryId) return setError("Pick an income category.");
    if (purpose === "sale_deposit" && !leadId) return setError("Pick the deal this deposit is for.");
    if (purpose === "landlord" && !landlordId) return setError("Pick the landlord.");
    if (deal?.currency && deal.currency !== account.currency) return setError(`This deal is in ${deal.currency}. Pick a ${deal.currency} account.`);
    setBusy(true);
    setError(null);
    try {
      const res = await recordIn({
        purpose,
        date,
        accountId: account._id,
        amount: n,
        method,
        reference: reference.trim() || undefined,
        description: description.trim() || (purpose === "sale_deposit" ? `Sale deposit: ${deal?.client ?? ""}`.trim() : purpose === "landlord" ? `From ${landlord?.name ?? "landlord"}` : ""),
        categoryId: purpose === "income" ? (categoryId as Id<"finCategories">) : undefined,
        leadId: purpose === "sale_deposit" ? (leadId as Id<"leads">) : undefined,
        landlordContactId: purpose === "landlord" ? (landlordId as Id<"contacts">) : undefined,
        counterparty: counterparty.trim() || undefined,
        emailTo: emailTo.trim() || undefined,
      });
      animatedToast.success("Money in recorded", { description: `Receipt ${res.number}, ${money(n, account.currency)}` });
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
      title="Money in"
      description="Money that did not come through SyncStay. A numbered receipt is issued."
      onClose={onClose}
      footer={<ModalFooter onClose={onClose} onSave={save} busy={busy} label="Record money in" />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="What is it?">
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value as InPurpose)}>
            <option value="income">Agency income</option>
            <option value="sale_deposit">Buyer&apos;s deposit on a sale (held in trust)</option>
            <option value="landlord">Money from a landlord (held in trust)</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {purpose === "income" && (
            <Field label="Income category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pick a category</option>
                {incomeCats.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {purpose === "sale_deposit" && (
            <Field label="Deal" hint={deals && deals.length === 0 ? "No open or won buying deals in SynCRM yet." : undefined}>
              <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={deals === undefined}>
                <option value="">{deals === undefined ? "Loading..." : "Pick a deal"}</option>
                {deals?.map((d) => (
                  <option key={d.leadId} value={d.leadId}>
                    {d.client}
                    {d.stage ? `, ${d.stage}` : ""}
                    {d.currency ? ` (${d.currency})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {purpose === "landlord" && (
            <Field label="Landlord">
              <Select value={landlordId} onChange={(e) => setLandlordId(e.target.value)} disabled={landlords === undefined}>
                <option value="">{landlords === undefined ? "Loading..." : "Pick a landlord"}</option>
                {landlords?.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Date">
            <Input type="date" value={date} max={fin.today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid into">
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onChange={(id) => {
                setAccountId(id);
                const a = accounts.find((x) => x._id === id);
                if (a) setMethod(a.type === "cash" ? "cash" : "bank_transfer");
              }}
              suited={purpose === "income" ? ["business", "cash"] : ["trust", "cash"]}
              currency={deal?.currency}
            />
          </Field>
          <Field label={`Amount${account ? ` (${account.currency})` : ""}`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Method">
            <MethodSelect value={method} onChange={setMethod} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank or mobile money reference" />
          </Field>
          <Field label="Received from">
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={purpose === "landlord" ? landlord?.name ?? "Name" : purpose === "sale_deposit" ? deal?.client ?? "Name" : "Name"}
            />
          </Field>
          <Field label="Email receipt to" hint="Optional. Leave blank to use the contact's email, if any.">
            <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder={landlord?.email || "name@example.com"} />
          </Field>
        </div>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the money is for" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Money out ────────────────────────────────────────────────────────

type OutPurpose = "expense" | "landlord_expense";

function MoneyOutModal({ open, onClose, fin, accounts }: { open: boolean; onClose: () => void; fin: Fin; accounts: Account[] }) {
  const recordOut = useMutation(api.finance.money.recordOut);
  const generateUploadUrl = useMutation(api.finance.money.generateUploadUrl);
  const [purpose, setPurpose] = React.useState<OutPurpose>("expense");
  const [date, setDate] = React.useState(fin.today);
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [propertyId, setPropertyId] = React.useState("");
  const [slip, setSlip] = React.useState<{ storageId: string; url: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const properties = useQuery(api.finance.trust.properties, open && purpose === "landlord_expense" ? {} : "skip");

  React.useEffect(() => {
    if (!open) return;
    setPurpose("expense");
    setDate(fin.today);
    setAccountId("");
    setAmount("");
    setMethod("bank_transfer");
    setReference("");
    setDescription("");
    setSupplier("");
    setCategoryId("");
    setPropertyId("");
    setSlip(null);
    setError(null);
  }, [open, fin.today]);

  const account = accounts.find((a) => a._id === accountId);
  const expenseCats = fin.categories.filter((c) => c.kind === "expense" && c.isActive);
  const property = properties?.find((p) => p._id === propertyId);

  const pickSlip = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setSlip(await uploadPhoto(file, () => generateUploadUrl({})));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const n = parseAmount(amount);
    if (!account) return setError("Pick the account the money was paid from.");
    if (!(n > 0)) return setError("Enter an amount more than zero.");
    if (!description.trim()) return setError("Describe the payment.");
    if (purpose === "expense" && !categoryId) return setError("Pick an expense category.");
    if (purpose === "landlord_expense" && !propertyId) return setError("Pick the property.");
    setBusy(true);
    setError(null);
    try {
      const res = await recordOut({
        purpose,
        date,
        accountId: account._id,
        amount: n,
        method,
        reference: reference.trim() || undefined,
        description: description.trim(),
        supplier: supplier.trim() || undefined,
        categoryId: purpose === "expense" ? (categoryId as Id<"finCategories">) : undefined,
        stayPropertyId: purpose === "landlord_expense" ? (propertyId as Id<"stayProperties">) : undefined,
        attachmentId: slip ? (slip.storageId as Id<"_storage">) : undefined,
      });
      animatedToast.success("Money out recorded", { description: `Voucher ${res.number}, ${money(n, account.currency)}` });
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
      title="Money out"
      description="An agency expense, or a cost paid from trust for a landlord. Landlord payouts are made under Payouts."
      onClose={onClose}
      footer={<ModalFooter onClose={onClose} onSave={save} busy={busy || uploading} label="Record money out" />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="What is it?">
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value as OutPurpose)}>
            <option value="expense">Agency expense</option>
            <option value="landlord_expense">Paid for a landlord from trust (repairs, rates, levies)</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {purpose === "expense" ? (
            <Field label="Expense category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pick a category</option>
                {expenseCats.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field
              label="Property"
              hint={property ? `Charged to ${property.landlordName}. Also shown in SyncStay expenses.` : undefined}
            >
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={properties === undefined}>
                <option value="">{properties === undefined ? "Loading..." : "Pick a property"}</option>
                {properties?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.landlordName})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Date">
            <Input type="date" value={date} max={fin.today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid from">
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onChange={(id) => {
                setAccountId(id);
                const a = accounts.find((x) => x._id === id);
                if (a) setMethod(a.type === "cash" ? "cash" : "bank_transfer");
              }}
              suited={purpose === "expense" ? ["business", "cash"] : ["trust"]}
            />
          </Field>
          <Field label={`Amount${account ? ` (${account.currency})` : ""}`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Method">
            <MethodSelect value={method} onChange={setMethod} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or invoice number" />
          </Field>
          <Field label="Supplier">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Who was paid" />
          </Field>
          <Field label="Slip photo" hint="Optional. A photo of the till slip or invoice.">
            <div className="flex items-center gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border-strong px-3 text-sm hover:bg-row-hover">
                <Camera className="h-4 w-4" />
                {uploading ? "Uploading..." : slip ? "Replace photo" : "Add photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickSlip(e.target.files?.[0])} />
              </label>
              {slip && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slip.url} alt="Slip" className="h-10 w-10 rounded object-cover" />
              )}
            </div>
          </Field>
        </div>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For example: fuel for site visits, plumber at unit 3" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Transfer ─────────────────────────────────────────────────────────

function TransferModal({
  open,
  onClose,
  fin,
  accounts,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  fin: Fin;
  accounts: Account[];
  preset: { accountId: string; amount: number } | null;
}) {
  const transfer = useMutation(api.finance.money.transfer);
  const [date, setDate] = React.useState(fin.today);
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(fin.today);
    setFromId(preset?.accountId ?? "");
    setToId("");
    setAmount(preset && preset.amount > 0 ? String(preset.amount) : "");
    setReference("");
    setDescription("");
    setError(null);
  }, [open, fin.today, preset]);

  const from = accounts.find((a) => a._id === fromId);
  const to = accounts.find((a) => a._id === toId);
  const banking = from?.type === "cash";

  const save = async () => {
    const n = parseAmount(amount);
    if (!from || !to) return setError("Pick both accounts.");
    if (!(n > 0)) return setError("Enter an amount more than zero.");
    setBusy(true);
    setError(null);
    try {
      await transfer({
        date,
        fromAccountId: from._id,
        toAccountId: to._id,
        amount: n,
        reference: reference.trim() || undefined,
        description: description.trim() || undefined,
      });
      animatedToast.success(banking ? "Cash banked" : "Transfer recorded", { description: `${money(n, from.currency)} to ${to.name}` });
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
      title={preset ? "Bank cash" : "Transfer"}
      description="Move money between two of the agency's accounts in the same currency. It is neither money in nor money out."
      onClose={onClose}
      footer={<ModalFooter onClose={onClose} onSave={save} busy={busy} label={banking ? "Bank cash" : "Record transfer"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" hint={from?.type === "trust" && !fin.role.canApprove ? "Only a director can move money out of a trust account." : undefined}>
            <AccountSelect
              accounts={accounts}
              value={fromId}
              onChange={(id) => {
                setFromId(id);
                const a = accounts.find((x) => x._id === id);
                if (a && to && to.currency !== a.currency) setToId("");
              }}
            />
          </Field>
          <Field label="To">
            <AccountSelect accounts={accounts} value={toId} onChange={setToId} currency={from?.currency} exclude={fromId} suited={banking ? ["trust", "business"] : undefined} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} max={fin.today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`Amount${from ? ` (${from.currency})` : ""}`} hint={from ? `Balance ${money(from.balance, from.currency)}` : undefined}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={banking ? "Cash banked" : "Transfer"} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Reverse and email ────────────────────────────────────────────────

function ReverseModal({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const reverse = useMutation(api.finance.money.reverse);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setReason("");
    setError(null);
  }, [row]);

  const save = async () => {
    if (!row) return;
    if (!reason.trim()) return setError("Give a reason for the reversal.");
    setBusy(true);
    setError(null);
    try {
      await reverse({ txId: row._id, reason: reason.trim() });
      animatedToast.success("Reversed", { description: row.number || row.description });
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
      title={`Reverse ${row?.number || "item"}`}
      description="It stays on record, marked reversed, and a matching entry undoes it. Any commission taken on it is undone too."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={save} disabled={busy}>
            {busy ? "Reversing..." : "Reverse"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {row && (
          <p className="text-sm">
            {row.description}: {row.kind === "transfer" ? money(row.gross, row.currency) : signed(row.amount, row.currency)} on {dateLabel(row.date)}.
          </p>
        )}
        <Field label="Reason">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: recorded twice, wrong account" />
        </Field>
      </div>
    </Modal>
  );
}

function EmailModal({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const emailReceipt = useMutation(api.finance.money.emailReceipt);
  const [to, setTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setTo("");
    setError(null);
  }, [row]);

  const send = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await emailReceipt({ txId: row._id, to: to.trim() || undefined });
      animatedToast.success("Receipt emailed", { description: row.number });
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
      title={`Email receipt ${row?.number ?? ""}`}
      description="Leave the address blank to send it to the contact on the receipt."
      onClose={onClose}
      footer={<ModalFooter onClose={onClose} onSave={send} busy={busy} label="Send receipt" />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Send to">
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Cash-up ──────────────────────────────────────────────────────────

function CashUp({ today, onBank }: { today: string; onBank: (f: { accountId: string; amount: number }) => void }) {
  const [date, setDate] = React.useState(today);
  const data = useQuery(api.finance.money.cashUp, date ? { date } : "skip");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <div className="space-y-2">
          <Label>Day</Label>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="pb-2 text-sm text-text-muted">Cash each person took in, banked and paid out on the day, and what each float holds.</p>
      </div>

      {data === undefined ? (
        <ListSkeleton />
      ) : (
        <>
          <Section title="Cash floats">
            {data.floats.length === 0 ? (
              <p className="text-sm text-text-muted">No cash floats. A director adds them in Finance settings.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.floats.map((f) => (
                  <li key={f.accountId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-text-muted">Balance at end of {dateLabel(date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{money(f.balance, f.currency)}</span>
                      <Button size="sm" variant="secondary" className="gap-1" disabled={f.balance <= 0} onClick={() => onBank({ accountId: f.accountId, amount: f.balance })}>
                        <Landmark className="h-3.5 w-3.5" />
                        Bank cash
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`By person on ${dateLabel(date)}`}>
            {data.people.length === 0 ? (
              <p className="text-sm text-text-muted">No cash moved on this day.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Person</TableHead>
                        <TableHead className="text-right">Receipts</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Banked</TableHead>
                        <TableHead className="text-right">Paid out</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.map((p) => (
                        <TableRow key={`${p.userId}:${p.currency}`}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">{p.receipts}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money(p.received, p.currency)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money(p.banked, p.currency)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">{money(p.paidOut, p.currency)}</TableCell>
                          <TableCell className={cn("whitespace-nowrap text-right font-semibold", p.onHand !== 0 && "text-[var(--status-warning-fg)]")}>
                            {money(p.onHand, p.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {data.people.map((p) => (
                    <div key={`${p.userId}:${p.currency}`} className="rounded-[10px] border border-border p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <p className="font-medium">{p.name}</p>
                        <p className="font-semibold">On hand {money(p.onHand, p.currency)}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {p.receipts} receipts. Received {money(p.received, p.currency)}, banked {money(p.banked, p.currency)}, paid out {money(p.paidOut, p.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
