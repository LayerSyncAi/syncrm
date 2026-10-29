"use client";

import * as React from "react";
import Link from "next/link";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Ban, Download, ExternalLink, FileText, Lock, Mail, Plus, Receipt, Trash2, X } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { invoiceTotals } from "../../../../../convex/finance/lib";
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
import { FormError, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useFinancePdf } from "@/components/finance/use-pdf";
import {
  CURRENCY_OPTIONS,
  INVOICE_STATUS_LABELS,
  METHOD_OPTIONS,
  addDays,
  dateLabel,
  formatTotals,
  money,
  parseAmount,
  type CurrencyTotals,
  type FinCurrency,
} from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

type Row = {
  _id: string;
  source: "finance" | "stay";
  number: string;
  clientName: string;
  date: string;
  dueDate: string;
  currency: FinCurrency;
  total: number;
  paid: number;
  open: number;
  status: string;
  daysOverdue: number;
  description: string;
};

type Line = { description: string; quantity: string; unitPrice: string; categoryId: string };

const blankLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", categoryId: "" });

function statusBadge(r: Row) {
  if (r.status === "cancelled") return <Badge variant="neutral">Cancelled</Badge>;
  if (r.status === "paid") return <Badge variant="success">Paid</Badge>;
  if (r.daysOverdue > 0) return <Badge variant="danger">{r.daysOverdue} days overdue</Badge>;
  if (r.status === "part_paid") return <Badge variant="warning">Part paid</Badge>;
  return <Badge variant="info">{INVOICE_STATUS_LABELS[r.status] ?? r.status}</Badge>;
}

function sourceBadge(r: Row) {
  return r.source === "stay" ? <Badge variant="secondary">Sync Stay rent</Badge> : <Badge variant="default">Agency</Badge>;
}

