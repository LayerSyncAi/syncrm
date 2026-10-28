/**
 * Small charts for reports, drawn with plain Views so they read well on a
 * phone: horizontal grouped bars (the website's bar charts), a share bar with
 * legend (the website's pie charts) and a funnel.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Ionicons, Row } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";

export const PALETTE = [colors.primary, colors.info, colors.success, colors.danger, "#7c3aed", colors.warning, "#db2777", "#0891b2", "#65a30d", "#9333ea"];

export type Series = { key: string; name: string; color: string };

function Legend({ items }: { items: Array<{ name: string; color: string }> }) {
  return (
    <Row style={{ flexWrap: "wrap", gap: space.md }}>
      {items.map((s) => (
        <Row key={s.name} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color }} />
          <Text style={{ fontSize: font.xs, color: colors.muted }}>{s.name}</Text>
        </Row>
      ))}
    </Row>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={{ gap: space.md }}>
      <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{title}</Text>
      {children}
    </Card>
  );
}

function NoData() {
  return <Text style={{ color: colors.muted, fontSize: font.sm, textAlign: "center", paddingVertical: space.lg }}>No data for this period</Text>;
}

/** One row per item, one bar per series, scaled to the largest value. */
export function BarsCard({ title, data, bars, suffix = "" }: { title: string; data: Array<{ name: string } & Record<string, unknown>>; bars: Series[]; suffix?: string }) {
  const max = Math.max(1, ...data.flatMap((d) => bars.map((b) => Number(d[b.key]) || 0)));
  return (
    <ChartCard title={title}>
      {data.length === 0 ? (
        <NoData />
      ) : (
        <>
          {bars.length > 1 && <Legend items={bars} />}
          {data.map((d) => (
            <View key={d.name} style={{ gap: 3 }}>
              <Text style={{ fontSize: font.sm, color: colors.text, fontWeight: "500" }} numberOfLines={1}>
                {d.name}
              </Text>
              {bars.map((b) => {
                const v = Number(d[b.key]) || 0;
                return (
                  <Row key={b.key} gap={6}>
                    <View style={{ flex: 1, height: 10, backgroundColor: colors.surface, borderRadius: radius.sm, overflow: "hidden" }}>
                      <View style={{ width: `${(v / max) * 100}%`, height: "100%", backgroundColor: b.color, borderRadius: radius.sm }} />
                    </View>
                    <Text style={{ width: 52, textAlign: "right", fontSize: font.xs, color: colors.muted }}>
                      {v.toLocaleString("en-GB")}
                      {suffix}
                    </Text>
                  </Row>
                );
              })}
            </View>
          ))}
        </>
      )}
    </ChartCard>
  );
}

/** Shares of a whole: a stacked bar and a legend with counts and percentages. */
export function ShareCard({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title={title}>
      {rows.length === 0 ? (
        <NoData />
      ) : (
        <>
          <View style={{ flexDirection: "row", height: 14, borderRadius: radius.sm, overflow: "hidden" }}>
            {rows.map((d, i) => (
              <View key={d.name} style={{ flex: d.value, backgroundColor: PALETTE[i % PALETTE.length] }} />
            ))}
          </View>
          {rows.map((d, i) => (
            <Row key={d.name} style={{ justifyContent: "space-between" }}>
              <Row gap={6} style={{ flex: 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: PALETTE[i % PALETTE.length] }} />
                <Text style={{ fontSize: font.sm, color: colors.text, flex: 1 }} numberOfLines={1}>
                  {d.name}
                </Text>
              </Row>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>
                {d.value} ({Math.round((d.value / total) * 100)}%)
              </Text>
            </Row>
          ))}
        </>
      )}
    </ChartCard>
  );
}

/** Stages narrowing from top to bottom, with the share of the first stage. */
export function FunnelCard({ title, steps }: { title: string; steps: Array<{ name: string; value: number }> }) {
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ChartCard title={title}>
      {steps.map((s, i) => (
        <View key={s.name} style={{ alignItems: "center", gap: 2 }}>
          <View style={{ width: `${Math.max(12, (s.value / top) * 100)}%`, backgroundColor: PALETTE[i % PALETTE.length], borderRadius: radius.sm, paddingVertical: 6, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: font.sm }}>{s.value.toLocaleString("en-GB")}</Text>
          </View>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>
            {s.name}
            {i > 0 ? ` · ${Math.round((s.value / top) * 100)}%` : ""}
          </Text>
        </View>
      ))}
    </ChartCard>
  );
}

/** Section heading with the Excel export button. */
export function SectionHead({ title, onExport }: { title: string; onExport: () => void }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{title}</Text>
      <Pressable onPress={onExport} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: space.xs }} accessibilityLabel="Export to Excel">
        <Ionicons name="download-outline" size={16} color={colors.brand} />
        <Text style={{ color: colors.brand, fontWeight: "600", fontSize: font.sm }}>Excel</Text>
      </Pressable>
    </Row>
  );
}

/** A record card with label and value pairs, two per row. */
export function MetricCard({ title, items, right }: { title: string; items: Array<[string, ReactNode]>; right?: ReactNode }) {
  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text, flex: 1 }} numberOfLines={2}>
          {title}
        </Text>
        {right}
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 4, columnGap: space.lg }}>
        {items.map(([k, v]) => (
          <View key={k} style={{ flexBasis: "45%", flexGrow: 1, flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text style={{ fontSize: font.xs, color: colors.muted }}>{k}</Text>
            {typeof v === "string" || typeof v === "number" ? <Text style={{ fontSize: font.xs, color: colors.text, fontWeight: "600", textAlign: "right", flexShrink: 1 }}>{v}</Text> : v}
          </View>
        ))}
      </View>
    </Card>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: font.xs, color: colors.faint, lineHeight: 16 }}>{children}</Text>;
}
