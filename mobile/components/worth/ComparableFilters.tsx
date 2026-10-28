/**
 * Comparable search (VW-32): suburb on the screen, the other filters (kind,
 * type, size, value, currency, dates) in a sheet. Shared by the comparables
 * tab and a job's evidence section.
 */
import { useState } from "react";
import { View } from "react-native";
import { Button, DateField, Field, SearchBar, Select, Sheet } from "../ui";
import { space } from "../../lib/theme";
import { numOrUndef } from "../../lib/worth/util";
import { Pair } from "./bits";

export type ComparableFilters = {
  suburb: string;
  kind: "" | "sale" | "rental" | "valuation";
  propertyType: string;
  sizeBasis: "building" | "land";
  minSize: string;
  maxSize: string;
  minValue: string;
  maxValue: string;
  currency: "" | "USD" | "ZiG";
  from: string;
  to: string;
};

export const emptyFilters = (suburb = ""): ComparableFilters => ({
  suburb,
  kind: "",
  propertyType: "",
  sizeBasis: "building",
  minSize: "",
  maxSize: "",
  minValue: "",
  maxValue: "",
  currency: "",
  from: "",
  to: "",
});

/** Filters as query args for api.worth.comparables.search. */
export function toSearchArgs(f: ComparableFilters) {
  const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  return {
    suburb: f.suburb.trim() || undefined,
    kind: f.kind || undefined,
    propertyType: f.propertyType.trim() || undefined,
    sizeBasis: f.sizeBasis,
    minSize: numOrUndef(f.minSize),
    maxSize: numOrUndef(f.maxSize),
    minValue: numOrUndef(f.minValue),
    maxValue: numOrUndef(f.maxValue),
    currency: f.currency || undefined,
    from: date(f.from),
    to: date(f.to),
  };
}

function activeCount(f: ComparableFilters): number {
  return [f.kind, f.propertyType, f.minSize, f.maxSize, f.minValue, f.maxValue, f.currency, f.from, f.to].filter(Boolean).length;
}

export function ComparableFilterBar({ value, onChange }: { value: ComparableFilters; onChange: (f: ComparableFilters) => void }) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<ComparableFilters>) => onChange({ ...value, ...patch });
  const n = activeCount(value);

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SearchBar value={value.suburb} onChangeText={(t) => set({ suburb: t })} placeholder="Suburb" />
        </View>
        <Button small variant={n ? "brand" : "secondary"} icon="options-outline" title={n ? `Filters (${n})` : "Filters"} onPress={() => setOpen(true)} />
      </View>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter comparables"
        footer={
          <Pair>
            <Button variant="secondary" title="Clear" onPress={() => onChange(emptyFilters(value.suburb))} />
            <Button title="Done" onPress={() => setOpen(false)} />
          </Pair>
        }
      >
        <Select
          label="Kind"
          value={value.kind}
          options={[
            { value: "", label: "All" },
            { value: "sale", label: "Sales" },
            { value: "rental", label: "Rentals" },
            { value: "valuation", label: "Valuations" },
          ]}
          onChange={(v) => set({ kind: v })}
        />
        <Field label="Property type" value={value.propertyType} onChangeText={(t) => set({ propertyType: t })} placeholder="Any" />
        <Select
          label="Currency"
          value={value.currency}
          options={[
            { value: "", label: "Both" },
            { value: "USD", label: "USD" },
            { value: "ZiG", label: "ZiG" },
          ]}
          onChange={(v) => set({ currency: v })}
        />
        <Select
          label="Size basis"
          value={value.sizeBasis}
          options={[
            { value: "building", label: "Building size" },
            { value: "land", label: "Land size" },
          ]}
          onChange={(v) => set({ sizeBasis: v })}
        />
        <Pair>
          <Field label="Min size (m²)" value={value.minSize} onChangeText={(t) => set({ minSize: t })} keyboardType="decimal-pad" />
          <Field label="Max size (m²)" value={value.maxSize} onChangeText={(t) => set({ maxSize: t })} keyboardType="decimal-pad" />
        </Pair>
        <Pair>
          <Field label="Min price or rent" value={value.minValue} onChangeText={(t) => set({ minValue: t })} keyboardType="decimal-pad" />
          <Field label="Max price or rent" value={value.maxValue} onChangeText={(t) => set({ maxValue: t })} keyboardType="decimal-pad" />
        </Pair>
        <DateField label="From" value={value.from} onChange={(v) => set({ from: v })} />
        <DateField label="To" value={value.to} onChange={(v) => set({ to: v })} />
      </Sheet>
    </View>
  );
}
