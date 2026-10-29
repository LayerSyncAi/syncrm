"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Pencil, Receipt, Trash2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildPlan } from "../../../convex/finance/lib";
import { parseStandNumbers } from "../../../convex/dev/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Facts, FormError } from "@/components/stay/page-header";
import { addDays, dateLabel, money, parseAmount, type FinCurrency } from "@/lib/finance/format";
import { ModalFooter, PlanPreview, nextMonthSameDay, r2 } from "@/components/sales/modals";
import { cn } from "@/lib/utils";

export type InventoryStand = FunctionReturnType<typeof api.dev.inventory.list>["stands"][number];
export type StandStatus = InventoryStand["status"];

export const STATUS_LABELS: Record<StandStatus, string> = { available: "Available", reserved: "Reserved", sold: "Sold" };

const TILE_CLASS: Record<StandStatus, string> = {
  available: "border-[var(--status-success-fg)]/40 bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  reserved: "border-[var(--status-warning-fg)]/40 bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  sold: "border-emerald-900 bg-emerald-900 text-white",
};

/** "USD 25k" for a small tile; the full figure goes in the tooltip. */
export function compactMoney(n: number, currency: string): string {
  const v = n >= 1_000_000 ? `${r2(n / 1_000_000)}m` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(r2(n));
  return `${currency} ${v}`;
}

/** One stand in the grid, coloured by status. */
export function StandTile({ stand, currency, onClick }: { stand: InventoryStand; currency: FinCurrency; onClick: () => void }) {
  const overdue = !!stand.sale && stand.sale.overdue > 0;
  const tip = [
    `Stand ${stand.number}: ${STATUS_LABELS[stand.status]}`,
    stand.sale ? `${stand.sale.buyerName}, owes ${money(stand.sale.balance, currency)}` : money(stand.price, currency),
    stand.reservedFor ? `For ${stand.reservedFor.name}${stand.reservedFor.until ? ` until ${dateLabel(stand.reservedFor.until)}` : ""}` : "",
    stand.sizeSqm ? `${stand.sizeSqm} m²` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      title={tip}
      onClick={onClick}
      className={cn(
        "relative flex min-h-[56px] flex-col items-center justify-center rounded-[8px] border px-1 py-1.5 text-center transition hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600",
        TILE_CLASS[stand.status],
        overdue && "border-2 border-danger"
      )}
    >
      {overdue && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-label="Overdue" />}
      <span className="max-w-full truncate text-sm font-semibold">{stand.number}</span>
      <span className="max-w-full truncate text-[11px] opacity-80">{stand.status === "sold" && stand.sale ? stand.sale.buyerName.split(" ")[0] : compactMoney(stand.price, currency)}</span>
    </button>
  );
}

// ── Toast with a follow-up action ────────────────────────────────────

type ToastAction = { label: string; onClick: () => void };

export function actionToast(title: string, description: string, action: ToastAction, secondary?: ToastAction) {
  toast.custom(
    (id) => (
      <div className="flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-[10px] border border-l-[3px] border-border-strong border-l-green-500 bg-card-bg px-3.5 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">{title}</p>
          <p className="text-xs text-text-muted">{description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                toast.dismiss(id);
                action.onClick();
              }}
            >
              {action.label}
            </Button>
            {secondary && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  toast.dismiss(id);
                  secondary.onClick();
                }}
              >
                {secondary.label}
              </Button>
            )}
          </div>
        </div>
        <button type="button" className="shrink-0 rounded p-0.5 text-text-muted hover:bg-border hover:text-text" onClick={() => toast.dismiss(id)} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    { duration: 12000 }
  );
}

// ── Stand panel ──────────────────────────────────────────────────────

export type SoldSale = {
  _id: Id<"finStands">;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  paidToDate: number;
  balance: number;
  overdue: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  status: "active" | "paid" | "cancelled";
};

export type SoldInfo = { saleId: Id<"finStands">; buyerName: string; buyerEmail: string; price: number; firstPayment: number };

/**
 * Everything one stand allows, in one modal: reserve or sell when available,
 * release or sell when reserved, the buyer's position when sold.
 */
