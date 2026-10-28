"use client";

/** Comparable search filters (VW-32), shared by the database page and a job's evidence tab. */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, numOrUndef } from "./ui";

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
    from: f.from || undefined,
    to: f.to || undefined,
  };
}

export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ComparableFilterBar({
  value,
  onChange,
}: {
  value: ComparableFilters;
  onChange: (f: ComparableFilters) => void;
}) {
  const set = (patch: Partial<ComparableFilters>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="Suburb">
        <Input value={value.suburb} onChange={(e) => set({ suburb: e.target.value })} placeholder="Any" />
      </Field>
      <Field label="Kind">
        <Select value={value.kind} onChange={(e) => set({ kind: e.target.value as ComparableFilters["kind"] })}>
          <option value="">All</option>
          <option value="sale">Sales</option>
          <option value="rental">Rentals</option>
          <option value="valuation">Valuations</option>
        </Select>
      </Field>
      <Field label="Property type">
        <Input value={value.propertyType} onChange={(e) => set({ propertyType: e.target.value })} placeholder="Any" />
      </Field>
      <Field label="Currency">
        <Select value={value.currency} onChange={(e) => set({ currency: e.target.value as ComparableFilters["currency"] })}>
          <option value="">Both</option>
          <option value="USD">USD</option>
          <option value="ZiG">ZiG</option>
        </Select>
      </Field>
      <Field label="Size (m²)" className="col-span-2">
        <div className="flex gap-1.5">
          <Select className="w-24 shrink-0 px-2" value={value.sizeBasis} onChange={(e) => set({ sizeBasis: e.target.value as "building" | "land" })}>
            <option value="building">Building</option>
            <option value="land">Land</option>
          </Select>
          <Input inputMode="decimal" placeholder="Min" value={value.minSize} onChange={(e) => set({ minSize: e.target.value })} />
          <Input inputMode="decimal" placeholder="Max" value={value.maxSize} onChange={(e) => set({ maxSize: e.target.value })} />
        </div>
      </Field>
      <Field label="Price, value or rent" className="col-span-2">
        <div className="flex gap-1.5">
          <Input inputMode="decimal" placeholder="Min" value={value.minValue} onChange={(e) => set({ minValue: e.target.value })} />
          <Input inputMode="decimal" placeholder="Max" value={value.maxValue} onChange={(e) => set({ maxValue: e.target.value })} />
        </div>
      </Field>
      <Field label="From">
        <Input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} />
      </Field>
      <Field label="To">
        <Input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} />
      </Field>
    </div>
  );
}
