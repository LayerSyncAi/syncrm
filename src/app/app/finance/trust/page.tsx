"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRightLeft, Landmark, Scale, Send } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { ACCOUNT_TYPE_LABELS, addMonths, money, parseAmount, periodLabel, thisMonth } from "@/lib/finance/format";
import { heldInLabel } from "@/lib/stay/format";
import { cn } from "@/lib/utils";

const lastMonth = () => addMonths(thisMonth(), -1);

export default function TrustPage() {
  const fin = useQuery(api.finance.settings.get);
  const isStaff = !!fin?.role.isStaff;
  const summary = useQuery(api.finance.trust.summary, isStaff ? {} : "skip");
  const deposits = useQuery(api.finance.trust.deposits, isStaff ? {} : "skip");
  const recs = useQuery(api.finance.trust.reconciliations, isStaff ? {} : "skip");
  const landlords = useQuery(api.finance.trust.landlords, fin ? {} : "skip");

  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState<"reconcile" | "commission" | "send" | null>(null);

  if (fin === undefined) return <ListSkeleton />;

  const q = search.trim().toLowerCase();
  const shownLandlords = (landlords ?? []).filter((l) => !q || l.name.toLowerCase().includes(q));

  const landlordSection = (
    <Section
      title="Landlords"
      actions={<Input className="h-9 w-48" placeholder="Search landlords" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search landlords" />}
    >
      {landlords === undefined ? (
        <ListSkeleton />
      ) : shownLandlords.length === 0 ? (
        <p className="text-sm text-text-muted">{landlords.length ? "No landlord matches that search." : "No landlords yet. They appear once a property is set up in SyncStay."}</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Landlord</TableHead>
                  <TableHead className="text-right">Properties</TableHead>
                  <TableHead className="text-right">USD held</TableHead>
                  <TableHead className="text-right">ZiG held</TableHead>
                  <TableHead className="text-right">Statement</TableHead>
                </tr>
              </thead>
              <tbody>
                {shownLandlords.map((l) => (
                  <TableRow key={l._id}>
                    <TableCell>
                      <Link href={`/app/finance/trust/${l._id}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                      {!l.email && <div className="text-xs text-text-muted">No email address</div>}
                    </TableCell>
                    <TableCell className="text-right">{l.properties}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right", l.USD < 0 && "text-danger")}>{money(l.USD, "USD")}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right", l.ZiG < 0 && "text-danger")}>{money(l.ZiG, "ZiG")}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/app/finance/trust/${l._id}`} className="text-sm text-primary-ink hover:underline">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {shownLandlords.map((l) => (
              <Link key={l._id} href={`/app/finance/trust/${l._id}`} className="block rounded-[10px] border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-text-muted">
                      {l.properties} {l.properties === 1 ? "property" : "properties"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm font-semibold">
                    <div>{money(l.USD, "USD")}</div>
                    <div>{money(l.ZiG, "ZiG")}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Section>
  );

  if (!isStaff) {
    return (
      <div className="space-y-6">
        <StayPageHeader title="Trust and landlords" description="What the agency holds for the landlords of the properties you manage. Open a landlord for their statement." />
        {landlordSection}
      </div>
    );
  }

  const monthEnd = fin.settings.commissionTiming === "month_end";

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Trust and landlords"
        description="Client money the agency holds: landlords, tenant deposits, sale deposits and developers."
        actions={
          <>
            <Button onClick={() => setModal("send")} className="gap-2">
              <Send className="h-4 w-4" />
              Bulk send statements
            </Button>
            {monthEnd && (
              <Button variant="secondary" onClick={() => setModal("commission")} className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Move commission for a month
              </Button>
            )}
            <Button variant="secondary" onClick={() => setModal("reconcile")} className="gap-2">
              <Scale className="h-4 w-4" />
              Reconcile
            </Button>
          </>
        }
      />

      {summary === undefined ? (
        <ListSkeleton />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.currencies.map((c) => (
            <Section key={c.currency} title={`Held in trust, ${c.currency}`} actions={<span className="text-lg font-semibold">{money(c.held, c.currency)}</span>}>
              <dl className="divide-y divide-border text-sm">
                {(
                  [
                    ["Landlords", c.landlords],
                    ["Tenant deposits", c.deposits],
                    ["Sale deposits", c.sales],
                    ["Developers", c.developers],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between py-1.5">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="font-medium">{money(value, c.currency)}</dd>
                  </div>
                ))}
                <div className="flex justify-between py-1.5">
                  <dt className="text-text-muted">Unallocated</dt>
                  <dd className={cn("font-medium", c.unallocated !== 0 && "text-[var(--status-warning-fg)]")}>{money(c.unallocated, c.currency)}</dd>
                </div>
              </dl>
              {c.unallocated !== 0 && (
                <p className="mt-2 text-xs text-text-muted">Unallocated is opening trust money not yet matched to a landlord or deposit.</p>
              )}
            </Section>
          ))}
          <Section title="Account balances" className="lg:col-span-2">
            {summary.accounts.length === 0 ? (
              <p className="text-sm text-text-muted">No accounts yet.</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {summary.accounts
                  .filter((a) => a.isActive || a.balance !== 0)
                  .map((a) => (
                    <li key={a._id} className="flex justify-between gap-2 border-b border-border py-1.5">
                      <span>
                        {a.name} <span className="text-xs text-text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                      </span>
                      <span className={cn("font-medium", a.balance < 0 && "text-danger")}>{money(a.balance, a.currency)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {landlordSection}

      <Section title="Tenant deposits">
        {deposits === undefined ? (
          <ListSkeleton />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-text-muted">No tenant deposits held.</p>
        ) : (
          <>
            {deposits.some((d) => d.held !== d.stayHeld) && (
              <p className="mb-3 flex items-center gap-2 text-sm text-[var(--status-warning-fg)]">
                <AlertTriangle className="h-4 w-4" />
                Some deposits differ from what SyncStay shows. Check them before the month is closed.
              </p>
            )}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Held in</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                    <TableHead className="text-right">SyncStay shows</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => {
                    const off = d.held !== d.stayHeld;
                    return (
                      <TableRow key={d._id}>
                        <TableCell className="font-medium">{d.tenantName}</TableCell>
                        <TableCell className="text-sm">{d.property}</TableCell>
                        <TableCell className="text-sm">{heldInLabel(d.heldIn)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">{money(d.held, d.currency)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {off ? <Badge variant="warning">{money(d.stayHeld, d.currency)}</Badge> : <span className="text-text-muted">{money(d.stayHeld, d.currency)}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {deposits.map((d) => (
                <div key={d._id} className="rounded-[10px] border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{d.tenantName}</p>
                    <p className="font-semibold">{money(d.held, d.currency)}</p>
                  </div>
                  <p className="text-xs text-text-muted">
                    {d.property}. {heldInLabel(d.heldIn)}
                  </p>
                  {d.held !== d.stayHeld && <Badge variant="warning">SyncStay shows {money(d.stayHeld, d.currency)}</Badge>}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Monthly reconciliation"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setModal("reconcile")}>
            Reconcile an account
          </Button>
        }
      >
        {recs === undefined ? (
          <ListSkeleton />
        ) : recs.rows.length === 0 ? (
          <p className="text-sm text-text-muted">At each month end, enter the bank statement balance for each account. The difference should be zero.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Month</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Bank says</TableHead>
                    <TableHead className="text-right">We show</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Note</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {recs.rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="whitespace-nowrap">{periodLabel(r.month)}</TableCell>
                      <TableCell>{r.account}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(r.bankBalance, r.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(r.systemBalance, r.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {r.difference === 0 ? <Badge variant="success">Matches</Badge> : <Badge variant="danger">{money(r.difference, r.currency)}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-text-muted">
                        {r.note || "-"}
                        <div className="text-xs">{r.by}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {recs.rows.map((r) => (
                <div key={r._id} className="rounded-[10px] border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">
                      {r.account}, {periodLabel(r.month)}
                    </p>
                    {r.difference === 0 ? <Badge variant="success">Matches</Badge> : <Badge variant="danger">{money(r.difference, r.currency)}</Badge>}
                  </div>
                  <p className="text-xs text-text-muted">
                    Bank {money(r.bankBalance, r.currency)}, we show {money(r.systemBalance, r.currency)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <ReconcileModal open={modal === "reconcile"} onClose={() => setModal(null)} accounts={fin.accounts.filter((a) => a.isActive)} />
      <CommissionModal open={modal === "commission"} onClose={() => setModal(null)} />
      <BulkSendModal open={modal === "send"} onClose={() => setModal(null)} landlords={landlords ?? []} />
    </div>
  );
}

function ReconcileModal({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Array<{ _id: Id<"finAccounts">; name: string; currency: "USD" | "ZiG"; type: "trust" | "business" | "cash" }>;
}) {
  const reconcile = useMutation(api.finance.trust.reconcile);
  const [accountId, setAccountId] = React.useState("");
  const [month, setMonth] = React.useState(lastMonth);
  const [bank, setBank] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAccountId(accounts.find((a) => a.type === "trust")?._id ?? "");
    setMonth(lastMonth());
    setBank("");
    setNote("");
    setError(null);
  }, [open, accounts]);

  const account = accounts.find((a) => a._id === accountId);

  const save = async () => {
    const n = parseAmount(bank);
    if (!account) return setError("Pick an account.");
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Pick a month.");
    if (!Number.isFinite(n)) return setError("Enter the balance on the bank statement.");
    setBusy(true);
    setError(null);
    try {
      await reconcile({ accountId: account._id, month, bankBalance: n, note: note.trim() || undefined });
      animatedToast.success("Reconciliation saved", { description: `${account.name}, ${periodLabel(month)}` });
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
      title="Reconcile an account"
      description="Enter the balance on the bank statement at the end of the month. We compare it with our records."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Pick an account</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({ACCOUNT_TYPE_LABELS[a.type]}, {a.currency})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bank statement balance{account ? ` (${account.currency})` : ""}</Label>
            <Input inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Note</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain any difference, for example uncleared cheques" />
        </div>
      </div>
    </Modal>
  );
}

function CommissionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const move = useMutation(api.finance.posting.moveCommissionBatch);
  const [month, setMonth] = React.useState(lastMonth);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMonth(lastMonth());
      setError(null);
    }
  }, [open]);

  const save = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Pick a month.");
    setBusy(true);
    setError(null);
    try {
      const res = await move({ month });
      animatedToast.success(res.moved ? `Commission moved on ${res.moved} receipts` : "No commission left to move", { description: periodLabel(month, true) });
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
      title="Move commission for a month"
      description="Your agency takes commission at month end. This moves the commission on every receipt in the month from the landlords' money to the agency."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Moving..." : "Move commission"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Month</Label>
          <Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <p className="text-sm text-text-muted">Receipts already done are skipped, so running it twice is safe.</p>
      </div>
    </Modal>
  );
}

function BulkSendModal({
  open,
  onClose,
  landlords,
}: {
  open: boolean;
  onClose: () => void;
  landlords: Array<{ _id: Id<"contacts">; name: string; email: string; USD: number; ZiG: number }>;
}) {
  const send = useMutation(api.finance.trust.sendLandlordStatements);
  const [month, setMonth] = React.useState(lastMonth);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [result, setResult] = React.useState<{ sent: number; skipped: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMonth(lastMonth());
    setPicked(new Set(landlords.filter((l) => l.email).map((l) => l._id)));
    setResult(null);
    setError(null);
    // Pick defaults only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const go = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Pick a month.");
    if (!picked.size) return setError("Tick at least one landlord.");
    setBusy(true);
    setError(null);
    try {
      const res = await send({ month, landlordIds: [...picked] as Id<"contacts">[] });
      setResult(res);
      animatedToast.success(`${res.sent} ${res.sent === 1 ? "statement" : "statements"} sent`, { description: periodLabel(month, true) });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const withEmail = landlords.filter((l) => l.email);

  return (
    <Modal
      open={open}
      title="Bulk send statements"
      description="Email each ticked landlord their statement for the month. Landlords without an email address are skipped."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={go} disabled={busy || !picked.size} className="gap-2">
              <Send className="h-4 w-4" />
              {busy ? "Sending..." : `Send ${picked.size} ${picked.size === 1 ? "statement" : "statements"}`}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {result ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              {result.sent} sent for {periodLabel(month, true)}.
            </p>
            {result.skipped.length > 0 && (
              <p className="text-text-muted">Skipped (no email address): {result.skipped.join(", ")}.</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <Label>Month</Label>
                <Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div className="flex gap-2 text-sm">
                <button type="button" className="text-primary-ink hover:underline" onClick={() => setPicked(new Set(withEmail.map((l) => l._id)))}>
                  Tick all with email
                </button>
                <button type="button" className="text-primary-ink hover:underline" onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              </div>
            </div>
            {landlords.length === 0 ? (
              <EmptyState icon={Landmark} title="No landlords" />
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-[10px] border border-border">
                {landlords.map((l) => (
                  <li key={l._id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", !l.email && "opacity-60")}>
                      <input type="checkbox" className="h-4 w-4" checked={picked.has(l._id)} disabled={!l.email} onChange={() => toggle(l._id)} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{l.name}</span>
                        <span className="block truncate text-xs text-text-muted">{l.email || "No email address"}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-text-muted">
                        {money(l.USD, "USD")}
                        <br />
                        {money(l.ZiG, "ZiG")}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
