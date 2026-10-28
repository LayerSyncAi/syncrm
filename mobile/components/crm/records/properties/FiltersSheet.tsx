/** The property list filters the website shows above its table. */
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button, Field, Select, Sheet } from "../../../ui";
import { LISTING_OPTIONS, TYPE_OPTIONS, type ListingType, type PropertyType } from "../../../../lib/crm/records/properties/labels";

export type PropertyFilters = {
  listingType: ListingType | "";
  type: PropertyType | "";
  location: string;
  priceMin: string;
  ownerUserId: Id<"users"> | "";
  sortBy: "" | "created_desc" | "created_asc";
};

export const NO_FILTERS: PropertyFilters = { listingType: "", type: "", location: "", priceMin: "", ownerUserId: "", sortBy: "" };

/** How many filters are set, for the button badge. */
export function activeCount(f: PropertyFilters): number {
  return [f.listingType, f.type, f.location.trim(), f.priceMin.trim(), f.ownerUserId, f.sortBy].filter(Boolean).length;
}

const ANY = "any";

export function FiltersSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: PropertyFilters;
  onChange: (f: PropertyFilters) => void;
}) {
  const users = useQuery(api.users.listForAssignment, open ? {} : "skip") ?? [];
  const set = <K extends keyof PropertyFilters>(k: K, v: PropertyFilters[K]) => onChange({ ...value, [k]: v });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <>
          <Button title="Show properties" onPress={onClose} />
          <Button title="Clear filters" variant="ghost" onPress={() => onChange(NO_FILTERS)} />
        </>
      }
    >
      <Select
        label="Listing"
        value={value.listingType || ANY}
        options={[{ value: ANY, label: "All" }, ...LISTING_OPTIONS]}
        onChange={(v) => set("listingType", v === ANY ? "" : (v as ListingType))}
      />
      <Select
        label="Type"
        value={value.type || ANY}
        options={[{ value: ANY, label: "Any" }, ...TYPE_OPTIONS]}
        onChange={(v) => set("type", v === ANY ? "" : (v as PropertyType))}
      />
      <Field label="Location" value={value.location} onChangeText={(s) => set("location", s)} placeholder="Search location" />
      <Field label="Minimum price" value={value.priceMin} onChangeText={(s) => set("priceMin", s)} keyboardType="decimal-pad" placeholder="0" />
      <Select
        label="Assigned agent"
        value={value.ownerUserId || ANY}
        options={[{ value: ANY, label: "Anyone" }, ...users.map((u) => ({ value: u._id as string, label: u.name }))]}
        onChange={(v) => set("ownerUserId", v === ANY ? "" : (v as Id<"users">))}
      />
      <Select
        label="Order"
        value={value.sortBy || ANY}
        options={[
          { value: ANY, label: "Default" },
          { value: "created_desc", label: "Newest first" },
          { value: "created_asc", label: "Oldest first" },
        ]}
        onChange={(v) => set("sortBy", v === ANY ? "" : (v as "created_desc" | "created_asc"))}
      />
    </Sheet>
  );
}
