/** Archive of issued valuations, searchable by reference, client, address, suburb, purpose and date. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { WorthPurpose, WorthValues } from "../../../convex/worth/lib";
import { Button, Card, DateField, EmptyState, Field, List, Loading, Row, SearchBar, Select, Sheet } from "../../components/ui";
import { Pair } from "../../components/worth/bits";
import { colors, font, space } from "../../lib/theme";
import { PURPOSE_LABELS, formatDay, formatMoney, optionsOf, useDebounced, useKeep, usePullRefresh } from "../../lib/worth/util";

function mainValue(v: WorthValues) {
  const m = v.market ?? v.rental ?? v.insurance ?? v.forcedSale;
  if (!m) return "-";
  return `${formatMoney(m.amount, m.currency)}${!v.market && v.rental ? " pm" : ""}`;
}

const iso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export default function WorthArchive() {
  const router = useRouter();
  const settings = useQuery(api.worth.settings.get);
  const allowed = settings?.caps.seesEvidence ?? false;
  const [f, setF] = useState({ q: "", suburb: "", purpose: "" as WorthPurpose | "", from: "", to: "" });
  const [filtering, setFiltering] = useState(false);
  const d = useDebounced(f, 250);
  const { refreshing, onRefresh } = usePullRefresh();
  const rows = useKeep(
    useQuery(
      api.worth.reports.archive,
      allowed ? { q: d.q || undefined, suburb: d.suburb || undefined, purpose: d.purpose || undefined, from: iso(d.from), to: iso(d.to) } : "skip"
    )
  );

  if (settings === undefined) return <Loading />;
  if (!allowed) {
    return (
      <>
        <Stack.Screen options={{ title: "Archive" }} />
        <EmptyState icon="archive-outline" title="The archive is for the valuation team" message="Ask a director if you need access." />
      </>
    );
  }
  const n = [f.suburb, f.purpose, f.from, f.to].filter(Boolean).length;

  return (
    <>
      <Stack.Screen options={{ title: "Archive" }} />
      <List
        data={rows}
        keyExtractor={(r) => r._id}
        onRefresh={onRefresh}
        refreshing={refreshing}
        header={
          <Row style={{ marginBottom: space.sm }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={f.q} onChangeText={(q) => setF({ ...f, q })} placeholder="Reference, client, address" />
            </View>
            <Button small variant={n ? "brand" : "secondary"} icon="options-outline" title={n ? `Filters (${n})` : "Filters"} onPress={() => setFiltering(true)} />
          </Row>
        }
        empty={<EmptyState icon="archive-outline" title="No issued valuations match" message="Issued reports appear here automatically." />}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/worth/jobs/${r._id}?tab=report` as Href)}>
            <Text style={{ fontSize: font.xs, fontWeight: "600", color: colors.muted }}>
              {r.reference}
              {r.version > 1 ? ` v${r.version}` : ""} · issued {formatDay(r.issuedDate)}
            </Text>
            <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
              {r.propertyAddress}
            </Text>
            <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>
              {r.suburb} · {r.clientName} · {PURPOSE_LABELS[r.purpose]}
            </Text>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{mainValue(r.values)}</Text>
              {r.signedBy ? <Text style={{ fontSize: font.xs, color: colors.muted }}>Signed by {r.signedBy}</Text> : null}
            </Row>
          </Card>
        )}
      />
      <Sheet
        open={filtering}
        onClose={() => setFiltering(false)}
        title="Filter archive"
        footer={
          <Pair>
            <Button variant="secondary" title="Clear" onPress={() => setF({ q: f.q, suburb: "", purpose: "", from: "", to: "" })} />
            <Button title="Done" onPress={() => setFiltering(false)} />
          </Pair>
        }
      >
        <Field label="Suburb" value={f.suburb} onChangeText={(suburb) => setF({ ...f, suburb })} />
        <Select label="Purpose" value={f.purpose} options={[{ value: "", label: "All" }, ...optionsOf(PURPOSE_LABELS)]} onChange={(purpose) => setF({ ...f, purpose })} />
        <DateField label="Issued from" value={f.from} onChange={(from) => setF({ ...f, from })} />
        <DateField label="Issued to" value={f.to} onChange={(to) => setF({ ...f, to })} />
      </Sheet>
    </>
  );
}
