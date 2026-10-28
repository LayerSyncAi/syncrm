/**
 * Segmentation (port of /app/contacts/segments): find contacts by stored
 * preferences and, optionally, the interests on their past leads.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Button, Card, EmptyState, Field, List, Row, Select, Sheet, Toggle } from "../../../components/ui";
import { AreaSheet } from "../../../components/crm/records/contacts/AreaPicker";
import { useDebounced, useLatest } from "../../../lib/crm/records/properties/hooks";
import { PROPERTY_TYPE_OPTIONS, amountOrUndefined, intOrUndefined, interestLabel, type InterestType, type PropertyType } from "../../../lib/crm/records/contacts";
import { colors, font, space } from "../../../lib/theme";

const PAGE = 25;

type Filters = { interest: InterestType | ""; type: PropertyType | ""; area: string; budgetMin: string; budgetMax: string; beds: string; historical: boolean };
const NONE: Filters = { interest: "", type: "", area: "", budgetMin: "", budgetMax: "", beds: "", historical: true };

export default function ContactSegments() {
  const router = useRouter();
  const [f, setF] = useState<Filters>(NONE);
  const [open, setOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const typed = {
    budgetMin: useDebounced(f.budgetMin),
    budgetMax: useDebounced(f.budgetMax),
    beds: useDebounced(f.beds),
  };

  const set = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
  };

  const live = useQuery(api.contacts.segmentedList, {
    includeHistorical: f.historical,
    interestType: f.interest || undefined,
    propertyType: f.type || undefined,
    area: f.area || undefined,
    budgetMin: amountOrUndefined(typed.budgetMin) || undefined,
    budgetMax: amountOrUndefined(typed.budgetMax) || undefined,
    minBedrooms: intOrUndefined(typed.beds) || undefined,
    pageSize: limit,
  });
  const result = useLatest(live);
  const total = result?.totalCount ?? 0;
  const active = [f.interest, f.type, f.area, f.budgetMin, f.budgetMax, f.beds].filter(Boolean).length + (f.historical ? 0 : 1);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Segmentation" }} />
      <List
        data={result?.items}
        keyExtractor={(c) => c._id}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (result?.hasMore) setLimit((l) => l + PAGE);
        }}
        header={
          <View style={{ gap: space.md }}>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>Target contacts by their preferences and past lead interests, for campaigns and property matching.</Text>
            <Row>
              <Button small variant="secondary" icon="options-outline" title={active ? `Filters (${active})` : "Filters"} onPress={() => setOpen(true)} />
              {active > 0 && <Button small variant="ghost" title="Clear" onPress={() => set(NONE)} />}
            </Row>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>
              {result ? `${total} contact${total === 1 ? "" : "s"} match` : "Loading"}
            </Text>
          </View>
        }
        empty={<EmptyState icon="options-outline" title="No contacts match these filters" />}
        renderItem={({ item: c }) => (
          <Card onPress={() => router.push(`/crm/contacts/${c._id}` as Href)}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                {c.name}
              </Text>
              {c.interestType ? <Badge label={interestLabel(c.interestType)} tone="info" /> : null}
            </Row>
            {c.phone ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{c.phone}</Text> : null}
            {c.email ? <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>{c.email}</Text> : null}
            {c.preferredAreas?.length ? (
              <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
                {c.preferredAreas.slice(0, 4).map((a) => (
                  <Badge key={a} label={a} />
                ))}
                {c.preferredAreas.length > 4 && <Badge label={`+${c.preferredAreas.length - 4}`} />}
              </Row>
            ) : null}
            {f.historical && (
              <Text style={{ fontSize: font.xs, color: colors.faint }}>
                {c.historicalInterests
                  ? `Past leads: ${[...c.historicalInterests.interestTypes.map(interestLabel), ...c.historicalInterests.areas.slice(0, 3)].filter(Boolean).join(", ") || "no details"}`
                  : "No lead history"}
              </Text>
            )}
            {c.ownerNames.length > 0 && <Text style={{ fontSize: font.xs, color: colors.faint }}>Agents: {c.ownerNames.join(", ")}</Text>}
          </Card>
        )}
        ListFooterComponent={result?.hasMore ? <Text style={{ textAlign: "center", color: colors.faint, padding: space.md }}>Loading more</Text> : undefined}
      />

      <Sheet open={open} onClose={() => setOpen(false)} title="Filters" footer={<Button title="Show contacts" onPress={() => setOpen(false)} />}>
        <Select<InterestType | "any">
          label="Interest"
          value={f.interest || "any"}
          onChange={(v) => set({ interest: v === "any" ? "" : v })}
          options={[
            { value: "any", label: "Any" },
            { value: "rent", label: "Rent" },
            { value: "buy", label: "Buy" },
          ]}
        />
        <Select<PropertyType | "any">
          label="Property type"
          value={f.type || "any"}
          onChange={(v) => set({ type: v === "any" ? "" : v })}
          options={[{ value: "any", label: "Any" }, ...PROPERTY_TYPE_OPTIONS]}
        />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Area</Text>
          <Row>
            <Button small variant="secondary" icon="location-outline" title={f.area || "Any area"} onPress={() => setAreaOpen(true)} style={{ flex: 1 }} />
            {f.area ? <Button small variant="ghost" title="Clear" onPress={() => set({ area: "" })} /> : null}
          </Row>
        </View>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Budget min" value={f.budgetMin} onChangeText={(v) => set({ budgetMin: v })} keyboardType="decimal-pad" placeholder="Any" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Budget max" value={f.budgetMax} onChangeText={(v) => set({ budgetMax: v })} keyboardType="decimal-pad" placeholder="Any" />
          </View>
        </Row>
        <Field label="Min bedrooms" value={f.beds} onChangeText={(v) => set({ beds: v })} keyboardType="number-pad" placeholder="Any" />
        <Toggle label="Include past lead interests" value={f.historical} onChange={(v) => set({ historical: v })} />
        <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} onPick={(a) => set({ area: a })} />
      </Sheet>
    </View>
  );
}
