/** Add or edit a comparable (VW-30) in a bottom sheet. */
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, DateField, Field, Select, Sheet } from "../ui";
import { CURRENCY_OPTIONS, numOrUndef, numStr, todayIso, type ComparableView } from "../../lib/worth/util";
import { ErrorNote, Pair } from "./bits";

type Kind = "sale" | "rental" | "valuation";

const blank = (suburb = "") => ({
  kind: "sale" as Kind,
  address: "",
  suburb,
  propertyType: "",
  landSizeM2: "",
  buildingSizeM2: "",
  bedrooms: "",
  price: "",
  rent: "",
  forcedSaleValue: "",
  currency: "USD" as "USD" | "ZiG",
  date: todayIso(),
  sourceNote: "",
  notes: "",
  externalRef: "",
});

export function ComparableForm({
  open,
  editing,
  defaultSuburb,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing?: ComparableView | null;
  defaultSuburb?: string;
  onClose: () => void;
  onSaved?: (id: Id<"worthComparables">) => void;
}) {
  const create = useMutation(api.worth.comparables.create);
  const update = useMutation(api.worth.comparables.update);
  const [f, setF] = useState(blank());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setF({
        kind: editing.kind,
        address: editing.address,
        suburb: editing.suburb,
        propertyType: editing.propertyType,
        landSizeM2: numStr(editing.landSizeM2),
        buildingSizeM2: numStr(editing.buildingSizeM2),
        bedrooms: numStr(editing.bedrooms),
        price: numStr(editing.price),
        rent: numStr(editing.rent),
        forcedSaleValue: numStr(editing.forcedSaleValue),
        currency: editing.currency,
        date: editing.date,
        sourceNote: editing.sourceNote ?? "",
        notes: editing.notes ?? "",
        externalRef: editing.externalRef ?? "",
      });
    } else {
      setF(blank(defaultSuburb));
    }
  }, [open, editing, defaultSuburb]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const args = {
      kind: f.kind,
      address: f.address,
      suburb: f.suburb,
      propertyType: f.propertyType,
      landSizeM2: numOrUndef(f.landSizeM2),
      buildingSizeM2: numOrUndef(f.buildingSizeM2),
      bedrooms: numOrUndef(f.bedrooms),
      price: f.kind === "rental" ? undefined : numOrUndef(f.price),
      rent: numOrUndef(f.rent),
      forcedSaleValue: f.kind === "valuation" ? numOrUndef(f.forcedSaleValue) : undefined,
      currency: f.currency,
      date: f.date,
      sourceNote: f.sourceNote || undefined,
      notes: f.notes || undefined,
      externalRef: f.externalRef || undefined,
    };
    try {
      if (editing) {
        await update({ comparableId: editing._id, ...args });
        onSaved?.(editing._id);
      } else {
        onSaved?.(await create(args));
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit comparable" : "Add comparable"} footer={<Button title="Save" onPress={save} loading={busy} />}>
      <Body muted small>
        Sale, rental or valuation evidence. Private to your agency.
      </Body>
      <ErrorNote message={error} />
      <Select
        label="Kind"
        value={f.kind}
        options={[
          { value: "sale", label: "Sale" },
          { value: "rental", label: "Rental" },
          { value: "valuation", label: "Past valuation" },
        ]}
        onChange={(v) => setF({ ...f, kind: v })}
      />
      <DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
      <Field label="Address" value={f.address} onChangeText={(t) => setF({ ...f, address: t })} />
      <Field label="Suburb" value={f.suburb} onChangeText={(t) => setF({ ...f, suburb: t })} />
      <Field label="Property type" value={f.propertyType} onChangeText={(t) => setF({ ...f, propertyType: t })} placeholder="House, flat, office" />
      <Pair>
        <Field label="Land size (m²)" value={f.landSizeM2} onChangeText={(t) => setF({ ...f, landSizeM2: t })} keyboardType="decimal-pad" />
        <Field label="Building (m²)" value={f.buildingSizeM2} onChangeText={(t) => setF({ ...f, buildingSizeM2: t })} keyboardType="decimal-pad" />
      </Pair>
      <Pair>
        <Select label="Currency" value={f.currency} options={CURRENCY_OPTIONS} onChange={(v) => setF({ ...f, currency: v })} />
        <Field label="Bedrooms" value={f.bedrooms} onChangeText={(t) => setF({ ...f, bedrooms: t })} keyboardType="number-pad" />
      </Pair>
      {f.kind !== "rental" && (
        <Field label={f.kind === "valuation" ? "Market value" : "Sale price"} value={f.price} onChangeText={(t) => setF({ ...f, price: t })} keyboardType="decimal-pad" />
      )}
      <Field label={f.kind === "rental" ? "Rent per month (required)" : "Rent per month"} value={f.rent} onChangeText={(t) => setF({ ...f, rent: t })} keyboardType="decimal-pad" />
      {f.kind === "valuation" && (
        <Field label="Forced-sale value" value={f.forcedSaleValue} onChangeText={(t) => setF({ ...f, forcedSaleValue: t })} keyboardType="decimal-pad" />
      )}
      <Field label="Source" value={f.sourceNote} onChangeText={(t) => setF({ ...f, sourceNote: t })} placeholder="Deeds office, agent, own file" />
      <Field label="Reference" value={f.externalRef} onChangeText={(t) => setF({ ...f, externalRef: t })} placeholder="Old job number" />
      <Field label="Notes" value={f.notes} onChangeText={(t) => setF({ ...f, notes: t })} multiline />
    </Sheet>
  );
}
