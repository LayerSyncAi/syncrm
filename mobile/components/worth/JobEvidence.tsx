/** Comparables chosen for a job with the valuer's adjustment (VW-32, VW-33). */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Field, Ionicons, Loading, Row } from "../ui";
import { useRun, confirm } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import {
  COMPARABLE_KIND_LABELS,
  comparableAmount,
  formatArea,
  formatDay,
  formatMoney,
  isEditableStatus,
  numOrUndef,
  useDebounced,
  type ComparableView,
  type JobView,
} from "../../lib/worth/util";
import { ComparableCard } from "./ComparableCard";
import { ComparableFilterBar, emptyFilters, toSearchArgs } from "./ComparableFilters";
import { ComparableForm } from "./ComparableForm";
import { Panel } from "./bits";

function ratePerM2(c: Pick<ComparableView, "price" | "buildingSizeM2" | "landSizeM2">) {
  const size = c.buildingSizeM2 || c.landSizeM2;
  return c.price && size ? c.price / size : null;
}

export function JobEvidence({ job }: { job: JobView }) {
  const selected = useQuery(api.worth.comparables.listForJob, { jobId: job._id });
  const addToJob = useMutation(api.worth.comparables.addToJob);
  const updateOnJob = useMutation(api.worth.comparables.updateOnJob);
  const removeFromJob = useMutation(api.worth.comparables.removeFromJob);
  const { run } = useRun();
  const editable = job.canWork && isEditableStatus(job.status);
  const [filters, setFilters] = useState(() => emptyFilters(job.suburb));
  const debounced = useDebounced(filters);
  const results = useQuery(api.worth.comparables.search, editable ? { ...toSearchArgs(debounced), limit: 50 } : "skip");
  const [adding, setAdding] = useState(false);
  const chosen = new Set(selected?.map((s) => s.comparable._id));

  return (
    <View style={{ gap: space.lg }}>
      <Panel
        title="Evidence for this job"
        description="Adjust each comparable for size, condition, location and date. The adjusted rate feeds the comparison calculator and the report."
      >
        {selected === undefined ? (
          <Loading />
        ) : selected.length === 0 ? (
          <Body muted small>
            No comparables chosen yet.{editable ? " Search below to add some." : ""}
          </Body>
        ) : (
          selected.map((s) => (
            <SelectedRow
              key={s.linkId}
              editable={editable}
              item={s}
              onSave={(adjustmentPct, note) => run(() => updateOnJob({ linkId: s.linkId, adjustmentPct, note }), { success: "Adjustment saved" })}
              onRemove={async () => {
                if (await confirm("Remove comparable", "It stays in the comparables database.", "Remove", true)) {
                  void run(() => removeFromJob({ linkId: s.linkId }));
                }
              }}
            />
          ))
        )}
      </Panel>

      {editable && (
        <Panel
          title="Find comparables"
          description="Your agency's sales, rentals and past valuations."
          right={<Button small variant="secondary" icon="add" title="New" onPress={() => setAdding(true)} />}
        >
          <ComparableFilterBar value={filters} onChange={setFilters} />
          {results === undefined ? (
            <Loading />
          ) : results.items.length === 0 ? (
            <Body muted small>
              Nothing matches. Widen the search or add new evidence.
            </Body>
          ) : (
            results.items.map((c) => {
              const added = chosen.has(c._id);
              return (
                <ComparableCard
                  key={c._id}
                  c={c}
                  right={
                    <Button
                      small
                      variant={added ? "secondary" : "primary"}
                      title={added ? "Added" : "Add"}
                      disabled={added || c.jobId === job._id}
                      onPress={() => run(() => addToJob({ jobId: job._id, comparableId: c._id }))}
                    />
                  }
                />
              );
            })
          )}
          {results && results.total > results.items.length && (
            <Body muted small>
              Showing {results.items.length} of {results.total}. Narrow the search to see others.
            </Body>
          )}
        </Panel>
      )}

      <ComparableForm
        open={adding}
        defaultSuburb={job.suburb}
        onClose={() => setAdding(false)}
        onSaved={(id: Id<"worthComparables">) => void run(() => addToJob({ jobId: job._id, comparableId: id }))}
      />
    </View>
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
  onSave: (pct: number, note: string) => Promise<unknown>;
  onRemove: () => void;
}) {
  const c = item.comparable;
  const [pct, setPct] = useState(String(item.adjustmentPct));
  const [note, setNote] = useState(item.note);
  useEffect(() => {
    setPct(String(item.adjustmentPct));
    setNote(item.note);
  }, [item.adjustmentPct, item.note]);
  const rate = ratePerM2(c);
  const p = numOrUndef(pct) ?? 0;
  const changed = p !== item.adjustmentPct || note !== item.note;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <Text style={{ flexShrink: 1, fontSize: font.md, fontWeight: "600", color: colors.text }}>
              {c.address}, {c.suburb}
            </Text>
            <Badge label={COMPARABLE_KIND_LABELS[c.kind]} />
          </Row>
          {rate ? (
            <Text style={{ fontSize: font.sm, color: colors.muted }}>
              {formatMoney(rate, c.currency)}/m², adjusted {formatMoney(rate * (1 + p / 100), c.currency)}/m²
            </Text>
          ) : null}
        </View>
        {editable && (
          <Pressable accessibilityLabel="Remove comparable" hitSlop={10} onPress={onRemove}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        )}
      </Row>
      <ComparableSummary c={c} />
      <Row style={{ alignItems: "flex-end" }}>
        <View style={{ width: 92 }}>
          <Field label="Adjust %" value={pct} onChangeText={setPct} keyboardType="numbers-and-punctuation" editable={editable} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Reason" value={note} onChangeText={setNote} placeholder="Smaller stand, older finishes" editable={editable} />
        </View>
      </Row>
      {editable && changed && <Button small title="Save adjustment" onPress={() => onSave(p, note)} />}
    </View>
  );
}

function ComparableSummary({ c }: { c: ComparableView }) {
  return (
    <Text style={{ fontSize: font.sm, color: colors.muted }}>
      {c.propertyType} · {formatDay(c.date)} · land {formatArea(c.landSizeM2)} · building {formatArea(c.buildingSizeM2)} · {comparableAmount(c)}
    </Text>
  );
}
