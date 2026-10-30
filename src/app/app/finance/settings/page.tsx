"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Coins, EyeOff, FileSpreadsheet, Lock, Pencil, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { ACCOUNT_TYPE_LABELS, CURRENCY_OPTIONS, addMonths, money, periodLabel } from "@/lib/finance/format";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";

type Settings = {
  commissionTiming: "on_receipt" | "month_end";
  landlordPayouts: "per_receipt" | "monthly";
  depositHeldIn: "trust" | "business" | "landlord";
  vatEnabled: boolean;
  vatRate: string;
  approvers: "one" | "two";
  invoicePrefix: string;
  payoutPrefix: string;
  paymentPrefix: string;
  standReminderDays: string;
};

type Account = Doc<"finAccounts"> & { balance: number };
type Category = Doc<"finCategories">;

function Choice<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-text-muted">{label}</legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 text-sm transition-colors ${
              value === o.value ? "border-primary-600 bg-primary-600/5" : "border-border-strong"
            } ${disabled ? "cursor-default opacity-80" : ""}`}
          >
            <input type="radio" className="mt-1" checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function FinanceSettingsPage() {
  const data = useQuery(api.finance.settings.get);

  if (data === undefined) return <ListSkeleton />;
  if (!data.role.isStaff) {
    return (
      <EmptyState
        icon={Coins}
        title="Finance settings are for the accounts team"
        description="Ask a director if you need to see how SyncFinance is set up."
        action={
          <Link href="/app/finance">
            <Button variant="secondary">Back to Finance</Button>
          </Link>
        }
      />
    );
  }

  const isDirector = data.role.isDirector;
  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Finance settings"
        description={isDirector ? "How commission, payouts, deposits, VAT and approvals work for your agency." : "Only a director can change these settings."}
        actions={
          isDirector && (
            <Link href="/app/finance/import">
              <Button variant="secondary" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Import and migrate
              </Button>
            </Link>
          )
        }
      />
      <AgencySettings settings={data.settings} canEdit={isDirector} />
      <Accounts accounts={data.accounts as Account[]} canEdit={isDirector} />
      <Categories categories={data.categories} canEdit={data.role.isStaff} />
      <CloseMonth lockedThrough={data.settings.lockedThrough} today={data.today} canEdit={isDirector} />
    </div>
  );
}

// ── Agency settings (FN-05) ──────────────────────────────────────────

function AgencySettings({
  settings,
  canEdit,
}: {
  settings: {
    commissionTiming: Settings["commissionTiming"];
    landlordPayouts: Settings["landlordPayouts"];
    depositHeldIn: Settings["depositHeldIn"];
    vatEnabled: boolean;
    vatRate: number;
    approvers: Settings["approvers"];
    invoicePrefix: string;
    payoutPrefix: string;
    paymentPrefix: string;
    standReminderDays: number;
  };
  canEdit: boolean;
}) {
  const update = useMutation(api.finance.settings.update);
  const [form, setForm] = React.useState<Settings>(() => ({
    commissionTiming: settings.commissionTiming,
    landlordPayouts: settings.landlordPayouts,
    depositHeldIn: settings.depositHeldIn,
    vatEnabled: settings.vatEnabled,
    vatRate: String(settings.vatRate),
    approvers: settings.approvers,
    invoicePrefix: settings.invoicePrefix,
    payoutPrefix: settings.payoutPrefix,
    paymentPrefix: settings.paymentPrefix,
    standReminderDays: String(settings.standReminderDays),
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<Settings>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    const vatRate = Number(form.vatRate);
    const days = Number(form.standReminderDays);
    if (!(vatRate >= 0 && vatRate <= 50)) return setError("VAT rate must be between 0 and 50.");
    if (!Number.isInteger(days) || days < 1 || days > 30) return setError("Reminder days must be a whole number from 1 to 30.");
    setSaving(true);
    setError(null);
    try {
      await update({
        commissionTiming: form.commissionTiming,
        landlordPayouts: form.landlordPayouts,
        depositHeldIn: form.depositHeldIn,
        vatEnabled: form.vatEnabled,
        vatRate,
        approvers: form.approvers,
        invoicePrefix: form.invoicePrefix,
        payoutPrefix: form.payoutPrefix,
        paymentPrefix: form.paymentPrefix,
        standReminderDays: days,
      });
      animatedToast.success("Settings saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canEdit;
  return (
    <Section title="Agency settings">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Choice
            label="When commission moves out of trust"
            value={form.commissionTiming}
            disabled={disabled}
            onChange={(v) => set({ commissionTiming: v })}
            options={[
              { value: "on_receipt", label: "On each receipt", hint: "Your commission moves to the business account as soon as rent is received." },
              { value: "month_end", label: "Month-end batch", hint: "Commission builds up in trust and moves in one batch at the end of the month." },
            ]}
          />
          <Choice
            label="When landlords are paid"
            value={form.landlordPayouts}
            disabled={disabled}
            onChange={(v) => set({ landlordPayouts: v })}
            options={[
              { value: "per_receipt", label: "As rent is received", hint: "A landlord can be paid as soon as their rent comes in." },
              { value: "monthly", label: "Monthly", hint: "Each landlord is paid once a month, after their statement." },
            ]}
          />
          <Choice
            label="Where tenant deposits are held by default"
            value={form.depositHeldIn}
            disabled={disabled}
            onChange={(v) => set({ depositHeldIn: v })}
            options={[
              { value: "trust", label: "Trust account", hint: "Held for the tenant in the trust account." },
              { value: "business", label: "Business account", hint: "Held in the agency's own account." },
              { value: "landlord", label: "Paid to the landlord", hint: "Passed on to the landlord, who holds it." },
            ]}
          />
          <Choice
            label="Approvals for landlord payouts"
            value={form.approvers}
            disabled={disabled}
            onChange={(v) => set({ approvers: v })}
            options={[
              { value: "one", label: "One approver", hint: "A director can prepare and approve a payout alone." },
              { value: "two", label: "Two approvers", hint: "Another director must approve a payout a director prepared." },
            ]}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>VAT</Label>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.vatEnabled} disabled={disabled} onChange={(e) => set({ vatEnabled: e.target.checked })} />
              Charge VAT on invoices
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat-rate">VAT rate (%)</Label>
            <Input
              id="vat-rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={50}
              step="0.01"
              value={form.vatRate}
              disabled={disabled || !form.vatEnabled}
              onChange={(e) => set({ vatRate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-days">Instalment reminder days</Label>
            <Input
              id="reminder-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={form.standReminderDays}
              disabled={disabled}
              onChange={(e) => set({ standReminderDays: e.target.value })}
            />
            <p className="text-xs text-text-muted">Buyers are reminded this many days before an instalment falls due.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="inv-prefix">Invoice prefix</Label>
            <Input id="inv-prefix" maxLength={12} value={form.invoicePrefix} disabled={disabled} onChange={(e) => set({ invoicePrefix: e.target.value })} placeholder="INV-" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-prefix">Payout prefix</Label>
            <Input id="po-prefix" maxLength={12} value={form.payoutPrefix} disabled={disabled} onChange={(e) => set({ payoutPrefix: e.target.value })} placeholder="PO-" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pv-prefix">Payment voucher prefix</Label>
            <Input id="pv-prefix" maxLength={12} value={form.paymentPrefix} disabled={disabled} onChange={(e) => set({ paymentPrefix: e.target.value })} placeholder="PV-" />
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm text-text-muted">
          <p>
            Receipt numbers share SyncStay&apos;s sequence. Change the receipt prefix in{" "}
            <Link href="/app/stay/settings" className="text-primary-ink hover:underline">
              Stay settings
            </Link>
            .
          </p>
          <p>
            The agency name, address and VAT number on documents come from{" "}
            <Link href="/app/settings" className="text-primary-ink hover:underline">
              Agency settings
            </Link>
            , and the logo from the{" "}
            <Link href="/app/admin/branding" className="text-primary-ink hover:underline">
              Brand kit
            </Link>
            .
          </p>
        </div>

        <FormError message={error} />
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Accounts (FN-01) ─────────────────────────────────────────────────

type AccountForm = {
  name: string;
  type: "trust" | "business" | "cash";
  currency: "USD" | "ZiG";
  bankName: string;
  accountNumber: string;
  branch: string;
  isActive: boolean;
};

const EMPTY_ACCOUNT: AccountForm = { name: "", type: "trust", currency: "USD", bankName: "", accountNumber: "", branch: "", isActive: true };

function Accounts({ accounts, canEdit }: { accounts: Account[]; canEdit: boolean }) {
  const createAccount = useMutation(api.finance.settings.createAccount);
  const updateAccount = useMutation(api.finance.settings.updateAccount);
  const [editing, setEditing] = React.useState<{ id: Id<"finAccounts"> | null; form: AccountForm } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const sorted = [...accounts].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));

  function open(a?: Account) {
    setError(null);
    setEditing(
      a
        ? {
            id: a._id,
            form: { name: a.name, type: a.type, currency: a.currency, bankName: a.bankName ?? "", accountNumber: a.accountNumber ?? "", branch: a.branch ?? "", isActive: a.isActive },
          }
        : { id: null, form: { ...EMPTY_ACCOUNT } }
    );
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) return setError("Name the account.");
    setSaving(true);
    setError(null);
    const body = { name: f.name, type: f.type, currency: f.currency, bankName: f.bankName, accountNumber: f.accountNumber, branch: f.branch };
    try {
      if (editing.id) await updateAccount({ accountId: editing.id, isActive: f.isActive, ...body });
      else await createAccount(body);
      animatedToast.success(editing.id ? "Account updated" : "Account added");
      setEditing(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const setF = (patch: Partial<AccountForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <Section
      title="Accounts"
      actions={
        canEdit && (
          <Button size="sm" className="gap-1" onClick={() => open()}>
            <Plus className="h-4 w-4" />
            Add account
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-text-muted">Bank accounts and cash floats. Trust accounts hold client money; business and cash accounts hold the agency&apos;s own.</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-text-muted">No accounts yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Bank details</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((a) => (
              <TableRow key={a._id} className={a.isActive ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  {a.name}
                  {!a.isActive && (
                    <Badge variant="neutral" className="ml-2">
                      Off
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                <TableCell>{a.currency}</TableCell>
                <TableCell className="text-text-muted">{[a.bankName, a.accountNumber, a.branch].filter(Boolean).join(", ") || "-"}</TableCell>
                <TableCell className={`whitespace-nowrap text-right ${a.balance < 0 ? "text-danger" : ""}`}>{money(a.balance, a.currency)}</TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => open(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? "Edit account" : "Add account"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" value={editing.form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="CBZ Trust Account" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="acc-type">Type</Label>
                <Select id="acc-type" value={editing.form.type} onChange={(e) => setF({ type: e.target.value as AccountForm["type"] })}>
                  <option value="trust">Trust</option>
                  <option value="business">Business</option>
                  <option value="cash">Cash</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-cur">Currency</Label>
                <Select id="acc-cur" value={editing.form.currency} onChange={(e) => setF({ currency: e.target.value as AccountForm["currency"] })}>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {editing.id && <p className="text-xs text-text-muted">Type and currency cannot change once the account has transactions.</p>}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="acc-bank">Bank</Label>
                <Input id="acc-bank" value={editing.form.bankName} onChange={(e) => setF({ bankName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-no">Account number</Label>
                <Input id="acc-no" value={editing.form.accountNumber} onChange={(e) => setF({ accountNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-branch">Branch</Label>
                <Input id="acc-branch" value={editing.form.branch} onChange={(e) => setF({ branch: e.target.value })} />
              </div>
            </div>
            {editing.id && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={editing.form.isActive} onChange={(e) => setF({ isActive: e.target.checked })} />
                <span>
                  Account is in use
                  <span className="block text-text-muted">Switch off an account you no longer use. Its balance must be zero first.</span>
                </span>
              </label>
            )}
            <FormError message={error} />
          </div>
        )}
      </Modal>
    </Section>
  );
}

// ── Categories (FN-03) ───────────────────────────────────────────────

function Categories({ categories, canEdit }: { categories: Category[]; canEdit: boolean }) {
  const createCategory = useMutation(api.finance.settings.createCategory);
  const updateCategory = useMutation(api.finance.settings.updateCategory);
  const [adding, setAdding] = React.useState<{ kind: "income" | "expense"; name: string } | null>(null);
  const [renaming, setRenaming] = React.useState<{ id: Id<"finCategories">; name: string; isActive: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!adding) return;
    if (!adding.name.trim()) return setError("Name the category.");
    setBusy(true);
    setError(null);
    try {
      await createCategory({ kind: adding.kind, name: adding.name });
      setAdding(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!renaming) return;
    if (!renaming.name.trim()) return setError("Name the category.");
    setBusy(true);
    setError(null);
    try {
      await updateCategory({ categoryId: renaming.id, name: renaming.name, isActive: renaming.isActive });
      setRenaming(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Category) {
    try {
      await updateCategory({ categoryId: c._id, name: c.name, isActive: !c.isActive });
    } catch (e) {
      animatedToast.error("Could not change the category", { description: getErrorMessage(e) });
    }
  }

  const column = (kind: "income" | "expense") => {
    const list = categories.filter((c) => c.kind === kind).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{kind === "income" ? "Income" : "Expenses"}</h3>
          {canEdit && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setError(null); setAdding({ kind, name: "" }); }}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border rounded-[10px] border border-border-strong">
          {list.map((c) => (
            <li key={c._id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${c.isActive ? "" : "text-text-muted"}`}>
              <span className="min-w-0 truncate">
                {c.name}
                {!c.isActive && (
                  <Badge variant="neutral" className="ml-2">
                    Hidden
                  </Badge>
                )}
                {c.key && <span className="ml-2 text-xs text-text-muted">Used by the system</span>}
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setError(null); setRenaming({ id: c._id, name: c.name, isActive: c.isActive }); }}>
                    Rename
                  </Button>
                  {(!c.key || !c.isActive) && (
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => toggle(c)}>
                      {c.isActive ? <EyeOff className="h-3.5 w-3.5" /> : null}
                      {c.isActive ? "Hide" : "Show"}
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">None yet.</li>}
        </ul>
      </div>
    );
  };

  return (
    <Section title="Categories">
      <p className="mb-4 text-sm text-text-muted">How the agency&apos;s own income and expenses are grouped in reports. Hidden categories stay on past transactions.</p>
      <div className="grid gap-6 md:grid-cols-2">
        {column("income")}
        {column("expense")}
      </div>

      <Modal
        open={!!adding}
        title={adding?.kind === "income" ? "Add an income category" : "Add an expense category"}
        onClose={() => setAdding(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy}>
              Add
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="cat-new">Name</Label>
          <Input id="cat-new" value={adding?.name ?? ""} onChange={(e) => setAdding((a) => (a ? { ...a, name: e.target.value } : a))} />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={!!renaming}
        title="Rename category"
        onClose={() => setRenaming(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={busy}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={renaming?.name ?? ""} onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))} />
          <FormError message={error} />
        </div>
      </Modal>
    </Section>
  );
}

