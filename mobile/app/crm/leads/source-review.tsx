/**
 * Leads still on the retired generic "Property portal" source
 * (leads.listNeedsSourceReview). Reassign one at a time or in bulk
 * (leads.bulkSetSource) so source reporting is accurate.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, List, Notice, Row, Select } from "../../../components/ui";
import { CheckRow } from "../../../components/crm/leads/bits";
import { useRun } from "../../../lib/useRun";
import { dateLabel } from "../../../lib/format";
import { interestLabel, LEAD_SOURCE_OPTIONS, leadSourceLabel, type LeadSource } from "../../../lib/crm/leads/helpers";
import { useRefresh } from "../../../lib/crm/leads/useRefresh";
import { space } from "../../../lib/theme";

export default function SourceReview() {
  const router = useRouter();
  const data = useQuery(api.leads.listNeedsSourceReview, {});
  const bulkSetSource = useMutation(api.leads.bulkSetSource);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();
  const [selected, setSelected] = useState<Set<Id<"leads">>>(new Set());
  const [source, setSource] = useState<LeadSource>("propertybook");
  const items = useMemo(() => data?.items ?? [], [data]);
  const allOn = items.length > 0 && selected.size === items.length;

  const toggle = (id: Id<"leads">) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = async (ids: Id<"leads">[], to: LeadSource) => {
    if (!ids.length) return;
    const r = await run(() => bulkSetSource({ leadIds: ids, source: to }));
    if (r) {
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }
  };

  const header = (
    <View style={{ gap: space.md }}>
      <Body muted>These leads were recorded under the old generic "Property portal" source. Reassign each one to the platform it came from.</Body>
      {items.length > 0 && (
        <Card>
          <Select label="Reassign selected to" value={source} options={LEAD_SOURCE_OPTIONS} onChange={setSource} />
          <Row>
            <Button small variant="secondary" title={allOn ? "Clear selection" : "Select all"} onPress={() => setSelected(allOn ? new Set() : new Set(items.map((l) => l._id)))} />
            <Button small style={{ flex: 1 }} title={`Apply to ${selected.size} selected`} loading={busy} disabled={!selected.size} onPress={() => apply([...selected], source)} />
          </Row>
        </Card>
      )}
      {items.length > 0 && <Notice>{`${items.length} lead${items.length === 1 ? "" : "s"} need a source. Or set each one below.`}</Notice>}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Lead source review" }} />
      <List
        data={data === undefined ? undefined : items}
        header={header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyExtractor={(l) => l._id}
        empty={<EmptyState icon="checkmark-done-outline" title="Nothing to review" message="Every lead has a specific source." />}
        renderItem={({ item: l }) => (
          <View style={{ gap: space.xs }}>
            <CheckRow
              on={selected.has(l._id)}
              onPress={() => toggle(l._id)}
              title={l.fullName}
              subtitle={`${l.phone || l.email || "No contact details"} · ${interestLabel(l.interestType, true)} · ${l.ownerName} · ${dateLabel(l.createdAt)}`}
            />
            <Row>
              <View style={{ flex: 1 }}>
                <Select label={`Source for ${l.fullName}`} value="" placeholder={`Now: ${leadSourceLabel(l.source)}`} options={LEAD_SOURCE_OPTIONS} onChange={(v) => apply([l._id], v)} />
              </View>
              <Button small variant="ghost" title="Open" onPress={() => router.push(`/crm/leads/${l._id}` as Href)} />
            </Row>
          </View>
        )}
      />
    </>
  );
}
