"use client";

import * as React from "react";
import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Download, FileSignature, Mail, MoreHorizontal, Plus, Receipt } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Facts, FormError, Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { StayDocuments } from "@/components/stay/ops/stay-documents";
import { ChargeStatusBadge, LeaseStatusBadge } from "@/components/stay/badges";
import { StatementTable } from "@/components/stay/statement-table";
import { useDownloadReceipt, useRecordPayment } from "@/components/stay/record-payment";
import {
  CHARGE_KIND_OPTIONS,
  HELD_IN_OPTIONS,
  addDays,
  addMonths,
  chargeKindLabel,
  dateLabel,
  heldInLabel,
  methodLabel,
  money,
  parseAmount,
} from "@/lib/stay/format";

type ModalKind = "terms" | "renew" | "notice" | "end" | "charge" | "increase" | "deposit" | "note" | null;

export default function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const leaseId = id as Id<"stayLeases">;
  const router = useRouter();
  const lease = useQuery(api.stay.leases.get, { id: leaseId });
  const { open: recordPayment } = useRecordPayment();
  const downloadReceipt = useDownloadReceipt();
  const emailReceipt = useMutation(api.stay.payments.emailReceipt);
  const reversePayment = useMutation(api.stay.payments.reverse);
  const cancelCharge = useMutation(api.stay.leases.cancelCharge);

  const [modal, setModal] = React.useState<ModalKind>(null);
  const [reverseTarget, setReverseTarget] = React.useState<{ _id: Id<"stayPayments">; receiptNumber: string } | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<{ _id: Id<"stayCharges">; description: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showActions, setShowActions] = React.useState(false);

  if (lease === undefined) return <ListSkeleton />;
  if (lease === null) {
    return <EmptyState icon={FileSignature} title="Lease not found" description="It may belong to a property you do not manage." />;
  }

  const active = lease.status === "active";
  const cur = lease.currency;
  const held = lease.deposit?.held ?? 0;

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      animatedToast.success(success);
      return true;
    } catch (e) {
      animatedToast.error("That did not work", { description: getErrorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const actionButtons: Array<{ label: string; kind: ModalKind; show: boolean }> = [
    { label: "Add charge", kind: "charge", show: lease.canEdit },
    { label: "Edit terms", kind: "terms", show: lease.canEdit && active },
    { label: "Renew", kind: "renew", show: lease.canEdit && active },
    { label: lease.noticeGivenOn ? "Change notice" : "Tenant gave notice", kind: "notice", show: lease.canEdit && active },
    { label: "Plan rent increase", kind: "increase", show: lease.canEdit && active },
    { label: "End lease", kind: "end", show: lease.canEdit && active },
    { label: "Settle deposit", kind: "deposit", show: lease.canEdit && held > 0 },
    { label: "Add arrears note", kind: "note", show: true },
  ];

  return (
    <div className="space-y-6">
      <StayPageHeader
        back={{ href: "/app/stay/leases", label: "Leases" }}
        title={lease.tenantName}
        description={
          <>
            <Link href={`/app/stay/properties/${lease.stayPropertyId}`} className="hover:underline">
              {lease.propertyName}, {lease.unitLabel}
            </Link>
            {" · "}
            <Link href={`/app/stay/tenants/${lease.tenantContactId}`} className="hover:underline">
              Tenant account
            </Link>
          </>
        }
        actions={
          <>
            <LeaseStatusBadge status={lease.status} notice={!!lease.noticeGivenOn} />
            <Button onClick={() => recordPayment(leaseId)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
            <div className="relative">
              <Button variant="secondary" onClick={() => setShowActions((s) => !s)} className="gap-2">
                <MoreHorizontal className="h-4 w-4" />
                Actions
              </Button>
              {showActions && (
                <div className="absolute right-0 z-30 mt-2 w-56 rounded-[10px] border border-border-strong bg-card-bg p-1 shadow-lg">
                  {actionButtons
                    .filter((a) => a.show)
                    .map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-row-hover"
                        onClick={() => {
                          setModal(a.kind);
                          setShowActions(false);
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </>
        }
      />

      {lease.renewedToLeaseId && (
        <div className="rounded-[12px] border border-border-strong bg-surface-2 p-3 text-sm">
          This lease was renewed.{" "}
          <Link href={`/app/stay/leases/${lease.renewedToLeaseId}`} className="font-medium text-primary-ink hover:underline">
            Open the current lease
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Balance" value={money(lease.balance, cur)} tone={lease.balance > 0 ? "warning" : "good"} hint={lease.credit > 0 ? `Includes credit of ${money(lease.credit, cur)}` : undefined} />
        <StatTile
          label="Overdue"
          value={money(lease.overdue, cur)}
          tone={lease.overdue > 0 ? "danger" : "default"}
          hint={lease.oldestOverdue ? `Oldest due ${dateLabel(lease.oldestOverdue)}` : undefined}
        />
        <StatTile label="Monthly rent" value={money(lease.rentAmount, cur)} hint={`Due on day ${lease.dueDay}`} />
        <StatTile
          label="Deposit held"
          value={lease.deposit ? money(held, cur) : "None"}
          hint={lease.deposit ? `${heldInLabel(lease.deposit.heldIn)}; ${money(lease.deposit.received, cur)} of ${money(lease.deposit.expected, cur)} received` : undefined}
        />
      </div>

      <Section title="Lease">
        <Facts
          items={[
            { label: "Start", value: dateLabel(lease.startDate) },
            { label: "End", value: `${dateLabel(lease.endDate)}${active && lease.daysToEnd >= 0 ? ` (in ${lease.daysToEnd} days)` : ""}` },
            { label: "Currency", value: cur },
            { label: "Landlord", value: lease.landlordName },
            { label: "Manager", value: lease.managerName ?? "Not assigned" },
            { label: "Management fee", value: lease.managementFeePct !== null ? `${lease.managementFeePct}%` : "-" },
            { label: "Tenant phone", value: lease.tenant?.phone },
            { label: "Tenant email", value: lease.tenant?.email },
            { label: "Tenant ID number", value: lease.tenant?.idNumber },
            ...(lease.noticeGivenOn ? [{ label: "Notice given", value: dateLabel(lease.noticeGivenOn) }] : []),
            ...(lease.moveOutDate ? [{ label: active ? "Planned move-out" : "Moved out", value: dateLabel(lease.moveOutDate) }] : []),
            ...(lease.endReason ? [{ label: "Reason for ending", value: lease.endReason }] : []),
            ...(lease.rentIncrease
              ? [
                  {
                    label: "Rent increase",
                    value: `${money(lease.rentIncrease.newRent, cur)} from ${dateLabel(lease.rentIncrease.effectiveDate)}${lease.rentIncrease.appliedAt ? " (applied)" : ""}`,
                  },
                ]
              : []),
            ...(lease.renewedFromLeaseId
              ? [{ label: "Renewed from", value: <Link className="text-primary-ink hover:underline" href={`/app/stay/leases/${lease.renewedFromLeaseId}`}>Previous lease</Link> }]
              : []),
          ]}
        />
        <LeaseCommissionRate leaseId={lease._id} propertyPct={lease.managementFeePct} leasePct={lease.leaseFeePct} />
      </Section>

      <Section title="Statement">
        <StatementTable lines={lease.statement} currency={cur} />
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Payments"
          actions={
            <Button size="sm" variant="secondary" onClick={() => recordPayment(leaseId)} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Record
            </Button>
          }
        >
          {lease.payments.length === 0 ? (
            <p className="text-sm text-text-muted">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lease.payments.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className={p.reversed ? "line-through text-text-muted" : ""}>{money(p.amount, cur)}</span>{" "}
                      {p.purpose === "deposit" && <Badge variant="info">Deposit</Badge>}{" "}
                      {p.reversed && <Badge variant="danger">Reversed</Badge>}
                    </p>
                    <p className="text-xs text-text-muted">
                      {p.receiptNumber}, {dateLabel(p.paidOn)}, {methodLabel(p.method)}
                      {p.reference ? `, ref ${p.reference}` : ""}
                      {p.reverseReason ? `. Reason: ${p.reverseReason}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label="Download receipt" onClick={() => downloadReceipt(p._id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {!p.reversed && lease.tenant?.email && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Email receipt"
                        onClick={() => run(() => emailReceipt({ paymentId: p._id }), "Receipt emailed")}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {!p.reversed && lease.canAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setReverseTarget(p)}>
                        Reverse
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Charges"
          actions={
            lease.canEdit ? (
              <Button size="sm" variant="secondary" onClick={() => setModal("charge")} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            ) : undefined
          }
        >
          {lease.charges.length === 0 ? (
            <p className="text-sm text-text-muted">No charges yet. Rent is charged automatically before each due date.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lease.charges.map((c) => (
                <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.description} <ChargeStatusBadge status={c.status} />
                    </p>
                    <p className="text-xs text-text-muted">
                      {chargeKindLabel(c.kind)}, due {dateLabel(c.dueDate)}, {money(c.amount, cur)}
                      {c.status === "part_paid" ? `, ${money(c.outstanding, cur)} left` : ""}
                      {c.cancelReason ? `. Cancelled: ${c.cancelReason}` : ""}
                    </p>
                  </div>
                  {lease.canEdit && c.status !== "cancelled" && c.status !== "paid" && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(c)}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Deposit"
          actions={
            lease.canEdit && held > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => setModal("deposit")}>
                Apply or refund
              </Button>
            ) : undefined
          }
        >
          {!lease.deposit ? (
            <p className="text-sm text-text-muted">No deposit on this lease.</p>
          ) : (
            <div className="space-y-3">
              <Facts
                items={[
                  { label: "Expected", value: money(lease.deposit.expected, cur) },
                  { label: "Received", value: money(lease.deposit.received, cur) },
                  { label: "Applied to amounts owed", value: money(lease.deposit.applied, cur) },
                  { label: "Refunded", value: money(lease.deposit.refunded, cur) },
                  { label: "Held now", value: money(held, cur) },
                  { label: "Held in", value: heldInLabel(lease.deposit.heldIn) },
                ]}
              />
              {lease.deposit.movements.length > 0 && (
                <ul className="divide-y divide-border text-sm">
                  {lease.deposit.movements.map((m, i) => (
                    <li key={i} className="flex justify-between gap-2 py-1.5">
                      <span>
                        {dateLabel(m.date)}: {m.kind === "received" ? "received" : m.kind === "applied" ? "applied to amounts owed" : "refunded"}
                        {m.note ? ` (${m.note})` : ""}
                      </span>
                      <span className="font-medium">{money(m.amount, cur)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {lease.deposit.received < lease.deposit.expected && (
                <Button size="sm" variant="secondary" onClick={() => recordPayment(leaseId)}>
                  Record deposit received
                </Button>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Arrears notes"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setModal("note")} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Note
            </Button>
          }
        >
          {lease.notes.length === 0 ? (
            <p className="text-sm text-text-muted">Log calls and promises to pay here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lease.notes.map((n) => (
                <li key={n._id} className="py-2.5 text-sm">
                  <p>{n.note}</p>
                  <p className="text-xs text-text-muted">
                    {n.by}, {new Date(n.createdAt).toLocaleDateString("en-GB")}
                    {n.promiseDate ? `. Promised ${n.promiseAmount ? money(n.promiseAmount, cur) : "payment"} by ${dateLabel(n.promiseDate)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <StayDocuments stayPropertyId={lease.stayPropertyId} leaseId={lease._id} />

      <LeaseModals
        kind={modal}
        lease={lease}
        onClose={() => setModal(null)}
        onRenewed={(newId) => router.push(`/app/stay/leases/${newId}`)}
      />

      <Modal
        open={!!reverseTarget}
        title={`Reverse receipt ${reverseTarget?.receiptNumber ?? ""}`}
        description="The payment stays on record, marked reversed. What it paid comes off the charges and any credit it created is taken back."
        onClose={() => {
          setReverseTarget(null);
          setReason("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReverseTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (reverseTarget && (await run(() => reversePayment({ paymentId: reverseTarget._id, reason }), "Payment reversed"))) {
                  setReverseTarget(null);
                  setReason("");
                }
              }}
            >
              Reverse payment
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: cheque bounced, recorded against the wrong tenant" />
        </div>
      </Modal>

      <Modal
        open={!!cancelTarget}
        title="Cancel charge"
        description={`"${cancelTarget?.description ?? ""}" stays on record, marked cancelled.`}
        onClose={() => {
          setCancelTarget(null);
          setReason("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (cancelTarget && (await run(() => cancelCharge({ chargeId: cancelTarget._id, reason }), "Charge cancelled"))) {
                  setCancelTarget(null);
                  setReason("");
                }
              }}
            >
              Cancel charge
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: raised in error" />
        </div>
      </Modal>
    </div>
  );
}

type LeaseView = NonNullable<FunctionReturnType<typeof api.stay.leases.get>>;

function LeaseModals({
  kind,
  lease,
  onClose,
  onRenewed,
}: {
  kind: ModalKind;
  lease: LeaseView;
  onClose: () => void;
  onRenewed: (id: Id<"stayLeases">) => void;
}) {
  const update = useMutation(api.stay.leases.update);
  const renew = useMutation(api.stay.leases.renew);
  const setNotice = useMutation(api.stay.leases.setNotice);
  const end = useMutation(api.stay.leases.end);
  const addCharge = useMutation(api.stay.leases.addCharge);
  const setIncrease = useMutation(api.stay.leases.setRentIncrease);
  const settle = useMutation(api.stay.deposits.settle);
  const setHeldIn = useMutation(api.stay.deposits.setHeldIn);
  const addNote = useMutation(api.stay.arrears.addNote);

  const cur = lease.currency;
  const today = lease.today;
  const [f, setF] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Fresh defaults each time a dialog opens.
  React.useEffect(() => {
    setError(null);
    const renewStart = addDays(lease.endDate, 1);
    const defaults: Record<string, Record<string, string>> = {
      terms: {
        startDate: lease.startDate,
        endDate: lease.endDate,
        rent: String(lease.rentAmount),
        currency: lease.currency,
        dueDay: String(lease.dueDay),
        deposit: String(lease.depositAmount),
      },
      renew: {
        startDate: renewStart,
        endDate: addDays(`${addMonths(renewStart.slice(0, 7), 12)}-${renewStart.slice(8, 10)}`, -1),
        rent: String(lease.rentIncrease && !lease.rentIncrease.appliedAt ? lease.rentIncrease.newRent : lease.rentAmount),
      },
      notice: { noticeGivenOn: lease.noticeGivenOn ?? today, plannedMoveOut: lease.moveOutDate ?? "" },
      end: { moveOutDate: lease.moveOutDate ?? today, reason: "" },
      charge: { kind: "admin_fee", description: "", amount: "", dueDate: today },
      increase: { effectiveDate: lease.rentIncrease?.effectiveDate ?? "", newRent: lease.rentIncrease ? String(lease.rentIncrease.newRent) : "" },
      deposit: {
        date: today,
        apply: String(Math.min(lease.deposit?.held ?? 0, Math.max(0, lease.balance))),
        refund: String(Math.max(0, (lease.deposit?.held ?? 0) - Math.min(lease.deposit?.held ?? 0, Math.max(0, lease.balance)))),
        note: "",
        heldIn: lease.deposit?.heldIn ?? "trust",
      },
      note: { note: "", promiseDate: "", promiseAmount: "" },
    };
    setF(kind ? defaults[kind] ?? {} : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(fn: () => Promise<unknown>, success: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fn();
      animatedToast.success(success);
      onClose();
      return res;
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const config: Record<Exclude<ModalKind, null>, { title: string; description?: string; submit: string; onSubmit: () => void; body: React.ReactNode }> = {
    terms: {
      title: "Edit lease terms",
      description: "For corrections. To change rent at renewal, use Renew; for a later increase, plan it.",
      submit: "Save terms",
      onSubmit: () =>
        save(
          () =>
            update({
              id: lease._id,
              startDate: f.startDate,
              endDate: f.endDate,
              rentAmount: parseAmount(f.rent ?? ""),
              currency: f.currency as "USD" | "ZiG",
              dueDay: Number(f.dueDay),
              depositAmount: parseAmount(f.deposit || "0"),
            }),
          "Lease updated"
        ),
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date"><Input type="date" value={f.startDate ?? ""} onChange={set("startDate")} /></Field>
          <Field label="End date"><Input type="date" value={f.endDate ?? ""} onChange={set("endDate")} /></Field>
          <Field label="Monthly rent"><Input inputMode="decimal" value={f.rent ?? ""} onChange={set("rent")} /></Field>
          <Field label="Currency">
            <Select value={f.currency ?? cur} onChange={set("currency")}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </Field>
          <Field label="Due day">
            <Select value={f.dueDay ?? "1"} onChange={set("dueDay")}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Deposit"><Input inputMode="decimal" value={f.deposit ?? ""} onChange={set("deposit")} /></Field>
        </div>
      ),
    },
    renew: {
      title: "Renew lease",
      description: "Creates a new lease for the same tenant and unit. This lease is kept as history, and the deposit and any credit move across.",
      submit: "Renew",
      onSubmit: async () => {
        const id = await save(
          () => renew({ id: lease._id, startDate: f.startDate, endDate: f.endDate, rentAmount: parseAmount(f.rent ?? "") }),
          "Lease renewed"
        );
        if (id) onRenewed(id as Id<"stayLeases">);
      },
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New start date"><Input type="date" value={f.startDate ?? ""} onChange={set("startDate")} /></Field>
          <Field label="New end date"><Input type="date" value={f.endDate ?? ""} onChange={set("endDate")} /></Field>
          <Field label={`Monthly rent (${cur})`}><Input inputMode="decimal" value={f.rent ?? ""} onChange={set("rent")} /></Field>
        </div>
      ),
    },
    notice: {
      title: "Tenant gave notice",
      description: "The unit shows as on notice. Rent is not charged for months after the planned move-out.",
      submit: "Save notice",
      onSubmit: () =>
        save(
          () => setNotice({ id: lease._id, noticeGivenOn: f.noticeGivenOn || null, plannedMoveOut: f.plannedMoveOut || undefined }),
          f.noticeGivenOn ? "Notice recorded" : "Notice withdrawn"
        ),
      body: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Notice given on"><Input type="date" value={f.noticeGivenOn ?? ""} onChange={set("noticeGivenOn")} /></Field>
            <Field label="Planned move-out"><Input type="date" value={f.plannedMoveOut ?? ""} onChange={set("plannedMoveOut")} /></Field>
          </div>
          {lease.noticeGivenOn && (
            <Button variant="ghost" size="sm" onClick={() => save(() => setNotice({ id: lease._id, noticeGivenOn: null }), "Notice withdrawn")}>
              Withdraw notice
            </Button>
          )}
        </div>
      ),
    },
    end: {
      title: "End lease",
      description: "Records the move-out and sets the unit to vacant. Unpaid rent for later months is cancelled. Settle the deposit afterwards.",
      submit: "End lease",
      onSubmit: () => save(() => end({ id: lease._id, moveOutDate: f.moveOutDate, reason: f.reason ?? "" }), "Lease ended"),
      body: (
        <div className="space-y-4">
          <Field label="Move-out date"><Input type="date" value={f.moveOutDate ?? ""} onChange={set("moveOutDate")} /></Field>
          <Field label="Reason">
            <Select value={f.reason ?? ""} onChange={set("reason")}>
              <option value="">Choose a reason</option>
              <option value="Lease expired">Lease expired</option>
              <option value="Tenant gave notice">Tenant gave notice</option>
              <option value="Evicted for arrears">Evicted for arrears</option>
              <option value="Landlord needs the property">Landlord needs the property</option>
              <option value="Property sold">Property sold</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
        </div>
      ),
    },
    charge: {
      title: "Add a charge",
      description: "A one-off amount the tenant owes, such as a lease admin fee, damage or a utilities recovery.",
      submit: "Add charge",
      onSubmit: () =>
        save(
          () =>
            addCharge({
              leaseId: lease._id,
              kind: f.kind as (typeof CHARGE_KIND_OPTIONS)[number]["value"],
              description: f.description || chargeKindLabel(f.kind ?? "other"),
              amount: parseAmount(f.amount ?? ""),
              dueDate: f.dueDate,
            }),
          "Charge added"
        ),
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={f.kind ?? "admin_fee"} onChange={set("kind")}>
              {CHARGE_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount (${cur})`}><Input inputMode="decimal" value={f.amount ?? ""} onChange={set("amount")} /></Field>
          <Field label="Description"><Input value={f.description ?? ""} onChange={set("description")} placeholder="For example: broken window, bedroom 2" /></Field>
          <Field label="Due date"><Input type="date" value={f.dueDate ?? ""} onChange={set("dueDate")} /></Field>
        </div>
      ),
    },
    increase: {
      title: "Plan a rent increase",
      description: "Applied automatically on the date. Rent charged for months due from then uses the new amount.",
      submit: "Save",
      onSubmit: () =>
        save(
          () =>
            setIncrease({
              id: lease._id,
              effectiveDate: f.effectiveDate || null,
              newRent: f.newRent ? parseAmount(f.newRent) : undefined,
            }),
          f.effectiveDate ? "Rent increase planned" : "Rent increase removed"
        ),
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From"><Input type="date" value={f.effectiveDate ?? ""} onChange={set("effectiveDate")} /></Field>
          <Field label={`New monthly rent (${cur})`}><Input inputMode="decimal" value={f.newRent ?? ""} onChange={set("newRent")} /></Field>
          <p className="text-xs text-text-muted sm:col-span-2">Clear the date to remove a planned increase.</p>
        </div>
      ),
    },
    deposit: {
      title: "Settle the deposit",
      description: `Held: ${money(lease.deposit?.held ?? 0, cur)}. The tenant owes ${money(Math.max(0, lease.balance), cur)}. Add damage charges first if the move-out inspection found any.`,
      submit: "Save",
      onSubmit: () => {
        const apply = parseAmount(f.apply || "0") || 0;
        const refund = parseAmount(f.refund || "0") || 0;
        return save(async () => {
          if (f.heldIn && f.heldIn !== lease.deposit?.heldIn) {
            await setHeldIn({ leaseId: lease._id, heldIn: f.heldIn as "trust" | "business" | "landlord" });
          }
          if (apply + refund > 0) {
            await settle({ leaseId: lease._id, date: f.date, applyAmount: apply, refundAmount: refund, note: f.note || undefined });
          }
        }, "Deposit updated");
      },
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Apply to amounts owed (${cur})`}><Input inputMode="decimal" value={f.apply ?? ""} onChange={set("apply")} /></Field>
          <Field label={`Refund to tenant (${cur})`}><Input inputMode="decimal" value={f.refund ?? ""} onChange={set("refund")} /></Field>
          <Field label="Date"><Input type="date" value={f.date ?? ""} onChange={set("date")} /></Field>
          <Field label="Held in">
            <Select value={f.heldIn ?? "trust"} onChange={set("heldIn")}>
              {HELD_IN_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note"><Input value={f.note ?? ""} onChange={set("note")} placeholder="For example: refunded by bank transfer" /></Field>
          </div>
        </div>
      ),
    },
    note: {
      title: "Arrears note",
      description: "Log a call, visit or promise to pay.",
      submit: "Save note",
      onSubmit: () =>
        save(
          () =>
            addNote({
              leaseId: lease._id,
              note: f.note ?? "",
              promiseDate: f.promiseDate || undefined,
              promiseAmount: f.promiseAmount ? parseAmount(f.promiseAmount) : undefined,
            }),
          "Note saved"
        ),
      body: (
        <div className="space-y-4">
          <Field label="Note"><Textarea rows={3} value={f.note ?? ""} onChange={set("note")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Promised to pay by (optional)"><Input type="date" value={f.promiseDate ?? ""} onChange={set("promiseDate")} /></Field>
            <Field label={`Promised amount (${cur})`}><Input inputMode="decimal" value={f.promiseAmount ?? ""} onChange={set("promiseAmount")} /></Field>
          </div>
        </div>
      ),
    },
  };

  const c = kind ? config[kind] : null;
  return (
    <Modal
      open={!!c}
      title={c?.title ?? ""}
      description={c?.description}
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => c?.onSubmit()} disabled={saving} variant={kind === "end" ? "destructive" : "primary"}>
            {saving ? "Saving..." : c?.submit}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {c?.body}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * SyncFinance: give this lease its own management commission rate. Shown
 * to the director and accounts when the user can open Finance.
 */
function LeaseCommissionRate({ leaseId, propertyPct, leasePct }: { leaseId: Id<"stayLeases">; propertyPct: number | null; leasePct: number | null }) {
  const hub = useQuery(api.hub.getContext);
  const canFinance = !!hub?.myModules.includes("finance");
  const fin = useQuery(api.finance.settings.get, canFinance ? {} : "skip");
  const setLeaseRate = useMutation(api.finance.posting.setLeaseRate);
  const [open, setOpen] = React.useState(false);
  const [pct, setPct] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!canFinance || !fin?.role.isStaff) return null;

  async function save(value: number | undefined) {
    setBusy(true);
    setError(null);
    try {
      await setLeaseRate({ leaseId, pct: value });
      animatedToast.success(value === undefined ? "Lease uses the property's rate" : `Lease commission set to ${value}%`);
      setOpen(false);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-text-muted">
          {leasePct !== null
            ? `SyncFinance takes ${leasePct}% commission on this lease (its own rate).`
            : `SyncFinance takes commission at the property's rate${propertyPct !== null ? ` (${propertyPct}%)` : ""}.`}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPct(leasePct !== null ? String(leasePct) : "");
            setError(null);
            setOpen(true);
          }}
        >
          Set lease commission rate
        </Button>
      </div>
      <Modal
        open={open}
        title="Lease commission rate"
        description={`The property's rate is ${propertyPct !== null ? `${propertyPct}%` : "not set"}. A rate here applies to this lease only.`}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => save(undefined)} disabled={busy}>
              Use the property&apos;s rate
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const n = parseAmount(pct);
                if (!(n >= 0 && n <= 100)) return setError("Enter a rate between 0 and 100.");
                save(n);
              }}
            >
              {busy ? "Saving..." : "Save rate"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          <div className="space-y-2">
            <Label>Commission rate (%)</Label>
            <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder={propertyPct !== null ? String(propertyPct) : "10"} />
          </div>
        </div>
      </Modal>
    </>
  );
}
