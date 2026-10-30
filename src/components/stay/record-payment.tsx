"use client";

/**
 * "Record payment", the most frequent Stay task (BRD §6): a quick action on
 * every Stay page. Pick the tenant, confirm amount and method, and a numbered
 * receipt is issued and emailed. Built for a phone: one column, big targets.
 */
import * as React from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { CheckCircle2, Download, Receipt, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError } from "./page-header";
import { HELD_IN_OPTIONS, METHOD_OPTIONS, money, parseAmount, todayLocal } from "@/lib/stay/format";
import { downloadReceiptPdf } from "@/lib/stay/pdf";
import { cn } from "@/lib/utils";

type Ctx = { open: (leaseId?: Id<"stayLeases">) => void };
const RecordPaymentContext = React.createContext<Ctx>({ open: () => {} });

export function useRecordPayment() {
  return React.useContext(RecordPaymentContext);
}

/** Download a receipt PDF with the agency logo. */
export function useDownloadReceipt() {
  const convex = useConvex();
  return React.useCallback(
    async (paymentId: Id<"stayPayments">) => {
      try {
        const [receipt, branding] = await Promise.all([
          convex.query(api.stay.payments.getReceipt, { paymentId }),
          convex.query(api.branding.get, {}).catch(() => null),
        ]);
        if (!receipt) throw new Error("Receipt not found");
        await downloadReceiptPdf(receipt, branding?.logoUrl);
      } catch (e) {
        animatedToast.error("Could not create the receipt", { description: getErrorMessage(e) });
      }
    },
    [convex]
  );
}

export function RecordPaymentProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ open: boolean; leaseId?: Id<"stayLeases">; key: number }>({ open: false, key: 0 });
  const open = React.useCallback((leaseId?: Id<"stayLeases">) => setState((s) => ({ open: true, leaseId, key: s.key + 1 })), []);
  const value = React.useMemo(() => ({ open }), [open]);
  return (
    <RecordPaymentContext.Provider value={value}>
      {children}
      <RecordPaymentModal
        key={state.key}
        open={state.open}
        initialLeaseId={state.leaseId}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </RecordPaymentContext.Provider>
  );
}

/** The floating quick action, shown on every Stay page. */
export function RecordPaymentButton() {
  const { open } = useRecordPayment();
  return (
    <button
      type="button"
      onClick={() => open()}
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:bg-primary-600 active:scale-[0.97] md:right-8 md:bottom-8"
    >
      <Receipt className="h-5 w-5" />
      Record payment
    </button>
  );
}

type Picked = {
  leaseId: Id<"stayLeases">;
  status: string;
  tenantName: string;
  tenantEmail: string | null;
  propertyName: string;
  unitLabel: string;
  currency: "USD" | "ZiG";
  rentAmount: number;
  balance: number;
  overdue: number;
  depositOutstanding: number;
};