export function StandPanel({
  stand,
  sale,
  currency,
  developmentName,
  canManage,
  canRelease,
  today,
  onClose,
  onEdit,
  onTakePayment,
  onSold,
}: {
  stand: InventoryStand;
  sale: SoldSale | null;
  currency: FinCurrency;
  developmentName: string;
  canManage: boolean;
  /** The person who reserved it, or a sales manager. */
  canRelease: boolean;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onTakePayment: () => void;
  onSold: (info: SoldInfo) => void;
}) {
  const [mode, setMode] = React.useState<"view" | "reserve" | "sell">(stand.status === "available" ? (canManage ? "sell" : "reserve") : "view");
  const release = useMutation(api.dev.inventory.release);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const c = currency;

  const doRelease = async () => {
    setBusy(true);
    setError(null);
    try {
      await release({ standId: stand._id });
      animatedToast.success(`Stand ${stand.number} released`, { description: "It is available again." });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const facts = [
    { label: "Price", value: money(stand.sale ? null : stand.price, c) },
    { label: "Size", value: stand.sizeSqm ? `${stand.sizeSqm} m²` : "" },
    ...(stand.notes ? [{ label: "Notes", value: stand.notes }] : []),
  ].filter((f) => f.value && f.value !== "-");

  const description = `${STATUS_LABELS[stand.status]} · ${developmentName}`;
  const editButton = canManage ? (
    <Button variant="ghost" size="sm" className="gap-1" onClick={onEdit}>
      <Pencil className="h-3.5 w-3.5" />
      Edit stand
    </Button>
  ) : null;

  if (mode === "sell") {
    return (
      <SellForm
        stand={stand}
        currency={c}
        today={today}
        prefill={stand.reservedFor ? { name: stand.reservedFor.name, phone: stand.reservedFor.phone ?? "" } : undefined}
        onBack={stand.status === "available" && !canManage ? undefined : () => setMode(stand.status === "available" ? "reserve" : "view")}
        backLabel={stand.status === "available" ? "Reserve instead" : "Back"}
        onClose={onClose}
        onSold={onSold}
      />
    );
  }
  if (mode === "reserve") {
    return <ReserveForm stand={stand} today={today} canSell={canManage} onSell={() => setMode("sell")} onClose={onClose} extra={editButton} facts={facts} />;
  }

  // Reserved or sold.
  return (
    <Modal
      open
      title={`Stand ${stand.number}`}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {stand.status === "reserved" && (
            <>
              {canRelease && (
                <Button variant="secondary" onClick={doRelease} disabled={busy}>
                  {busy ? "Releasing..." : "Release"}
                </Button>
              )}
              {canManage && <Button onClick={() => setMode("sell")}>Sell to {stand.reservedFor?.name.split(" ")[0] ?? "buyer"}</Button>}
            </>
          )}
          {stand.status === "sold" && stand.sale && (
            <>
              {canManage && sale?.status === "active" && (
                <Button variant="secondary" className="gap-2" onClick={onTakePayment}>
                  <Receipt className="h-4 w-4" />
                  Take payment
                </Button>
              )}
              <Link href={`/app/dev/buyers/${stand.sale._id}`}>
                <Button className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open buyer account
                </Button>
              </Link>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {stand.status === "reserved" && stand.reservedFor && (
          <Facts
            items={[
              { label: "Reserved for", value: stand.reservedFor.name },
              { label: "Phone", value: stand.reservedFor.phone ?? "" },
              { label: "Until", value: stand.reservedFor.until ? dateLabel(stand.reservedFor.until) : "No end date" },
              ...facts,
            ]}
          />
        )}
        {stand.status === "sold" && stand.sale && (
          <Facts
            items={[
              { label: "Buyer", value: stand.sale.buyerName },
              { label: "Phone", value: sale?.buyerPhone ?? "" },
              { label: "Paid", value: money(stand.sale.paidToDate, c) },
              { label: "Balance", value: money(stand.sale.balance, c) },
              { label: "Overdue", value: <span className={stand.sale.overdue > 0 ? "text-danger" : ""}>{money(stand.sale.overdue, c)}</span> },
              { label: "Next due", value: sale?.nextDueDate ? `${money(sale.nextDueAmount, c)} on ${dateLabel(sale.nextDueDate)}` : "" },
              ...facts,
            ]}
          />
        )}
        {editButton}
      </div>
    </Modal>
  );
}

function ReserveForm({
  stand,
  today,
  canSell,
  onSell,
  onClose,
  extra,
  facts,
}: {
  stand: InventoryStand;
  today: string;
  canSell: boolean;
  onSell: () => void;
  onClose: () => void;
  extra: React.ReactNode;
  facts: Array<{ label: string; value: React.ReactNode }>;
}) {
  const reserve = useMutation(api.dev.inventory.reserve);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [until, setUntil] = React.useState(addDays(today, 7));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Who is it reserved for?");
    setBusy(true);
    try {
      await reserve({ standId: stand._id, name: name.trim(), phone: phone.trim() || undefined, until: until || undefined });
      animatedToast.success(`Stand ${stand.number} reserved`, { description: `For ${name.trim()}${until ? ` until ${dateLabel(until)}` : ""}` });
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
      title={`Reserve stand ${stand.number}`}
      description="Hold it for someone. It is released on its own after the date."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {canSell && (
            <Button variant="ghost" onClick={onSell} disabled={busy}>
              Sell instead
            </Button>
          )}
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Reserve"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {facts.length > 0 && <Facts items={facts} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Phone (optional)</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Until (optional)</Label>
            <Input type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        {extra}
      </div>
    </Modal>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sell a stand on an even plan: 10% deposit today, then 12 monthly payments
 * from the same day next month. The plan is shown as it will be saved.
 */
function SellForm({
  stand,
  currency,
  today,
  prefill,
  onBack,
  backLabel,
  onClose,
  onSold,
}: {
  stand: InventoryStand;
  currency: FinCurrency;
  today: string;
  prefill?: { name: string; phone: string };
  onBack?: () => void;
  backLabel: string;
  onClose: () => void;
  onSold: (info: SoldInfo) => void;
}) {
  const sell = useMutation(api.dev.inventory.sell);
  const c = currency;
  const [name, setName] = React.useState(prefill?.name ?? "");
  const [phone, setPhone] = React.useState(prefill?.phone ?? "");
  const [email, setEmail] = React.useState("");
  const [price, setPrice] = React.useState(String(stand.price));
  const [deposit, setDeposit] = React.useState(String(r2(stand.price * 0.1)));
  const [depositTouched, setDepositTouched] = React.useState(false);
  const [depositDue, setDepositDue] = React.useState(today);
  const [count, setCount] = React.useState("12");
  const [firstDue, setFirstDue] = React.useState(nextMonthSameDay(today));
  const [editPlan, setEditPlan] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const p = parseAmount(price);
  const dep = deposit.trim() ? parseAmount(deposit) : 0;
  const n = parseInt(count, 10);
  const valid = p > 0 && dep >= 0 && dep <= p && n >= 0 && DATE_RE.test(firstDue) && (dep === 0 || DATE_RE.test(depositDue));
  const rows = valid ? buildPlan(p, dep, depositDue, n, firstDue) : [];
  const monthly = rows.find((r) => r.label !== "Deposit");

  const onPrice = (v: string) => {
    setPrice(v);
    const np = parseAmount(v);
    if (!depositTouched && np > 0) setDeposit(String(r2(np * 0.1)));
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter the buyer's name.");
    if (!(p > 0)) return setError("Enter the price.");
    if (!valid || !rows.length) {
      setEditPlan(true);
      return setError("Check the deposit, number of payments and dates.");
    }
    setBusy(true);
    try {
      const saleId = await sell({
        standId: stand._id,
        buyerName: name.trim(),
        buyerPhone: phone.trim() || undefined,
        buyerEmail: email.trim() || undefined,
        price: p !== stand.price ? p : undefined,
        plan: { deposit: dep, depositDue, count: n, firstDue },
      });
      onSold({ saleId, buyerName: name.trim(), buyerEmail: email.trim(), price: p, firstPayment: rows[0]?.amount ?? 0 });
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
      title={`Sell stand ${stand.number}`}
      description="The buyer is added to your contacts and gets reminders before each payment."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {onBack && (
            <Button variant="ghost" onClick={onBack} disabled={busy}>
              {backLabel}
            </Button>
          )}
          <Button onClick={submit} disabled={busy}>
            {busy ? "Selling..." : `Sell for ${money(p > 0 ? p : 0, c)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Buyer name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!prefill} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Price ({c})</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => onPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Deposit ({c})</Label>
            <Input
              inputMode="decimal"
              value={deposit}
              onChange={(e) => {
                setDeposit(e.target.value);
                setDepositTouched(true);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-text-muted">
              {valid && monthly
                ? `Deposit ${dateLabel(depositDue)}, then ${n} monthly ${n === 1 ? "payment" : "payments"} of about ${money(monthly.amount, c)} from ${dateLabel(firstDue)}.`
                : "Set the plan."}
            </p>
            <button type="button" className="text-sm font-medium text-primary-600 hover:underline" onClick={() => setEditPlan((v) => !v)}>
              {editPlan ? "Hide plan options" : "Change plan"}
            </button>
          </div>
          {editPlan && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Deposit due</Label>
                <Input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Monthly payments</Label>
                <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>First payment due</Label>
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </div>
            </div>
          )}
          <PlanPreview rows={rows} currency={c} />
        </div>
      </div>
    </Modal>
  );
}

// ── Add and edit stands ──────────────────────────────────────────────

export function AddStandsModal({
  developmentId,
  currency,
  defaultPrice,
  onClose,
}: {
  developmentId: Id<"finDevelopments">;
  currency: FinCurrency;
  /** The development's usual price, so adding stands takes one field. */
  defaultPrice?: number;
  onClose: () => void;
}) {
  const add = useMutation(api.dev.inventory.add);
  const [numbers, setNumbers] = React.useState("");
  const [price, setPrice] = React.useState(defaultPrice ? String(defaultPrice) : "");
  const [size, setSize] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const parsed = numbers.trim() ? parseStandNumbers(numbers) : null;
  const count = parsed && "numbers" in parsed ? parsed.numbers.length : 0;

  const submit = async () => {
    setError(null);
    if (!parsed) return setError("Enter the stand numbers.");
    if ("error" in parsed) return setError(parsed.error);
    const p = parseAmount(price);
    if (!(p > 0)) return setError("Enter the price.");
    const s = size.trim() ? parseAmount(size) : undefined;
    if (s !== undefined && !(s > 0)) return setError("Size must be more than zero.");
    setBusy(true);
    try {
      const res = await add({ developmentId, numbers, price: p, sizeSqm: s });
      animatedToast.success(`${res.added} ${res.added === 1 ? "stand" : "stands"} added`, {
        description: res.skipped.length ? `Already there, left as they were: ${res.skipped.slice(0, 8).join(", ")}${res.skipped.length > 8 ? "..." : ""}` : `At ${money(p, currency)} each`,
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
      open
      title="Add stands"
      description="Type ranges and single numbers. Numbers already in the development are skipped."
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label={count ? `Add ${count} ${count === 1 ? "stand" : "stands"}` : "Add stands"} disabled={!count} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Stand numbers</Label>
          <Input value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="1-40, A1-A12" autoFocus />
          <p className={cn("text-xs", parsed && "error" in parsed ? "text-danger" : "text-text-muted")}>
            {!parsed
              ? "For example 1-40, A1-A12 or 7, 9, 12a."
              : "error" in parsed
                ? parsed.error
                : `${count} ${count === 1 ? "stand" : "stands"}: ${parsed.numbers.slice(0, 6).join(", ")}${count > 6 ? ` ... ${parsed.numbers[count - 1]}` : ""}`}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Price each ({currency})</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Size in m² (optional)</Label>
            <Input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-text-muted">You can change the price of any stand later.</p>
      </div>
    </Modal>
  );
}

export function EditStandModal({ stand, currency, onClose }: { stand: InventoryStand; currency: FinCurrency; onClose: () => void }) {
  const update = useMutation(api.dev.inventory.update);
  const remove = useMutation(api.dev.inventory.remove);
  const sold = stand.status === "sold";
  const [number, setNumber] = React.useState(stand.number);
  const [price, setPrice] = React.useState(String(stand.price));
  const [size, setSize] = React.useState(stand.sizeSqm ? String(stand.sizeSqm) : "");
  const [notes, setNotes] = React.useState(stand.notes);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    const p = parseAmount(price);
    if (!sold && !(p > 0)) return setError("Enter the price.");
    const s = size.trim() ? parseAmount(size) : null;
    if (s !== null && !(s > 0)) return setError("Size must be more than zero.");
    setBusy(true);
    try {
      await update({
        standId: stand._id,
        number: !sold && number.trim() !== stand.number ? number.trim() : undefined,
        price: !sold && p !== stand.price ? p : undefined,
        sizeSqm: s,
        notes,
      });
      animatedToast.success(`Stand ${number.trim() || stand.number} saved`);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!confirmRemove) return setConfirmRemove(true);
    setBusy(true);
    setError(null);
    try {
      await remove({ standId: stand._id });
      animatedToast.success(`Stand ${stand.number} removed`);
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
      title={`Edit stand ${stand.number}`}
      description={sold ? "A sold stand keeps its number and price. Change the price on the sale." : undefined}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!sold ? (
            <Button variant={confirmRemove ? "destructive" : "ghost"} className="gap-1" onClick={doRemove} disabled={busy}>
              <Trash2 className="h-4 w-4" />
              {confirmRemove ? "Remove for good" : "Remove stand"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Number</Label>
            <Input value={number} disabled={sold} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Price ({currency})</Label>
            <Input inputMode="decimal" value={price} disabled={sold} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Size in m²</Label>
            <Input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Corner stand, near the gate" />
        </div>
        {confirmRemove && <p className="text-sm text-danger">Click Remove for good to delete stand {stand.number}.</p>}
      </div>
    </Modal>
  );
}
