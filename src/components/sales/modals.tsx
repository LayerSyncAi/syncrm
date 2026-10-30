"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildPlan, sameDayNextMonth } from "../../../convex/finance/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError } from "@/components/stay/page-header";
import { CURRENCY_OPTIONS, METHOD_OPTIONS, dateLabel, money, parseAmount, periodLabel, type FinCurrency } from "@/lib/finance/format";
import type { Account, Development } from "./shared";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

const HELD_BY_LABELS = { developer: "The developer", agency_trust: "Us, in trust, for the developer" } as const;
const TIMING_LABELS = { each_payment: "On each payment received", fully_paid: "When the stand is fully paid" } as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The same day next month, or that month's last day when it is shorter. */
export const nextMonthSameDay = sameDayNextMonth;

export function ModalFooter({ busy, onClose, onSubmit, label, disabled }: { busy: boolean; onClose: () => void; onSubmit: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={busy || disabled}>
        {busy ? "Saving..." : label}
      </Button>
    </div>
  );
}

// ── Development ──────────────────────────────────────────────────────

/**
 * Add or edit a development. Commission only matters with SyncFinance, so it
 * is asked only then; an edit keeps whatever was set before.
 */
export function DevelopmentModal({
  dev,
  financeOn,
  onClose,
  onCreated,
}: {
  dev: Development | null;
  financeOn: boolean;
  onClose: () => void;
  onCreated?: (id: Id<"finDevelopments">) => void;
}) {
  const create = useMutation(api.dev.sales.createDevelopment);
  const update = useMutation(api.dev.sales.updateDevelopment);
  const [name, setName] = React.useState(dev?.name ?? "");
  const [location, setLocation] = React.useState(dev?.location ?? "");
  const [developerName, setDeveloperName] = React.useState(dev?.developerName ?? "");
  const [developerEmail, setDeveloperEmail] = React.useState(dev?.developerEmail ?? "");
  const [moneyHeldBy, setMoneyHeldBy] = React.useState<Development["moneyHeldBy"]>(dev?.moneyHeldBy ?? (financeOn ? "agency_trust" : "developer"));
  const [commissionPct, setCommissionPct] = React.useState(dev?.commissionPct ? String(dev.commissionPct) : "");
  const [commissionTiming, setCommissionTiming] = React.useState<Development["commissionTiming"]>(dev?.commissionTiming ?? "each_payment");
  const [interest, setInterest] = React.useState(dev?.interestPctPerMonth ? String(dev.interestPctPerMonth) : "");
  const [currency, setCurrency] = React.useState<FinCurrency>(dev?.currency ?? "USD");
  const [isActive, setIsActive] = React.useState(dev?.isActive ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const locked = !!dev && dev.sold > 0;

  const submit = async () => {
    setError(null);
    const pct = commissionPct.trim() ? parseAmount(commissionPct) : 0;
    const int = interest.trim() ? parseAmount(interest) : undefined;
    if (!name.trim()) return setError("Name the development.");
    if (!(pct >= 0 && pct <= 100)) return setError("Commission must be between 0 and 100%.");
    if (int !== undefined && !(int >= 0 && int <= 20)) return setError("Interest must be between 0 and 20% a month.");
    const args = {
      name: name.trim(),
      location: location.trim() || undefined,
      // Kept as they were: this form does not edit them.
      notes: dev?.notes,
      developerContactId: dev?.developerContactId,
      developerName: developerName.trim() || undefined,
      developerEmail: developerEmail.trim() || undefined,
      moneyHeldBy,
      commissionPct: financeOn ? pct : dev?.commissionPct,
      commissionTiming: financeOn ? commissionTiming : dev?.commissionTiming,
      interestPctPerMonth: int,
      currency,
    };
    setBusy(true);
    try {
      if (dev) {
        await update({ developmentId: dev._id, isActive, ...args });
        animatedToast.success("Development updated", { description: args.name });
      } else {
        const id = await create(args);
        animatedToast.success("Development added", { description: args.name });
        onCreated?.(id);
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
      title={dev ? `Edit ${dev.name}` : "New development"}
      description="A development groups the stands you sell for one developer."
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label={dev ? "Save" : "Add development"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Development name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hopewell Park Phase 2" autoFocus={!dev} />
          </div>
          <div className="space-y-2">
            <Label>Location (optional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ruwa" />
          </div>
          <div className="space-y-2">
            <Label>Developer (optional)</Label>
            <Input value={developerName} onChange={(e) => setDeveloperName(e.target.value)} placeholder="Blank if we are the developer" />
          </div>
          <div className="space-y-2">
            <Label>Developer email (optional)</Label>
            <Input type="email" value={developerEmail} onChange={(e) => setDeveloperEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} disabled={locked} onChange={(e) => setCurrency(e.target.value as FinCurrency)}>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Who holds the money</Label>
            <Select value={moneyHeldBy} disabled={locked} onChange={(e) => setMoneyHeldBy(e.target.value as Development["moneyHeldBy"])}>
              {(Object.keys(HELD_BY_LABELS) as Array<keyof typeof HELD_BY_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {HELD_BY_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {locked && <p className="text-xs text-text-muted">This development has sales, so its currency and who holds the money are fixed.</p>}
        {financeOn && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Commission % (optional)</Label>
                <Input inputMode="decimal" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Commission is earned</Label>
                <Select value={commissionTiming} onChange={(e) => setCommissionTiming(e.target.value as Development["commissionTiming"])}>
                  {(Object.keys(TIMING_LABELS) as Array<keyof typeof TIMING_LABELS>).map((k) => (
                    <option key={k} value={k}>
                      {TIMING_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {moneyHeldBy === "developer" && <p className="text-xs text-text-muted">When the developer holds the money, nothing is taken automatically. Invoice the developer for commission.</p>}
          </>
        )}
        <div className="space-y-2">
          <Label>Interest on overdue amounts, % a month (optional)</Label>
          <Input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Blank for no interest" />
        </div>
        {dev && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Open for new sales
          </label>
        )}
      </div>
    </Modal>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────

/** Rows of a payment plan, compact enough for a modal. */
export function PlanPreview({ rows, currency }: { rows: Array<{ label: string; dueDate: string; amount: number }>; currency: FinCurrency }) {
  if (!rows.length) return null;
  return (
    <div className="max-h-56 overflow-y-auto rounded-[10px] border border-border text-sm">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border px-3 py-1.5 last:border-0">
          <span className="truncate">{r.label}</span>
          <span className="text-text-muted">{dateLabel(r.dueDate)}</span>
          <span className="text-right font-medium">{money(r.amount, currency)}</span>
        </div>
      ))}
    </div>
  );
}

type TypedRow = { label: string; dueDate: string; amount: string };

/** A sale typed in from scratch: development, stand, buyer and plan. */
export function PlanModal({
  devs,
  today,
  title = "New client plan",
  onClose,
  onCreated,
}: {
  devs: Development[];
  today: string;
  title?: string;
  onClose: () => void;
  onCreated?: (saleId: Id<"finStands">) => void;
}) {
  const createStand = useMutation(api.dev.sales.createStand);
  const [developmentId, setDevelopmentId] = React.useState<string>(devs[0]?._id ?? "");
  const [standNumber, setStandNumber] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [buyerPhone, setBuyerPhone] = React.useState("");
  const [buyerEmail, setBuyerEmail] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [mode, setMode] = React.useState<"even" | "rows">("even");
  const [deposit, setDeposit] = React.useState("");
  const [depositDue, setDepositDue] = React.useState(today);
  const [count, setCount] = React.useState("12");
  const [firstDue, setFirstDue] = React.useState(nextMonthSameDay(today));
  const [rows, setRows] = React.useState<TypedRow[]>([
    { label: "Deposit", dueDate: today, amount: "" },
    { label: "Instalment 1", dueDate: "", amount: "" },
  ]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dev = devs.find((d) => d._id === developmentId);
  const c = dev?.currency ?? "USD";
  const p = parseAmount(price);
  const dep = deposit.trim() ? parseAmount(deposit) : 0;
  const n = parseInt(count, 10);
  const evenValid = p > 0 && dep >= 0 && dep <= p && n >= 0 && DATE_RE.test(firstDue) && (dep === 0 || DATE_RE.test(depositDue));
  const preview = mode === "even" && evenValid ? buildPlan(p, dep, depositDue, n, firstDue) : [];
  const typedTotal = r2(rows.reduce((s, r) => s + (parseAmount(r.amount) || 0), 0));

  const setRow = (i: number, patch: Partial<TypedRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setError(null);
    if (!dev) return setError("Pick the development.");
    if (!standNumber.trim()) return setError("Enter the stand or item number.");
    if (!buyerName.trim()) return setError("Enter the buyer's name.");
    if (!(p > 0)) return setError("Enter the price.");
    let schedule: Array<{ dueDate: string; amount: number; label: string }> | undefined;
    let plan: { deposit: number; depositDue: string; count: number; firstDue: string } | undefined;
    if (mode === "even") {
      if (!evenValid) return setError("Check the deposit, number of instalments and dates.");
      plan = { deposit: dep, depositDue, count: n, firstDue };
    } else {
      schedule = [];
      for (const r of rows) {
        const a = parseAmount(r.amount);
        if (!r.dueDate && !r.amount.trim()) continue;
        if (!DATE_RE.test(r.dueDate)) return setError("Each row needs a due date.");
        if (!(a > 0)) return setError("Each row needs an amount.");
        schedule.push({ dueDate: r.dueDate, amount: a, label: r.label.trim() || "Instalment" });
      }
      if (!schedule.length) return setError("Add the payment rows.");
      if (r2(typedTotal) !== r2(p)) return setError(`The rows add up to ${money(typedTotal, c)}, not the price ${money(p, c)}.`);
    }
    setBusy(true);
    try {
      const saleId = await createStand({
        developmentId: dev._id,
        standNumber: standNumber.trim(),
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim() || undefined,
        buyerEmail: buyerEmail.trim() || undefined,
        price: p,
        plan,
        schedule,
      });
      animatedToast.success("Plan added", { description: `Stand ${standNumber.trim()} to ${buyerName.trim()}` });
      onCreated?.(saleId);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={title} description="A buyer paying for a stand or item by instalments." onClose={onClose} footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label="Add plan" />}>
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Development</Label>
            <Select value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
              {devs.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.currency})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Stand or item number</Label>
            <Input value={standNumber} onChange={(e) => setStandNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Buyer name</Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Price ({c})</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant={mode === "even" ? "primary" : "secondary"} className="h-9" onClick={() => setMode("even")}>
            Even monthly plan
          </Button>
          <Button variant={mode === "rows" ? "primary" : "secondary"} className="h-9" onClick={() => setMode("rows")}>
            Type the rows
          </Button>
        </div>

        {mode === "even" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Deposit ({c})</Label>
                <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Deposit due</Label>
                <Input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Monthly instalments</Label>
                <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>First instalment due</Label>
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </div>
            </div>
            <PlanPreview rows={preview} currency={c} />
          </>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
                <Input aria-label="Label" placeholder="Label" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className="col-span-2 sm:col-span-1" />
                <Input aria-label="Due date" type="date" value={r.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} />
                <Input aria-label="Amount" inputMode="decimal" placeholder={`Amount (${c})`} value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} />
                <Button variant="ghost" className="h-10 w-10 p-0" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" className="h-9 gap-2" onClick={() => setRows((rs) => [...rs, { label: `Instalment ${rs.length}`, dueDate: "", amount: "" }])}>
                <Plus className="h-4 w-4" />
                Add row
              </Button>
              <span className={`text-sm ${p > 0 && typedTotal !== r2(p) ? "text-danger" : "text-text-muted"}`}>
                Rows add up to {money(typedTotal, c)}
                {p > 0 ? ` of ${money(p, c)}` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Interest ─────────────────────────────────────────────────────────

/** Charge a month's interest on overdue plans. Pass `fixed` to charge one development only. */
export function InterestModal({ devs, today, fixed, onClose }: { devs: Development[]; today: string; fixed?: Development; onClose: () => void }) {
  const charge = useMutation(api.dev.sales.chargeInterest);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [developmentId, setDevelopmentId] = React.useState<string>(fixed?._id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Pick a month.");
    setBusy(true);
    try {
      const res = await charge({ month, developmentId: (developmentId || undefined) as Id<"finDevelopments"> | undefined });
      animatedToast.success(res.charged ? `Interest charged on ${res.charged} ${res.charged === 1 ? "plan" : "plans"}` : "No interest to charge", {
        description: periodLabel(month, true),
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
      title="Charge interest"
      description={
        fixed
          ? `Adds one month's interest at ${fixed.interestPctPerMonth}% on overdue amounts in ${fixed.name}. Each plan is charged once per month.`
          : "Adds one month's interest on overdue amounts, for developments that set an interest rate. Each plan is charged once per month."
      }
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label="Charge interest" disabled={!fixed && devs.length === 0} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        {!fixed && devs.length === 0 && <p className="text-sm text-text-muted">No development charges interest yet. Set a rate on a development first.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {!fixed && (
            <div className="space-y-2">
              <Label>Development</Label>
              <Select value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
                <option value="">All that charge interest</option>
                {devs.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({d.interestPctPerMonth}% a month)
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Money in and out ─────────────────────────────────────────────────

export type MoneySale = {
  _id: Id<"finStands">;
  standNumber: string;
  development?: string;
  currency: FinCurrency;
  buyerName: string;
  buyerEmail: string;
  balance: number;
  overdue: number;
};

/**
 * Take a payment or refund a buyer. `accounts` is null without SyncFinance
 * (or when the user cannot open it): the picker hides and the backend picks.
 */
export function StandMoneyModal({
  mode,
  sale,
  defaultAmount,
  today,
  accounts,
  onClose,
}: {
  mode: "receive" | "refund";
  sale: MoneySale;
  defaultAmount: number;
  today: string;
  accounts: Account[] | null;
  onClose: () => void;
}) {
  const receive = useMutation(api.dev.sales.receivePayment);
  const refund = useMutation(api.dev.sales.refundStand);
  const c = sale.currency;
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
      const common = { standId: sale._id, date, amount: n, method, accountId: (accountId || undefined) as Id<"finAccounts"> | undefined, reference: reference.trim() || undefined };
      if (mode === "receive") {
        const res = await receive({ ...common, emailStatement: sendStatement && !!sale.buyerEmail });
        animatedToast.success("Payment received", { description: `Receipt ${res.number}: ${money(n, c)} from ${sale.buyerName}` });
      } else {
        const res = await refund(common);
        animatedToast.success("Refund recorded", { description: `Payment ${res.number}: ${money(n, c)} to ${sale.buyerName}` });
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const where = `Stand ${sale.standNumber}${sale.development ? `, ${sale.development}` : ""}.`;
  return (
    <Modal
      open
      title={mode === "receive" ? `Receive payment from ${sale.buyerName}` : `Refund ${sale.buyerName}`}
      description={
        mode === "receive"
          ? `${where} Balance ${money(sale.balance, c)}${sale.overdue > 0 ? `, overdue ${money(sale.overdue, c)}` : ""}. Paid against the oldest instalment first.`
          : `${where} The sale is cancelled. You can refund up to what was received since go-live.`
      }
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label={mode === "receive" ? "Receive payment" : "Record refund"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Amount ({c})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" max={mode === "receive" ? today : undefined} value={date} onChange={(e) => setDate(e.target.value)} />
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
          {accounts && (
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
          )}
          <div className={`space-y-2 ${accounts ? "sm:col-span-2" : ""}`}>
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or slip number" />
          </div>
        </div>
        {mode === "receive" &&
          (sale.buyerEmail ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={sendStatement} onChange={(e) => setSendStatement(e.target.checked)} />
              Email the buyer an updated statement
            </label>
          ) : (
            <p className="text-sm text-text-muted">No email address on file, so no statement is sent. Add one to the buyer to email statements.</p>
          ))}
      </div>
    </Modal>
  );
}

// ── Cancel and reverse ───────────────────────────────────────────────

export function CancelSaleModal({
  sale,
  onClose,
}: {
  sale: { _id: Id<"finStands">; standNumber: string; buyerName: string; paidToDate: number; price: number; currency: FinCurrency };
  onClose: () => void;
}) {
  const cancel = useMutation(api.dev.sales.cancelStand);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Give a reason.");
    setBusy(true);
    setError(null);
    try {
      await cancel({ standId: sale._id, reason: reason.trim() });
      animatedToast.success("Sale cancelled", { description: `Stand ${sale.standNumber}, ${sale.buyerName}. The stand is available again.` });
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
      title={`Cancel the sale of stand ${sale.standNumber}`}
      description="The plan and its reminders stop and the stand goes back on the market. Anything the buyer paid stays on record until you refund it."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep the sale
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Cancelling..." : "Cancel sale"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <p className="text-sm">
          {sale.buyerName} has paid {money(sale.paidToDate, sale.currency)} of {money(sale.price, sale.currency)}.
        </p>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

/** Reverse a payment SyncDev recorded. Finance receipts are reversed in Finance. */
export function ReversePaymentModal({
  payment,
  currency,
  onClose,
}: {
  payment: { _id: string; number: string; amount: number; date: string };
  currency: FinCurrency;
  onClose: () => void;
}) {
  const reverse = useMutation(api.dev.sales.reverseDevPayment);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Give a reason.");
    setBusy(true);
    setError(null);
    try {
      await reverse({ paymentId: payment._id as Id<"devPayments">, reason: reason.trim() });
      animatedToast.success("Payment reversed", { description: `${payment.number}: ${money(payment.amount, currency)}` });
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
      title={`Reverse ${payment.number}`}
      description={`${money(payment.amount, currency)} paid on ${dateLabel(payment.date)}. The buyer's balance goes back up by this amount.`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Reversing..." : "Reverse payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Payment bounced" />
        </div>
      </div>
    </Modal>
  );
}
