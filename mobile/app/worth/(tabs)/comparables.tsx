/** Comparables database (VW-30..35): search, add, edit, Excel or CSV import and SynCRM deals. */
import { useState } from "react";
import { Alert, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Button, EmptyState, Fab, List, Loading } from "../../../components/ui";
import { Actions } from "../../../components/worth/bits";
import { ComparableCard } from "../../../components/worth/ComparableCard";
import { ComparableFilterBar, emptyFilters, toSearchArgs } from "../../../components/worth/ComparableFilters";
import { ComparableForm } from "../../../components/worth/ComparableForm";
import { ComparableImport } from "../../../components/worth/ComparableImport";
import { confirm, useRun } from "../../../lib/useRun";
import { space } from "../../../lib/theme";
import { SOURCE_LABELS, useDebounced, useKeep, usePullRefresh, type ComparableView } from "../../../lib/worth/util";

export default function WorthComparables() {
  const router = useRouter();
  const settings = useQuery(api.worth.settings.get);
  const allowed = settings?.caps.seesEvidence ?? false;
  const [filters, setFilters] = useState(() => emptyFilters());
  const debounced = useDebounced(filters);
  const data = useKeep(useQuery(api.worth.comparables.search, allowed ? { ...toSearchArgs(debounced), limit: 300 } : "skip"));
  const remove = useMutation(api.worth.comparables.remove);
  const pullCrm = useMutation(api.worth.comparables.importCrmSales);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = usePullRefresh();
  const [editing, setEditing] = useState<ComparableView | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  if (settings === undefined) return <Loading />;
  if (!allowed) return <EmptyState icon="library-outline" title="Comparables are for the valuation team" message="Ask a director if you need access." />;
  const canEdit = data?.canEdit ?? false;

  const actions = (c: ComparableView) => {
    if (c.jobId) {
      Alert.alert(c.address, c.jobRef ? `From valuation ${c.jobRef}` : SOURCE_LABELS[c.source], [
        { text: "Open job", onPress: () => router.push(`/worth/jobs/${c.jobId}` as Href) },
        ...(canEdit && c.source !== "own_valuation" ? [{ text: "Edit", onPress: () => setEditing(c) }] : []),
        { text: "Close", style: "cancel" as const },
      ]);
      return;
    }
    if (!canEdit || c.source === "own_valuation") return;
    Alert.alert(c.address, c.sourceNote || SOURCE_LABELS[c.source], [
      { text: "Edit", onPress: () => setEditing(c) },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (await confirm("Delete comparable", `Delete ${c.address}?`, "Delete", true)) void run(() => remove({ comparableId: c._id }), { success: "Comparable deleted" });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <List
        data={data?.items}
        keyExtractor={(c) => c._id}
        onRefresh={onRefresh}
        refreshing={refreshing}
        header={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            {canEdit && (
              <Actions>
                <Button
                  small
                  variant="secondary"
                  icon="refresh"
                  title="Pull SynCRM deals"
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      const res = await pullCrm({});
                      Alert.alert(res.added ? `${res.added} closed deals added` : "No new closed deals");
                    })
                  }
                />
                <Button small variant="secondary" icon="document-outline" title="Import" onPress={() => setImporting(true)} />
              </Actions>
            )}
            <ComparableFilterBar value={filters} onChange={setFilters} />
            {data && (
              <Body muted small>
                {data.total} match{data.total === 1 ? "" : "es"}
                {data.total > data.items.length ? `, showing ${data.items.length}` : ""}
              </Body>
            )}
          </View>
        }
        empty={<EmptyState icon="library-outline" title="No comparables found" message="Import past valuations and sales, or add evidence as you find it." />}
        renderItem={({ item: c }) => (
          <ComparableCard c={c} onPress={c.jobId || (canEdit && c.source !== "own_valuation") ? () => actions(c) : undefined} />
        )}
      />
      {canEdit && <Fab label="Add comparable" onPress={() => setAdding(true)} />}
      <ComparableForm
        open={adding || !!editing}
        editing={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <ComparableImport open={importing} onClose={() => setImporting(false)} />
    </View>
  );
}