export default function FinanceInvoicesPage() {
  const fin = useQuery(api.finance.settings.get);
  const staff = !!fin?.role.isStaff;
  const [openOnly, setOpenOnly] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const rows = useQuery(api.finance.invoices.list, staff ? { open: openOnly } : "skip") as Row[] | undefined;

  const convex = useConvex();
  const pdf = useFinancePdf();
  const emailInvoice = useMutation(api.finance.invoices.email);
  const cancelInvoice = useMutation(api.finance.invoices.cancel);
  const recordPayment = useMutation(api.finance.invoices.recordPayment);

  const [creating, setCreating] = React.useState(false);
  const [paying, setPaying] = React.useState<Row | null>(null);
  const [cancelling, setCancelling] = React.useState<Row | null>(null);

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) => `${r.number} ${r.clientName} ${r.description}`.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = React.useMemo(() => {
    const open: CurrencyTotals = {};
    const overdue: CurrencyTotals = {};
    let overdueCount = 0;
    for (const r of rows ?? []) {
      if (r.status === "cancelled") continue;
      open[r.currency] = Math.round(((open[r.currency] ?? 0) + r.open) * 100) / 100;
      if (r.daysOverdue > 0 && r.open > 0) {
        overdue[r.currency] = Math.round(((overdue[r.currency] ?? 0) + r.open) * 100) / 100;
        overdueCount++;
      }
    }
    return { open, overdue, overdueCount };
  }, [rows]);

  if (fin === undefined) return <ListSkeleton />;
  if (!staff) {
    return <EmptyState icon={Lock} title="Invoices are for directors and accounts staff" description="Ask your director if you need access." />;
  }

  const sendEmail = async (r: Row) => {
    try {
      await emailInvoice({ invoiceId: r._id as Id<"finInvoices"> });
      animatedToast.success("Invoice emailed", { description: `${r.number} to ${r.clientName}` });
    } catch (e) {
      animatedToast.error("Could not email the invoice", { description: getErrorMessage(e) });
    }
  };

  const downloadPdf = (r: Row) =>
    pdf(async () => {
      const inv = await convex.query(api.finance.invoices.get, { invoiceId: r._id as Id<"finInvoices"> });
      if (!inv) return null;
      const c = inv.currency;
      const still = Math.round((inv.total - inv.amountPaid) * 100) / 100;
      const totalsRows: Array<[string, string]> = [];
      if (inv.vat > 0) {
        totalsRows.push(["Subtotal", money(inv.subtotal, c)]);
        totalsRows.push([`VAT ${inv.vatRate}%`, money(inv.vat, c)]);
      }
      if (inv.amountPaid > 0) {
        totalsRows.push(["Total", money(inv.total, c)]);
        totalsRows.push(["Paid", money(inv.amountPaid, c)]);
        totalsRows.push(["Still to pay", money(still, c)]);
      } else {
        totalsRows.push(["Total", money(inv.total, c)]);
      }
      return {
        agency: inv.agency,
        title: "Invoice",
        number: inv.number,
        date: dateLabel(inv.date),
        party: { label: "To", name: inv.clientName, lines: inv.clientEmail ? [inv.clientEmail] : [] },
        facts: [
          ["Invoice date", dateLabel(inv.date)],
          ["Due date", dateLabel(inv.dueDate)],
          ["Currency", c],
          ...(inv.agency.vatNumber ? ([["VAT number", inv.agency.vatNumber]] as Array<[string, string]>) : []),
        ],
        tables: [
          {
            head: ["Description", "Qty", "Unit price", "Amount"],
            body: inv.lines.map((l) => [l.description, String(l.quantity), money(l.unitPrice, c), money(l.quantity * l.unitPrice, c)]),
            alignRight: [1, 2, 3],
          },
        ],
        totals: totalsRows,
        notes: inv.notes ? [inv.notes] : undefined,
        stamp: inv.status === "cancelled" ? "CANCELLED" : inv.status === "paid" ? "PAID" : undefined,
        fileName: `Invoice ${inv.number} ${inv.clientName}`,
      };
    });

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip content={label}>
      <Button variant="secondary" className="h-9 w-9 p-0" aria-label={label} onClick={onClick}>
        {icon}
      </Button>
    </Tooltip>
  );

  const actions = (r: Row) =>
    r.source === "stay" ? (
      <div className="flex justify-end">
        <Link href="/app/stay/arrears" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
          Open in Sync Stay
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    ) : (
      <div className="flex justify-end gap-1.5">
        {r.status !== "cancelled" && r.open > 0 && iconButton(`Record payment on ${r.number}`, <Receipt className="h-4 w-4" />, () => setPaying(r))}
        {iconButton(`Download ${r.number}`, <Download className="h-4 w-4" />, () => downloadPdf(r))}
        {r.status !== "cancelled" && iconButton(`Email ${r.number}`, <Mail className="h-4 w-4" />, () => sendEmail(r))}
        {r.status !== "cancelled" && r.paid === 0 && iconButton(`Cancel ${r.number}`, <Ban className="h-4 w-4" />, () => setCancelling(r))}
      </div>
    );

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Invoices"
        description="Agency invoices and Sync Stay rent in one list. Amounts are shown per currency and never converted."
        actions={
          <Button onClick={() => setCreating(true)} className="h-11 gap-2 px-5">
            <Plus className="h-4 w-4" />
            New invoice
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Still to be paid" value={formatTotals(totals.open)} />
        <StatTile label="Overdue" value={formatTotals(totals.overdue)} tone={totals.overdueCount ? "danger" : "default"} />
        <StatTile label="Overdue invoices" value={String(totals.overdueCount)} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="min-w-[220px] flex-1 space-y-2">
          <Label>Search</Label>
          <Input placeholder="Number, client or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open only
        </label>
      </div>

      {rows === undefined ? (
        <ListSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={openOnly ? "Nothing is waiting to be paid" : "No invoices yet"}
          description="Invoice a client for commission, fees or any other service."
          action={
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New invoice
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <TableRow key={`${r.source}-${r._id}`} className={r.status === "cancelled" ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{r.number}</div>
                      <div className="mt-1">{sourceBadge(r)}</div>
                    </TableCell>
                    <TableCell>
                      <div>{r.clientName}</div>
                      <div className="max-w-[260px] truncate text-xs text-text-muted" title={r.description}>
                        {r.description}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{dateLabel(r.dueDate)}</div>
                      <div className="text-xs text-text-muted">Issued {dateLabel(r.date)}</div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(r.total, r.currency)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(r.paid, r.currency)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{money(r.open, r.currency)}</TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    <TableCell className="text-right">{actions(r)}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {shown.map((r) => (
              <div key={`${r.source}-${r._id}`} className={`rounded-[12px] border border-border-strong bg-card-bg p-4 ${r.status === "cancelled" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.clientName}</p>
                    <p className="truncate text-xs text-text-muted">{r.description}</p>
                    <p className="text-xs text-text-muted">
                      {r.number} · due {dateLabel(r.dueDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{money(r.open, r.currency)}</p>
                    <p className="text-xs text-text-muted">of {money(r.total, r.currency)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {sourceBadge(r)}
                  {statusBadge(r)}
                </div>
                <div className="mt-3">{actions(r)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {creating && (
        <CreateInvoiceModal
          onClose={() => setCreating(false)}
          today={fin.today}
          vatEnabled={fin.settings.vatEnabled}
          vatRate={fin.settings.vatRate}
          categories={fin.categories.filter((c) => c.kind === "income" && c.isActive).map((c) => ({ _id: c._id, name: c.name }))}
        />
      )}

      {paying && (
        <PaymentModal
          row={paying}
          today={fin.today}
          accounts={fin.accounts.filter((a) => a.isActive && a.currency === paying.currency).map((a) => ({ _id: a._id, name: a.name }))}
          onClose={() => setPaying(null)}
          onSubmit={async (args) => {
            const res = await recordPayment({ invoiceId: paying._id as Id<"finInvoices">, ...args });
            animatedToast.success("Payment recorded", { description: `Receipt ${res.number} on ${paying.number}` });
            setPaying(null);
          }}
        />
      )}

      {cancelling && (
        <CancelModal
          row={cancelling}
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await cancelInvoice({ invoiceId: cancelling._id as Id<"finInvoices">, reason });
            animatedToast.success("Invoice cancelled", { description: cancelling.number });
            setCancelling(null);
          }}
        />
      )}
    </div>
  );
}

function CreateInvoiceModal({
  onClose,
  today,
  vatEnabled,
  vatRate,
  categories,
}: {
  onClose: () => void;
  today: string;
  vatEnabled: boolean;
  vatRate: number;
  categories: Array<{ _id: Id<"finCategories">; name: string }>;
}) {
  const create = useMutation(api.finance.invoices.create);
  const [contact, setContact] = React.useState<{ _id: Id<"contacts">; name: string; email?: string } | null>(null);
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(addDays(today, 7));
  const [currency, setCurrency] = React.useState<FinCurrency>("USD");
  const [lines, setLines] = React.useState<Line[]>([blankLine()]);
  const [notes, setNotes] = React.useState("");
  const [emailNow, setEmailNow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const found = useQuery(api.contacts.list, !contact && debounced.length >= 2 ? { q: debounced, role: "all", pageSize: 6 } : "skip");

  const parsed = lines.map((l) => ({ quantity: parseAmount(l.quantity) || 0, unitPrice: parseAmount(l.unitPrice) || 0 }));
  const preview = invoiceTotals(parsed, vatEnabled ? vatRate : 0);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    const name = clientName.trim() || contact?.name || "";
    if (!name) return setError("Who is the invoice to? Pick a contact or type a name.");
    if (!date || !dueDate) return setError("Enter the invoice date and due date.");
    if (dueDate < date) return setError("The due date is before the invoice date.");
    const out = [];
    for (const l of lines) {
      if (!l.description.trim() && !l.unitPrice.trim()) continue;
      const quantity = parseAmount(l.quantity);
      const unitPrice = parseAmount(l.unitPrice);
      if (!l.description.trim()) return setError("Each line needs a description.");
      if (!(quantity > 0)) return setError(`Enter a quantity for "${l.description.trim()}".`);
      if (!(unitPrice > 0)) return setError(`Enter a price for "${l.description.trim()}".`);
      out.push({ description: l.description.trim(), quantity, unitPrice, categoryId: (l.categoryId || undefined) as Id<"finCategories"> | undefined });
    }
    if (!out.length) return setError("Add at least one line.");
    if (emailNow && !clientEmail.trim() && !contact?.email) return setError("Add the client's email address to send it now.");
    setBusy(true);
    try {
      const res = await create({
        contactId: contact?._id,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        date,
        dueDate,
        currency,
        lines: out,
        notes: notes.trim() || undefined,
        email: emailNow,
      });
      animatedToast.success(`Invoice ${res.number} created`, { description: emailNow ? `Emailed to ${name}` : name });
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
      title="New invoice"
      description="Invoice a client for commission, fees or any other service."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : emailNow ? "Create and email" : "Create invoice"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />

        <div className="space-y-2">
          <Label>Client</Label>
          {contact ? (
            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-strong px-3 py-2 text-sm">
              <span>
                {contact.name}
                {contact.email ? <span className="text-text-muted"> · {contact.email}</span> : null}
              </span>
              <Button variant="ghost" className="h-8 px-2" aria-label="Remove contact" onClick={() => setContact(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Input placeholder="Search Hub contacts by name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
              {found && found.items.length > 0 && (
                <div className="divide-y divide-border rounded-[10px] border border-border-strong">
                  {found.items.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setContact({ _id: c._id, name: c.name, email: c.email ?? undefined });
                        setClientName("");
                        setClientEmail("");
                        setSearch("");
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.email ? <span className="text-text-muted"> · {c.email}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">Or type the client&apos;s details below.</p>
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name on the invoice</Label>
            <Input value={clientName} placeholder={contact?.name ?? "Client name"} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={clientEmail} placeholder={contact?.email ?? "client@example.com"} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Invoice date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as FinCurrency)}>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Lines</Label>
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-[10px] border border-border p-3">
              <div className="flex gap-2">
                <Input placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                {lines.length > 1 && (
                  <Button variant="ghost" className="h-10 w-10 shrink-0 p-0" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[80px_1fr_1.4fr]">
                <Input inputMode="decimal" aria-label="Quantity" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Input inputMode="decimal" aria-label="Unit price" placeholder={`Unit price (${currency})`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                <Select className="col-span-2 sm:col-span-1" aria-label="Income category" value={l.categoryId} onChange={(e) => setLine(i, { categoryId: e.target.value })}>
                  <option value="">Category: other income</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
          <Button variant="secondary" className="gap-2" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>

        <div className="rounded-[10px] bg-surface-2 p-3 text-sm">
          {vatEnabled && (
            <div className="flex justify-between">
              <span className="text-text-muted">Subtotal</span>
              <span>{money(preview.subtotal, currency)}</span>
            </div>
          )}
          {vatEnabled && (
            <div className="flex justify-between">
              <span className="text-text-muted">VAT {vatRate}%</span>
              <span>{money(preview.vat, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{money(preview.total, currency)}</span>
          </div>
          {vatEnabled && <p className="mt-2 text-xs text-text-muted">The agency is VAT registered, so VAT at {vatRate}% is added to every invoice.</p>}
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment details or anything the client should know" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={emailNow} onChange={(e) => setEmailNow(e.target.checked)} />
          Email it to the client now
        </label>
      </div>
    </Modal>
  );
}

function PaymentModal({
  row,
  today,
  accounts,
  onClose,
  onSubmit,
}: {
  row: Row;
  today: string;
  accounts: Array<{ _id: Id<"finAccounts">; name: string }>;
  onClose: () => void;
  onSubmit: (args: { date: string; accountId: Id<"finAccounts">; amount: number; method: Method; reference?: string }) => Promise<void>;
}) {
  const [date, setDate] = React.useState(today);
  const [accountId, setAccountId] = React.useState<string>(accounts[0]?._id ?? "");
  const [amount, setAmount] = React.useState(String(row.open));
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    const n = parseAmount(amount);
    if (!accountId) return setError(`Pick the ${row.currency} account the money went into.`);
    if (!(n > 0)) return setError("Enter the amount received.");
    if (n > row.open) return setError(`Only ${money(row.open, row.currency)} is unpaid.`);
    setBusy(true);
    try {
      await onSubmit({ date, accountId: accountId as Id<"finAccounts">, amount: n, method, reference: reference.trim() || undefined });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Record payment on ${row.number}`}
      description={`${row.clientName}. Balance ${money(row.open, row.currency)}.`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !accounts.length}>
            {busy ? "Saving..." : "Record payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {!accounts.length && <p className="text-sm text-danger">There is no {row.currency} account yet. A director can add one in Finance settings.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date received</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Amount ({row.currency})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Into account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
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
        </div>
        <div className="space-y-2">
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or slip number" />
        </div>
      </div>
    </Modal>
  );
}

function CancelModal({ row, onClose, onSubmit }: { row: Row; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Give a reason.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={`Cancel invoice ${row.number}`}
      description="The invoice stays on record, marked cancelled. The client no longer owes it."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Cancelling..." : "Cancel invoice"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <p className="text-sm">
          {money(row.total, row.currency)} to {row.clientName}.
        </p>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: issued in error, replaced by a new invoice" />
        </div>
      </div>
    </Modal>
  );
}
