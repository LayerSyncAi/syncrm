/** A development's stands as a grid coloured by status. Tap a stand to reserve, sell or see the buyer. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Chips, EmptyState, Loading, Row, Screen } from "../../../components/ui";
import { STATUS, StockBar, type StandStatus } from "../../../components/dev/stand-status";
import { StandSheet } from "../../../components/dev/stand-sheet";
import { useRefresh } from "../../../lib/stay/hooks";
import { colors, font, radius, space } from "../../../lib/theme";

type Filter = "all" | StandStatus;

const TILE = 64;
const GAP = space.sm;

export default function Development() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useQuery(api.dev.inventory.list, { developmentId: id as Id<"finDevelopments"> });
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Id<"devStands"> | null>(null);
  const [width, setWidth] = useState(0);
  const { refreshing, onRefresh } = useRefresh();

  if (data === undefined) return <Loading />;

  const { development: dev, role, stands } = data;
  const counts = { available: 0, reserved: 0, sold: 0 };
  for (const s of stands) counts[s.status]++;
  const shown = filter === "all" ? stands : stands.filter((s) => s.status === filter);
  const stand = selected ? stands.find((s) => s._id === selected) ?? null : null;

  // As many tiles as fit across, at least four, filling the row exactly.
  const cols = width ? Math.max(4, Math.floor((width + GAP) / (TILE + GAP))) : 5;
  const tileW = width ? (width - GAP * (cols - 1)) / cols : TILE;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: dev.name }} />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <View style={{ gap: space.sm }}>
          {!!dev.location && <Body muted>{dev.location}</Body>}
          <StockBar sold={counts.sold} reserved={counts.reserved} available={counts.available} />
          <Body small muted>
            {counts.available} available, {counts.reserved} reserved, {counts.sold} sold. Prices in {dev.currency}.
          </Body>
        </View>

        <Chips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${stands.length}` },
            { value: "available", label: `Available ${counts.available}` },
            { value: "reserved", label: `Reserved ${counts.reserved}` },
            { value: "sold", label: `Sold ${counts.sold}` },
          ]}
        />

        {stands.length === 0 ? (
          <EmptyState icon="grid-outline" title="No stands yet" message="Stands are added to a development on the website." />
        ) : shown.length === 0 ? (
          <EmptyState icon="grid-outline" title={`No ${filter} stands`} />
        ) : (
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
            {shown.map((s) => {
              const st = STATUS[s.status];
              const overdue = s.status === "sold" && !!s.sale && s.sale.overdue > 0;
              return (
                <Pressable
                  key={s._id}
                  onPress={() => setSelected(s._id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Stand ${s.number}, ${st.label}${overdue ? ", overdue" : ""}`}
                  style={({ pressed }) => ({
                    width: tileW,
                    height: 56,
                    borderRadius: radius.md,
                    borderWidth: overdue ? 2 : 1,
                    borderColor: overdue ? colors.danger : st.border,
                    backgroundColor: st.bg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 2,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: font.md, fontWeight: "700", color: st.fg }}>
                    {s.number}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: st.fg, opacity: 0.85 }}>
                    {overdue ? "Overdue" : st.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Row gap={space.md} style={{ flexWrap: "wrap" }}>
          {(["available", "reserved", "sold"] as const).map((k) => (
            <Row key={k} gap={6}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: k === "available" ? STATUS.available.fg : k === "reserved" ? STATUS.reserved.fg : STATUS.sold.bg }} />
              <Body small muted>{STATUS[k].label}</Body>
            </Row>
          ))}
          <Row gap={6}>
            <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 2, borderColor: colors.danger }} />
            <Body small muted>Buyer overdue</Body>
          </Row>
        </Row>
      </Screen>
      <StandSheet stand={stand} currency={dev.currency} canManage={role.canManage} financeOn={role.financeOn} today={data?.today} onClose={() => setSelected(null)} />
    </View>
  );
}
