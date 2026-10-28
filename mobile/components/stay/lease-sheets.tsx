/**
 * The lease actions as bottom sheets: edit terms, renew, notice, end, add a
 * charge, plan a rent increase, settle the deposit and add an arrears note.
 * Each opens with fresh defaults, the same as the website's lease page.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, DateField, Field, Select, Sheet } from "../ui";
import { useRun } from "../../lib/useRun";
import { CHARGE_KIND_OPTIONS, HELD_IN_OPTIONS, addDays, addMonths, chargeKindLabel, money, parseAmount } from "@/lib/stay/format";

export type LeaseView = NonNullable<FunctionReturnType<typeof api.stay.leases.get>>;
export type LeaseSheetKind = "terms" | "renew" | "notice" | "end" | "charge" | "increase" | "deposit" | "note";

const DUE_DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const END_REASONS = ["Lease expired", "Tenant gave notice", "Evicted for arrears", "Landlord needs the property", "Property sold", "Other"].map((r) => ({ value: r, label: r }));

function defaultsFor(kind: LeaseSheetKind, lease: LeaseView): Record<string, string> {
  const today = lease.today;
  const held = lease.deposit?.held ?? 0;
  const apply = Math.min(held, Math.max(0, lease.balance));
  const renewStart = addDays(lease.endDate, 1);
  switch (kind) {
    case "terms":
      return {
        startDate: lease.startDate,
        endDate: lease.endDate,
        rent: String(lease.rentAmount),
        currency: lease.currency,
        dueDay: String(lease.dueDay),
        deposit: String(lease.depositAmount),
      };
    case "renew":
      return {
        startDate: renewStart,
        endDate: addDays(`${addMonths(renewStart.slice(0, 7), 12)}-${renewStart.slice(8, 10)}`, -1),
        rent: String(lease.rentIncrease && !lease.rentIncrease.appliedAt ? lease.rentIncrease.newRent : lease.rentAmount),
      };
    case "notice":
      return { noticeGivenOn: lease.noticeGivenOn ?? today, plannedMoveOut: lease.moveOutDate ?? "" };
    case "end":
      return { moveOutDate: lease.moveOutDate ?? today, reason: "" };
    case "charge":
      return { kind: "admin_fee", description: "", amount: "", dueDate: today };
    case "increase":
      return { effectiveDate: lease.rentIncrease?.effectiveDate ?? "", newRent: lease.rentIncrease ? String(lease.rentIncrease.newRent) : "" };
    case "deposit":
      return { date: today, apply: String(apply), refund: String(Math.max(0, held - apply)), note: "", heldIn: lease.deposit?.heldIn ?? "trust" };
    case "note":
      return { note: "", promiseDate: "", promiseAmount: "" };
  }
}

export function LeaseSheets({
  kind,
  lease,
  onClose,
  onRenewed,
}: {
  kind: LeaseSheetKind | null;
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
  const { busy, run } = useRun();
  const cur = lease.currency;

  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    setF(kind ? defaultsFor(kind, lease) : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const v = (k: string) => f[k] ?? "";
  const set = (k: string) => (val: string) => setF((s) => ({ ...s, [k]: val }));

  /** Run the save; close on success. Returns the mutation's result. */
  async function save<T>(fn: () => Promise<T>, success: string): Promise<T | undefined> {
    const res = await run(async () => ({ value: await fn() }), { success });
    if (res) onClose();
    return res?.value;
  }

  const config: Record<LeaseSheetKind, { title: string; description?: string; submit: string; danger?: boolean; onSubmit: () => void; body: ReactNode }> = {
    terms: {
      title: "Edit lease terms",
      description: "For corrections. To change rent at renewal, use Renew; for a later increase, plan it.",
      submit: "Save terms",
      onSubmit: () =>
        save(
          () =>
            update({
              id: lease._id,
              startDate: v("startDate"),
              endDate: v("endDate"),
              rentAmount: parseAmount(v("rent")),
              currency: v("currency") as "USD" | "ZiG",
              dueDay: Number(v("dueDay")),
              depositAmount: parseAmount(v("deposit") || "0"),
            }),
          "Lease updated",
        ),
      body: (
        <>
          <DateField label="Start date" value={v("startDate")} onChange={set("startDate")} />
          <DateField label="End date" value={v("endDate")} onChange={set("endDate")} />
          <Field label="Monthly rent" value={v("rent")} onChangeText={set("rent")} keyboardType="decimal-pad" />
          <Select
            label="Currency"
            value={v("currency")}
            onChange={set("currency")}
            options={[
              { value: "USD", label: "USD" },
              { value: "ZiG", label: "ZiG" },
            ]}
          />
          <Select label="Due day" value={v("dueDay")} onChange={set("dueDay")} options={DUE_DAYS} />
          <Field label="Deposit" value={v("deposit")} onChangeText={set("deposit")} keyboardType="decimal-pad" />
        </>
      ),
    },
    renew: {
      title: "Renew lease",
      description: "Creates a new lease for the same tenant and unit. This lease is kept as history, and the deposit and any credit move across.",
      submit: "Renew",
      onSubmit: async () => {
        const id = await save(() => renew({ id: lease._id, startDate: v("startDate"), endDate: v("endDate"), rentAmount: parseAmount(v("rent")) }), "Lease renewed");
        if (id) onRenewed(id as Id<"stayLeases">);
      },
      body: (
        <>
          <DateField label="New start date" value={v("startDate")} onChange={set("startDate")} />
          <DateField label="New end date" value={v("endDate")} onChange={set("endDate")} />
          <Field label={`Monthly rent (${cur})`} value={v("rent")} onChangeText={set("rent")} keyboardType="decimal-pad" />
        </>
      ),
    },
    notice: {
      title: "Tenant gave notice",
      description: "The unit shows as on notice. Rent is not charged for months after the planned move-out.",
      submit: "Save notice",
      onSubmit: () =>
        save(
          () => setNotice({ id: lease._id, noticeGivenOn: v("noticeGivenOn") || null, plannedMoveOut: v("plannedMoveOut") || undefined }),
          v("noticeGivenOn") ? "Notice recorded" : "Notice withdrawn",
        ),
      body: (
        <>
          <DateField label="Notice given on" value={v("noticeGivenOn")} onChange={set("noticeGivenOn")} />
          <DateField label="Planned move-out" value={v("plannedMoveOut")} onChange={set("plannedMoveOut")} />
          {lease.noticeGivenOn && (
            <Button variant="ghost" small title="Withdraw notice" onPress={() => save(() => setNotice({ id: lease._id, noticeGivenOn: null }), "Notice withdrawn")} />
          )}
        </>
      ),
    },
    end: {
      title: "End lease",
      description: "Records the move-out and sets the unit to vacant. Unpaid rent for later months is cancelled. Settle the deposit afterwards.",
      submit: "End lease",
      danger: true,
      onSubmit: () => save(() => end({ id: lease._id, moveOutDate: v("moveOutDate"), reason: v("reason") }), "Lease ended"),
      body: (
        <>
          <DateField label="Move-out date" value={v("moveOutDate")} onChange={set("moveOutDate")} />
          <Select label="Reason" value={v("reason")} onChange={set("reason")} options={END_REASONS} placeholder="Choose a reason" />
        </>
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
              kind: v("kind") as (typeof CHARGE_KIND_OPTIONS)[number]["value"],
              description: v("description").trim() || chargeKindLabel(v("kind") || "other"),
              amount: parseAmount(v("amount")),
              dueDate: v("dueDate"),
            }),
          "Charge added",
        ),
      body: (
        <>
          <Select label="Type" value={v("kind")} onChange={set("kind")} options={CHARGE_KIND_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))} />
          <Field label={`Amount (${cur})`} value={v("amount")} onChangeText={set("amount")} keyboardType="decimal-pad" />
          <Field label="Description" value={v("description")} onChangeText={set("description")} placeholder="For example: broken window, bedroom 2" />
          <DateField label="Due date" value={v("dueDate")} onChange={set("dueDate")} />
        </>
      ),
    },
    increase: {
      title: "Plan a rent increase",
      description: "Applied automatically on the date. Rent charged for months due from then uses the new amount.",
      submit: "Save",
      onSubmit: () =>
        save(
          () => setIncrease({ id: lease._id, effectiveDate: v("effectiveDate") || null, newRent: v("newRent") ? parseAmount(v("newRent")) : undefined }),
          v("effectiveDate") ? "Rent increase planned" : "Rent increase removed",
        ),
      body: (
        <>
          <DateField label="From" value={v("effectiveDate")} onChange={set("effectiveDate")} hint="Clear the date to remove a planned increase." />
          <Field label={`New monthly rent (${cur})`} value={v("newRent")} onChangeText={set("newRent")} keyboardType="decimal-pad" />
        </>
      ),
    },
    deposit: {
      title: "Settle the deposit",
      description: `Held: ${money(lease.deposit?.held ?? 0, cur)}. The tenant owes ${money(Math.max(0, lease.balance), cur)}. Add damage charges first if the move-out inspection found any.`,
      submit: "Save",
      onSubmit: () => {
        const apply = parseAmount(v("apply") || "0") || 0;
        const refund = parseAmount(v("refund") || "0") || 0;
        return save(async () => {
          if (v("heldIn") && v("heldIn") !== lease.deposit?.heldIn) {
            await setHeldIn({ leaseId: lease._id, heldIn: v("heldIn") as "trust" | "business" | "landlord" });
          }
          if (apply + refund > 0) {
            await settle({ leaseId: lease._id, date: v("date"), applyAmount: apply, refundAmount: refund, note: v("note") || undefined });
          }
        }, "Deposit updated");
      },
      body: (
        <>
          <Field label={`Apply to amounts owed (${cur})`} value={v("apply")} onChangeText={set("apply")} keyboardType="decimal-pad" />
          <Field label={`Refund to tenant (${cur})`} value={v("refund")} onChangeText={set("refund")} keyboardType="decimal-pad" />
          <DateField label="Date" value={v("date")} onChange={set("date")} />
          <Select label="Held in" value={v("heldIn")} onChange={set("heldIn")} options={HELD_IN_OPTIONS.map((h) => ({ value: h.value as string, label: h.label }))} />
          <Field label="Note" value={v("note")} onChangeText={set("note")} placeholder="For example: refunded by bank transfer" />
        </>
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
              note: v("note"),
              promiseDate: v("promiseDate") || undefined,
              promiseAmount: v("promiseAmount") ? parseAmount(v("promiseAmount")) : undefined,
            }),
          "Note saved",
        ),
      body: (
        <>
          <Field label="Note" value={v("note")} onChangeText={set("note")} multiline />
          <DateField label="Promised to pay by (optional)" value={v("promiseDate")} onChange={set("promiseDate")} />
          <Field label={`Promised amount (${cur})`} value={v("promiseAmount")} onChangeText={set("promiseAmount")} keyboardType="decimal-pad" />
        </>
      ),
    },
  };

  const c = kind ? config[kind] : null;
  return (
    <Sheet
      open={!!c}
      onClose={onClose}
      title={c?.title ?? ""}
      footer={<Button title={c?.submit ?? "Save"} variant={c?.danger ? "danger" : "primary"} onPress={() => c?.onSubmit()} loading={busy} />}
    >
      {c?.description && (
        <Body small muted>
          {c.description}
        </Body>
      )}
      {c?.body}
    </Sheet>
  );
}
