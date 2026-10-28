"use client";

/** Comparables chosen for a job with the valuer's adjustment (VW-32, VW-33). */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatArea, formatDay, formatMoney } from "@/lib/worth/format";
import { ComparableForm, type ComparableView } from "./comparable-form";
import { ComparableFilterBar, emptyFilters, toSearchArgs, useDebouncedValue } from "./comparable-filters";
import { Section, attempt, numOrUndef } from "./ui";
import type { JobView } from "./job-overview";

function amountOf(c: Pick<ComparableView, "price" | "rent" | "currency">) {
  if (c.price) return formatMoney(c.price, c.currency);
  if (c.rent) return `${formatMoney(c.rent, c.currency)} pm`;
  return "-";
}

function ratePerM2(c: Pick<ComparableView, "price" | "buildingSizeM2" | "landSizeM2">) {
  const size = c.buildingSizeM2 || c.landSizeM2;
  return c.price && size ? c.price / size : null;
}

const KIND_LABEL = { sale: "Sale", rental: "Rental", valuation: "Valuation" } as const;

export function JobEvidence({ job }: { job: JobView }) {
  const selected = useQuery(api.worth.comparables.listForJob, { jobId: job._id });
  const addToJob = useMutation(api.worth.comparables.addToJob);
  const updateOnJob = useMutation(api.worth.comparables.updateOnJob);
  const removeFromJob = useMutation(api.worth.comparables.removeFromJob);
  const editable = job.canWork && ["new", "assigned", "inspected", "draft"].includes(job.status);
  const [filters, setFilters] = React.useState(() => emptyFilters(job.suburb));
  const debounced = useDebouncedValue(filters);
  const results = useQuery(api.worth.comparables.search, editable ? { ...toSearchArgs(debounced), limit: 50 } : "skip");
  const [adding, setAdding] = React.useState(false);
  const chosen = new Set(selected?.map((s) => s.comparable._id));

  return (
    <div className="space-y-4">
      <Section
        title="Evidence for this job"
        description="Adjust each comparable for size, condition, location and date. The adjusted rate feeds the comparison calculator and the report."
      >
        {selected === undefined ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : selected.length === 0 ? (
          <p className="text-sm text-text-muted">No comparables chosen yet.{editable ? " Search below to add some." : ""}</p>
        ) : (
          <div className="space-y-3">
            {selected.map((s) => (
              <SelectedRow
                key={s.linkId}
                editable={editable}
                item={s}
                onSave={(adjustmentPct, note) => attempt(() => updateOnJob({ linkId: s.linkId, adjustmentPct, note }))}
                onRemove={() => attempt(() => removeFromJob({ linkId: s.linkId }))}
              />
            ))}
          </div>
        )}
      </Section>

      {editable && (
        <Section
          title="Find comparables"
          description="Your agency's sales, rentals and past valuations."
          actions={
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              New evidence
            </Button>
          }
        >
          <ComparableFilterBar value={filters} onChange={setFilters} />
          <div className="mt-4 divide-y divide-border rounded-[10px] border border-border">
            {results === undefined ? (
              <p className="p-3 text-sm text-text-muted">Searching...</p>
            ) : results.items.length === 0 ? (
              <p className="p-3 text-sm text-text-muted">Nothing matches. Widen the search or add new evidence.</p>
            ) : (
              results.items.map((c) => (
                <div key={c._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.address}, {c.suburb}
                    </p>
                    <p className="text-xs text-text-muted">
                      {KIND_LABEL[c.kind]} · {c.propertyType} · {formatDay(c.date)} · land {formatArea(c.landSizeM2)} · building{" "}
                      {formatArea(c.buildingSizeM2)} · {amountOf(c)}
                      {c.jobRef ? ` · ${c.jobRef}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={chosen.has(c._id) ? "secondary" : "primary"}
                    disabled={chosen.has(c._id) || c.jobId === job._id}
                    onClick={() => attempt(() => addToJob({ jobId: job._id, comparableId: c._id }))}
                  >
                    {chosen.has(c._id) ? "Added" : "Add"}
                  </Button>
                </div>
              ))
            )}
          </div>
          {results && results.total > results.items.length && (
            <p className="mt-2 text-xs text-text-muted">
              Showing {results.items.length} of {results.total}. Narrow the search to see others.
            </p>
          )}
        </Section>
      )}

      <ComparableForm
        open={adding}
        defaultSuburb={job.suburb}
        onClose={() => setAdding(false)}
        onSaved={(id: Id<"worthComparables">) => void attempt(() => addToJob({ jobId: job._id, comparableId: id }))}
      />
    </div>
  );
}

function SelectedRow({
  item,
  editable,
  onSave,
  onRemove,
}: {
  item: { adjustmentPct: number; note: string; comparable: ComparableView };
  editable: boolean;
  onSave: (pct: number, note: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const c = item.comparable;
  const [pct, setPct] = React.useState(String(item.adjustmentPct));
  const [note, setNote] = React.useState(item.note);
  React.useEffect(() => {
    setPct(String(item.adjustmentPct));
    setNote(item.note);
  }, [item.adjustmentPct, item.note]);
  const rate = ratePerM2(c);
  const p = numOrUndef(pct) ?? 0;
  const changed = p !== item.adjustmentPct || note !== item.note;

  return (
    <div className="rounded-[10px] border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {c.address}, {c.suburb} <Badge variant="neutral" className="ml-1 px-2 py-0.5">{KIND_LABEL[c.kind]}</Badge>
          </p>
          <p className="text-xs text-text-muted">
            {c.propertyType} · {formatDay(c.date)} · land {formatArea(c.landSizeM2)} · building {formatArea(c.buildingSizeM2)} ·{" "}
            {amountOf(c)}
            {rate ? ` · ${formatMoney(rate, c.currency)}/m², adjusted ${formatMoney(rate * (1 + p / 100), c.currency)}/m²` : ""}
          </p>
        </div>
        {editable && (
          <Button variant="ghost" className="h-9 w-9 shrink-0 p-0" aria-label="Remove comparable" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Input
            className="h-9 w-20"
            inputMode="decimal"
            value={pct}
            disabled={!editable}
            onChange={(e) => setPct(e.target.value)}
            aria-label="Adjustment percent"
          />
          <span className="text-sm text-text-muted">%</span>
        </div>
        <Input
          className="h-9 min-w-0 flex-1"
          value={note}
          disabled={!editable}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason, e.g. smaller stand, older finishes"
        />
        {editable && changed && (
          <Button size="sm" onClick={() => onSave(p, note)}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