// ── Close a month ────────────────────────────────────────────────────

function CloseMonth({ lockedThrough, today, canEdit }: { lockedThrough?: string; today: string; canEdit: boolean }) {
  const setLockedThrough = useMutation(api.finance.settings.setLockedThrough);
  const lastMonth = addMonths(today.slice(0, 7), -1);
  const [month, setMonth] = React.useState(lockedThrough && lockedThrough < lastMonth ? addMonths(lockedThrough, 1) : lastMonth);
  const [confirm, setConfirm] = React.useState<"close" | "reopen" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await setLockedThrough({ month: confirm === "close" ? month : undefined });
      animatedToast.success(confirm === "close" ? `Closed up to ${periodLabel(month, true)}` : "All months reopened");
      setConfirm(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Close a month">
      <div className="space-y-4 text-sm">
        <p className="text-text-muted">Transactions in a closed month cannot change. Mistakes are reversed in the current month.</p>
        <p className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-text-muted" />
          {lockedThrough ? (
            <span>
              Closed up to and including <span className="font-medium">{periodLabel(lockedThrough, true)}</span>.
            </span>
          ) : (
            <span>No months are closed.</span>
          )}
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="close-month">Close every month up to</Label>
              <Input id="close-month" type="month" max={lastMonth} value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <Button onClick={() => { setError(null); setConfirm("close"); }} disabled={!month || month > lastMonth || month === lockedThrough}>
              Close months
            </Button>
            {lockedThrough && (
              <Button variant="secondary" onClick={() => { setError(null); setConfirm("reopen"); }}>
                Reopen all
              </Button>
            )}
          </div>
        )}
        {canEdit && lockedThrough && month < lockedThrough && (
          <p className="text-[var(--status-warning-fg)]">Closing up to an earlier month reopens the months after it.</p>
        )}
      </div>

      <Modal
        open={!!confirm}
        title={confirm === "close" ? `Close up to ${month ? periodLabel(month, true) : ""}` : "Reopen all months"}
        onClose={() => setConfirm(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={confirm === "reopen" ? "destructive" : "primary"} onClick={apply} disabled={busy}>
              {confirm === "close" ? "Close months" : "Reopen all"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            {confirm === "close"
              ? "No one will be able to add, change or reverse a transaction dated in these months."
              : "Every past month opens again, so back-dated transactions can be added. Close them again once you are done."}
          </p>
          <FormError message={error} />
        </div>
      </Modal>
    </Section>
  );
}
