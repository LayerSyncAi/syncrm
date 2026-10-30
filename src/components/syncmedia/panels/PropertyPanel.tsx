"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { Check, Search } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatMoney } from "@/lib/currency";
import type { BrochureProperty } from "@/lib/syncmedia/fromProperty";
import { cn } from "@/lib/utils";
import { Section } from "./controls";

export interface PickedProperty extends BrochureProperty {
  _id: Id<"properties">;
}

/**
 * Pick the property the brochure is about. Selecting one pulls its photos,
 * headline, price and features across; everything stays editable afterwards,
 * so this is a starting point rather than a binding.
 */
export function PropertyPanel({
  selectedPropertyId,
  onPick,
  onClear,
}: {
  selectedPropertyId?: Id<"properties">;
  onPick: (property: PickedProperty) => void;
  /** Detach from any property and type the brochure out by hand. */
  onClear: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  // The list query filters in memory over the whole org, so firing it on every
  // keystroke is wasteful for no visible gain.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // `list` rather than `search`: the search projection drops `images` and
  // `description`, which are exactly what a brochure needs.
  const result = useQuery(api.properties.list, {
    q: debounced || undefined,
    pageSize: 20,
    sortBy: "created_desc",
  });
  const properties = result?.items;

  return (
    <div className="space-y-5">
      {/* A brochure often runs before the listing does — a valuation won, an
          instruction signed, nothing captured on the system yet. That has to be
          a first-class choice here, not something to work around. */}
      <button
        type="button"
        onClick={onClear}
        aria-pressed={!selectedPropertyId}
        className={cn(
          "w-full cursor-pointer rounded-xl border-2 p-3 text-left transition active:scale-[0.99]",
          !selectedPropertyId
            ? "border-primary bg-row-hover"
            : "border-border bg-card-bg hover:border-primary/40"
        )}
      >
        <span className="block text-sm font-semibold text-text">Not on the system yet</span>
        <span className="mt-0.5 block text-xs text-text-muted">
          Upload your own photos and type the details in.
        </span>
      </button>

      <Section
        title="Or use an existing property"
        hint="Pulls its photos and details in. You can edit everything afterwards."
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, reference or suburb"
            className="h-10 w-full rounded-[10px] border border-border-strong bg-transparent py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-text-dim focus:border-primary-600 focus:ring-4 focus:ring-[var(--primary-glow)]"
          />
        </div>
      </Section>

      {properties === undefined ? (
        <p className="text-xs text-text-muted">Loading properties…</p>
      ) : properties.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-4 text-center text-xs text-text-muted">
          {debounced ? "No properties match that search." : "There are no properties yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {properties.map((property) => {
            const selected = property._id === selectedPropertyId;
            return (
              <li key={property._id}>
                <button
                  type="button"
                  onClick={() => onPick(property as PickedProperty)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 p-2 text-left transition active:scale-[0.99]",
                    selected
                      ? "border-primary bg-row-hover"
                      : "border-border bg-card-bg hover:border-primary/40"
                  )}
                >
                  <span className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {property.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-text">
                        {property.title}
                      </span>
                      {selected ? (
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary-ink" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-text-muted">
                      {[property.pbRefCode, property.location].filter(Boolean).join(" · ")}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-primary-ink">
                      {formatMoney(property.price, property.currency, { decimals: 0 })}
                      {property.listingType === "rent" ? " pm" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
