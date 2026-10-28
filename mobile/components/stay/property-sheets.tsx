/**
 * Edit sheets on a property: landlord details, the management agreement,
 * a unit (with its routine inspection interval) and a property expense.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, DateField, Field, Notice, Select, Sheet, Toggle } from "../ui";
import { OptionGrid } from "./option-grid";
import { PersonFields } from "./person-fields";
import { personArg, personFormFrom, type PersonForm } from "../../lib/stay/person";
import { useRun } from "../../lib/useRun";
import { parseAmount, todayLocal } from "@/lib/stay/format";

export type PropertyView = NonNullable<FunctionReturnType<typeof api.stay.properties.get>>;
export type UnitView = PropertyView["units"][number];

/** Save, then close on success. */
function useSave(onClose: () => void) {
  const { busy, run } = useRun();
  const [error, setError] = useState<string | null>(null);
  const save = async (fn: () => Promise<unknown>, success: string) => {
    setError(null);
    const ok = await run(
      async () => {
        await fn();
        return true;
      },
      { success },
    );
    if (ok) onClose();
  };
  return { busy, error, setError, save };
}

export function LandlordSheet({ landlord, open, onClose }: { landlord: NonNullable<PropertyView["landlord"]>; open: boolean; onClose: () => void }) {
  const update = useMutation(api.stay.people.updatePerson);
  const [form, setForm] = useState<PersonForm>(personFormFrom(landlord));
  const { busy, error, setError, save } = useSave(onClose);
  useEffect(() => {
    if (open) setForm(personFormFrom(landlord));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Landlord: ${landlord.name}`}
      footer={
        <Button
          title="Save landlord"
          loading={busy}
          onPress={() => {
            if (!form.name.trim()) return setError("Name is required.");
            save(() => update({ contactId: landlord._id, person: personArg(form, true) }), "Landlord updated");
          }}
        />
      }
    >
      <Body small muted>
        Changes apply to this contact everywhere in the Hub.
      </Body>
      {error && <Notice tone="danger">{error}</Notice>}
      <PersonFields role="landlord" value={form} onChange={setForm} excludeId={landlord._id} />
    </Sheet>
  );
}

export function AgreementSheet({ p, open, onClose }: { p: PropertyView; open: boolean; onClose: () => void }) {
  const update = useMutation(api.stay.properties.update);
  const managers = useQuery(api.stay.properties.listManagers, open && p.canAssign ? {} : "skip");
  const landlords = useQuery(api.stay.people.landlordOptions, open && p.canAssign ? {} : "skip");
  const { busy, error, setError, save } = useSave(onClose);

  const [name, setName] = useState(p.name);
  const [address, setAddress] = useState(p.address);
  const [kind, setKind] = useState(p.kind);
  const [fee, setFee] = useState(String(p.managementFeePct));
  const [threshold, setThreshold] = useState(p.repairApprovalThreshold !== null ? String(p.repairApprovalThreshold) : "");
  const [managerUserId, setManagerUserId] = useState<string>(p.managerUserId ?? "");
  const [landlordId, setLandlordId] = useState<string>(p.landlord?._id ?? "");
  const [notes, setNotes] = useState(p.notes);
  const [isActive, setIsActive] = useState(p.isActive);

  useEffect(() => {
    if (!open) return;
    setName(p.name);
    setAddress(p.address);
    setKind(p.kind);
    setFee(String(p.managementFeePct));
    setThreshold(p.repairApprovalThreshold !== null ? String(p.repairApprovalThreshold) : "");
    setManagerUserId(p.managerUserId ?? "");
    setLandlordId(p.landlord?._id ?? "");
    setNotes(p.notes);
    setIsActive(p.isActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    const pct = parseAmount(fee);
    if (!(pct >= 0 && pct <= 100)) return setError("Management fee must be between 0 and 100%.");
    const thr = threshold.trim() ? parseAmount(threshold) : null;
    if (thr !== null && !(thr >= 0)) return setError("The approval amount must be a number.");
    if (!name.trim() || !address.trim()) return setError("Name and address are required.");
    save(
      () =>
        update({
          id: p._id,
          name: name.trim(),
          address: address.trim(),
          kind,
          managementFeePct: pct,
          repairApprovalThreshold: thr,
          notes,
          isActive,
          ...(p.canAssign
            ? {
                managerUserId: (managerUserId || null) as Id<"users"> | null,
                landlordContactId: landlordId ? (landlordId as Id<"contacts">) : undefined,
              }
            : {}),
        }),
      "Property updated",
    );
  };

  const landlordOptions = [
    ...(p.landlord && !landlords?.some((l) => l._id === p.landlord!._id) ? [{ value: p.landlord._id as string, label: p.landlord.name }] : []),
    ...(landlords ?? []).map((l) => ({ value: l._id as string, label: l.name })),
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Edit property" footer={<Button title="Save changes" onPress={submit} loading={busy} />}>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Address" value={address} onChangeText={setAddress} />
      <OptionGrid
        label="Use"
        value={kind}
        onChange={setKind}
        options={[
          { value: "residential", label: "Residential" },
          { value: "commercial", label: "Commercial" },
        ]}
      />
      <Field label="Management fee (%)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
      <Field label="Repairs above this need landlord approval" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Leave blank for none" />
      <OptionGrid
        label="Status"
        value={isActive ? "1" : "0"}
        onChange={(v) => setIsActive(v === "1")}
        options={[
          { value: "1", label: "Managed" },
          { value: "0", label: "No longer managed" },
        ]}
      />
      {p.canAssign && (
        <>
          <Select
            label="Property manager"
            value={managerUserId}
            onChange={setManagerUserId}
            options={[{ value: "", label: "Unassigned" }, ...(managers ?? []).map((m) => ({ value: m._id as string, label: m.name }))]}
          />
          <Select label="Landlord" value={landlordId} onChange={setLandlordId} options={landlordOptions} />
          <Body small muted>
            Changing the manager or landlord also updates every lease on this property.
          </Body>
        </>
      )}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

export function UnitSheet({ stayPropertyId, unit, open, onClose }: { stayPropertyId: Id<"stayProperties">; unit: UnitView | null; open: boolean; onClose: () => void }) {
  const add = useMutation(api.stay.properties.addUnit);
  const update = useMutation(api.stay.properties.updateUnit);
  const setUnitInterval = useMutation(api.stay.inspections.setUnitInterval);
  const { busy, error, setError, save } = useSave(onClose);
  const [label, setLabel] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [interval, setIntervalMonths] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLabel(unit?.label ?? "");
    setBedrooms(unit?.bedrooms !== null && unit?.bedrooms !== undefined ? String(unit.bedrooms) : "");
    setIntervalMonths(unit?.inspectionIntervalMonths ? String(unit.inspectionIntervalMonths) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  const submit = () => {
    if (!label.trim()) return setError("Enter the unit name.");
    const beds = bedrooms.trim() ? parseInt(bedrooms, 10) : undefined;
    if (beds !== undefined && (isNaN(beds) || beds < 0)) return setError("Bedrooms must be a number.");
    const months = interval.trim() ? parseInt(interval, 10) : null;
    if (months !== null && (isNaN(months) || months < 1 || months > 60)) {
      return setError("Routine inspections: use 1 to 60 months, or leave blank for none.");
    }
    save(
      async () => {
        const unitId = unit
          ? (await update({ unitId: unit._id, label: label.trim(), bedrooms: beds ?? null }), unit._id)
          : await add({ stayPropertyId, label: label.trim(), bedrooms: beds });
        // The interval also sets when the next routine inspection falls due.
        if (months !== (unit?.inspectionIntervalMonths ?? null)) await setUnitInterval({ unitId, months });
      },
      unit ? "Unit updated" : "Unit added",
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={unit ? `Edit ${unit.label}` : "Add unit"}
      footer={<Button title={unit ? "Save unit" : "Add unit"} onPress={submit} loading={busy} />}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Unit name" value={label} onChangeText={setLabel} placeholder="Flat 3" />
      <Field label="Bedrooms" value={bedrooms} onChangeText={setBedrooms} keyboardType="number-pad" />
      <Field label="Routine inspection every (months)" value={interval} onChangeText={setIntervalMonths} keyboardType="number-pad" placeholder="Blank for none, e.g. 6" />
    </Sheet>
  );
}

export function ExpenseSheet({ p, open, onClose }: { p: PropertyView; open: boolean; onClose: () => void }) {
  const create = useMutation(api.stay.expenses.create);
  const { busy, error, setError, save } = useSave(onClose);
  const firstCurrency = p.units.find((u) => u.lease)?.lease?.currency ?? "USD";
  const [date, setDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZiG">(firstCurrency);
  const [supplier, setSupplier] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [recharge, setRecharge] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(todayLocal());
    setDescription("");
    setAmount("");
    setCurrency(firstCurrency);
    setSupplier("");
    setUnitId("");
    setRecharge(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    const value = parseAmount(amount);
    if (!description.trim()) return setError("Describe the expense.");
    if (!(value > 0)) return setError("Enter the amount.");
    save(
      () =>
        create({
          stayPropertyId: p._id,
          unitId: unitId ? (unitId as Id<"stayUnits">) : undefined,
          date,
          description: description.trim(),
          amount: value,
          currency,
          supplier: supplier.trim() || undefined,
          rechargeToLandlord: recharge,
        }),
      "Expense recorded",
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add expense" footer={<Button title="Save expense" onPress={submit} loading={busy} />}>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Replaced geyser element" />
      <OptionGrid
        label="Currency"
        value={currency}
        onChange={setCurrency}
        options={[
          { value: "USD", label: "USD" },
          { value: "ZiG", label: "ZiG" },
        ]}
      />
      <Field label={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <DateField label="Date" value={date} onChange={setDate} />
      <Field label="Supplier" value={supplier} onChangeText={setSupplier} />
      <Select
        label="Unit"
        value={unitId}
        onChange={setUnitId}
        options={[{ value: "", label: "Whole property" }, ...p.units.map((u) => ({ value: u._id as string, label: u.label }))]}
      />
      <Toggle label="Deduct from the landlord's statement" value={recharge} onChange={setRecharge} />
    </Sheet>
  );
}
