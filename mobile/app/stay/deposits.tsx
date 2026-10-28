/** Deposits held against leases, apart from rent. Applied or refunded at move-out from the lease. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Body, Button, Card, Chips, EmptyState, List, Row, Section, Stat, StatGrid, type BadgeTone } from "../../components/ui";
import { useRefresh } from "../../lib/stay/hooks";
import { colors, font, space } from "../../lib/theme";
import { HELD_IN_OPTIONS, formatTotals, heldInLabel, money, type CurrencyTotals } from "@/lib/stay/format";

type Status = "held" | "pending" | "settled" | "all";
const STATUS_LABEL: Record<string, string> = { held: "Held", pending: "Not yet received", settled: "Settled" };
const STATUS_TONE: Record<string, BadgeTone> = { held: "success", pending: "warning", settled: "neutral" };

function Totals({ title, rows }: { title: string; rows: Array<{ name: string; sub: string; totals: CurrencyTotals }> }) {
  return (
    <Section title={title}>
      <Card>
        {rows.map((r, i) => (
          <Row
            key={r.name}
            style={{ alignItems: "flex-start", justifyContent: "space-between", borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, paddingTop: i ? space.sm : 0 }}
          >
            <View style={{ flex: 1 }}>
              <Body small style={{ fontWeight: "600" }}>
                {r.name}
              </Body>
              <Body small muted>
                {r.sub}
              </Body>
            </View>
            <Body small style={{ fontWeight: "600" }}>
              {formatTotals(r.totals)}
            </Body>
          </Row>
        ))}
      </Card>
    </Section>
  );
}

export default function StayDeposits() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("held");
  const [showTotals, setShowTotals] = useState(false);
  const data = useQuery(api.stay.deposits.list, { status });
  const { refreshing, onRefresh } = useRefresh();
  const plural = (n: number) => `${n} deposit${n === 1 ? "" : "s"}`;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Deposits" }} />
      <List
        data={data?.rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Body small muted>
              Deposits are held against the lease, apart from rent. Apply or refund them at move-out from the lease.
            </Body>
            <StatGrid>
              <Stat label="Total held" value={data ? formatTotals(data.total) : "..."} tone="good" />
              {HELD_IN_OPTIONS.map((h) => (
                <Stat key={h.value} label={h.label} value={data ? formatTotals(data.byHeldIn[h.value] ?? {}) : "..."} />
              ))}
            </StatGrid>
            <Chips<Status>
              value={status}
              onChange={setStatus}
              options={[
                { value: "held", label: "Held" },
                { value: "pending", label: "Not yet received" },
                { value: "settled", label: "Settled" },
                { value: "all", label: "All" },
              ]}
            />
            {data && (data.byProperty.length > 0 || data.byLandlord.length > 0) && (
              <Button
                small
                variant="ghost"
                title={showTotals ? "Hide totals by property and landlord" : "Show totals by property and landlord"}
                onPress={() => setShowTotals((s) => !s)}
              />
            )}
            {data && showTotals && (
              <>
                <Totals title="Held by property" rows={data.byProperty.map((p) => ({ name: p.name, sub: `${p.landlordName}, ${plural(p.count)}`, totals: p.totals }))} />
                <Totals title="Held by landlord" rows={data.byLandlord.map((l) => ({ name: l.name, sub: plural(l.count), totals: l.totals }))} />
              </>
            )}
            {data && (
              <Body small muted>
                {plural(data.rows.length)}
              </Body>
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="wallet-outline"
            title={status === "held" ? "No deposits held" : "No deposits"}
            message="A deposit is set on the lease and receipted with Record payment."
          />
        }
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/stay/leases/${r.leaseId}` as Href)}>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{r.tenantName}</Text>
                <Body small muted numberOfLines={1}>
                  {r.propertyName}, {r.unitLabel}
                </Body>
                <Body small muted>
                  {r.landlordName} · {heldInLabel(r.heldIn)}
                </Body>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{money(r.held, r.currency)}</Text>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"} label={STATUS_LABEL[r.status] ?? r.status} />
                {r.leaseStatus === "ended" && <Badge label="Lease ended" />}
              </View>
            </Row>
            <Body small muted>
              Expected {money(r.expected, r.currency)}, received {money(r.received, r.currency)}
              {r.applied ? `, applied ${money(r.applied, r.currency)}` : ""}
              {r.refunded ? `, refunded ${money(r.refunded, r.currency)}` : ""}
            </Body>
            {r.received < r.expected && r.status !== "settled" && (
              <Button small variant="brand" icon="receipt-outline" title="Record deposit" onPress={() => router.push(`/stay/payments/record?leaseId=${r.leaseId}` as Href)} />
            )}
          </Card>
        )}
      />
    </View>
  );
}
