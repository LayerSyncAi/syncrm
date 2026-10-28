"use client";

/** Add or edit a comparable (VW-30). */
import * as React from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { todayIso } from "@/lib/worth/format";
import { ErrorNote, Field, numOrUndef, numStr, worthToast } from "./ui";

export type ComparableView = FunctionReturnType<typeof api.worth.comparables.search>["items"][number];
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
  const [f, setF] = React.useState(blank());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
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
        worthToast.done("Comparable updated");
        onSaved?.(editing._id);
      } else {
        const id = await create(args);
        worthToast.done("Comparable added");
        onSaved?.(id);
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
      open={open}
      title={editing ? "Edit comparable" : "Add comparable"}
      description="Sale, rental or valuation evidence. Private to your agency."
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ErrorNote message={error} />
        </div>
        <Field label="Kind">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
            <option value="sale">Sale</option>
            <option value="rental">Rental</option>
            <option value="valuation">Past valuation</option>
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Address" required className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="Suburb" required>
          <Input value={f.suburb} onChange={(e) => setF({ ...f, suburb: e.target.value })} />
        </Field>
        <Field label="Property type">
          <Input value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} placeholder="House, flat, office" />
        </Field>
        <Field label="Land size (m²)">
          <Input inputMode="decimal" value={f.landSizeM2} onChange={(e) => setF({ ...f, landSizeM2: e.target.value })} />
        </Field>
        <Field label="Building size (m²)">
          <Input inputMode="decimal" value={f.buildingSizeM2} onChange={(e) => setF({ ...f, buildingSizeM2: e.target.value })} />
        </Field>
        <Field label="Currency">
          <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as "USD" | "ZiG" })}>
            <option value="USD">USD</option>
            <option value="ZiG">ZiG</option>
          </Select>
        </Field>
        <Field label="Bedrooms">
          <Input inputMode="numeric" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} />
        </Field>
        {f.kind !== "rental" && (
          <Field label={f.kind === "valuation" ? "Market value" : "Sale price"} required>
            <Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
        )}
        <Field label="Rent per month" required={f.kind === "rental"}>
          <Input inputMode="decimal" value={f.rent} onChange={(e) => setF({ ...f, rent: e.target.value })} />
        </Field>
        {f.kind === "valuation" && (
          <Field label="Forced-sale value">
            <Input inputMode="decimal" value={f.forcedSaleValue} onChange={(e) => setF({ ...f, forcedSaleValue: e.target.value })} />
          </Field>
        )}
        <Field label="Source">
          <Input value={f.sourceNote} onChange={(e) => setF({ ...f, sourceNote: e.target.value })} placeholder="Deeds office, agent, own file" />
        </Field>
        <Field label="Reference">
          <Input value={f.externalRef} onChange={(e) => setF({ ...f, externalRef: e.target.value })} placeholder="Old job number" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} className="min-h-[64px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