function RecordPaymentModal({
  open,
  initialLeaseId,
  onClose,
}: {
  open: boolean;
  initialLeaseId?: Id<"stayLeases">;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [purpose, setPurpose] = React.useState<"rent" | "deposit">("rent");
  const [amount, setAmount] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(todayLocal());
  const [method, setMethod] = React.useState<(typeof METHOD_OPTIONS)[number]["value"]>("cash");
  const [reference, setReference] = React.useState("");
  const [heldIn, setHeldIn] = React.useState<(typeof HELD_IN_OPTIONS)[number]["value"]>("trust");
  const [emailReceipt, setEmailReceipt] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState<{ paymentId: Id<"stayPayments">; receiptNumber: string; amount: string; emailed: boolean } | null>(null);

  const record = useMutation(api.stay.payments.record);
  const downloadReceipt = useDownloadReceipt();

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery(
    api.stay.leases.searchForPayment,
    open && !picked ? (initialLeaseId && !q ? { leaseId: initialLeaseId } : { q: debounced || undefined }) : "skip"
  );

  // Opening from a lease page skips the search step.
  React.useEffect(() => {
    if (initialLeaseId && !picked && !q && results?.length === 1) choose(results[0] as Picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, initialLeaseId]);

  function choose(p: Picked) {
    setPicked(p);
    setPurpose("rent");
    setAmount(p.balance > 0 ? String(p.balance) : String(p.rentAmount));
    setEmailReceipt(!!p.tenantEmail);
    setError(null);
  }

  function reset() {
    setPicked(null);
    setQ("");
    setAmount("");
    setReference("");
    setPaidOn(todayLocal());
    setMethod("cash");
    setError(null);
    setDone(null);
  }

  async function submit() {
    if (!picked) return;
    const value = parseAmount(amount);
    if (!(value > 0)) return setError("Enter the amount received.");
    if (!paidOn) return setError("Enter the payment date.");
    setSaving(true);
    setError(null);
    try {
      const res = await record({
        leaseId: picked.leaseId,
        purpose,
        paidOn,
        amount: value,
        currency: picked.currency,
        method,
        reference: reference.trim() || undefined,
        depositHeldIn: purpose === "deposit" ? heldIn : undefined,
        emailReceipt,
      });
      setDone({ ...res, amount: money(value, picked.currency), emailed: emailReceipt && !!picked.tenantEmail });
      animatedToast.success(`Receipt ${res.receiptNumber} issued`, { description: `${money(value, picked.currency)} from ${picked.tenantName}` });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const title = done ? "Payment recorded" : picked ? "Record payment" : "Record payment: find the tenant";

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        done ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={reset} className="h-12 sm:h-10">
              Record another
            </Button>
            <Button onClick={() => downloadReceipt(done.paymentId)} className="h-12 sm:h-10">
              <Download className="h-4 w-4" />
              Download receipt
            </Button>
          </div>
        ) : picked ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setPicked(null)} disabled={saving} className="h-12 sm:h-10">
              Back
            </Button>
            <Button onClick={submit} disabled={saving} className="h-12 bg-emerald-600 hover:bg-emerald-700 sm:h-10">
              {saving ? "Saving..." : `Record ${amount ? money(parseAmount(amount) || 0, picked.currency) : "payment"}`}
            </Button>
          </div>
        ) : undefined
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <p className="text-lg font-semibold">Receipt {done.receiptNumber}</p>
          <p className="text-text-muted">
            {done.amount} from {picked?.tenantName}
          </p>
          <p className="text-sm text-text-muted">{done.emailed ? "The receipt has been emailed to the tenant." : "The tenant has no email address, so no email was sent."}</p>
        </div>
      ) : !picked ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              autoFocus
              className="h-12 pl-9 text-base"
              placeholder="Tenant, property or unit"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {results === undefined ? (
            <p className="py-4 text-center text-sm text-text-muted">Loading...</p>
          ) : results.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">No matching leases.</p>
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border-strong">
              {results.map((r) => (
                <li key={r.leaseId}>
                  <button
                    type="button"
                    onClick={() => choose(r as Picked)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-row-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.tenantName}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {r.propertyName}, {r.unitLabel}
                        {r.status !== "active" ? " (ended)" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className={cn("block font-medium", r.overdue > 0 && "text-danger")}>{money(r.balance, r.currency)}</span>
                      <span className="block text-xs text-text-muted">{r.overdue > 0 ? "overdue" : "balance"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[10px] bg-surface-2 p-3 text-sm">
            <p className="font-semibold">{picked.tenantName}</p>
            <p className="text-text-muted">
              {picked.propertyName}, {picked.unitLabel}
            </p>
            <p className="mt-1">
              Balance {money(picked.balance, picked.currency)}
              {picked.overdue > 0 && <span className="text-danger">, {money(picked.overdue, picked.currency)} overdue</span>}
            </p>
          </div>

          <FormError message={error} />

          {picked.depositOutstanding > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {(["rent", "deposit"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPurpose(p);
                    setAmount(String(p === "deposit" ? picked.depositOutstanding : picked.balance > 0 ? picked.balance : picked.rentAmount));
                  }}
                  className={cn(
                    "h-11 rounded-[10px] border text-sm font-medium",
                    purpose === p ? "border-emerald-600 bg-emerald-600/10 text-emerald-700" : "border-border-strong"
                  )}
                >
                  {p === "rent" ? "Rent and charges" : `Deposit (${money(picked.depositOutstanding, picked.currency)} due)`}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>Amount received ({picked.currency})</Label>
            <Input className="h-12 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-text-muted">This lease is in {picked.currency}. Amounts are never converted.</p>
          </div>

          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-2 gap-2">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "h-11 rounded-[10px] border text-sm font-medium",
                    method === m.value ? "border-emerald-600 bg-emerald-600/10 text-emerald-700" : "border-border-strong"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date paid</Label>
              <Input type="date" className="h-12 sm:h-10" value={paidOn} max={todayLocal()} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input className="h-12 sm:h-10" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank or EcoCash reference" />
            </div>
          </div>

          {purpose === "deposit" && (
            <div className="space-y-2">
              <Label>Deposit held in</Label>
              <div className="grid grid-cols-3 gap-2">
                {HELD_IN_OPTIONS.map((h) => (
                  <button
                    key={h.value}
                    type="button"
                    onClick={() => setHeldIn(h.value)}
                    className={cn(
                      "min-h-11 rounded-[10px] border px-2 text-xs font-medium",
                      heldIn === h.value ? "border-emerald-600 bg-emerald-600/10 text-emerald-700" : "border-border-strong"
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={emailReceipt && !!picked.tenantEmail}
              disabled={!picked.tenantEmail}
              onChange={(e) => setEmailReceipt(e.target.checked)}
            />
            {picked.tenantEmail ? `Email the receipt to ${picked.tenantEmail}` : "No email address on file for this tenant"}
          </label>
        </div>
      )}
    </Modal>
  );
}
