/** Sync Dev home: stands available, reserved and sold, what buyers owe, and every development. */
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Card, EmptyState, Loading, Row, Screen, Section, Stat, StatGrid } from "../../../components/ui";
import { StockBar } from "../../../components/dev/stand-status";
import { useRefresh } from "../../../lib/stay/hooks";
import { colors, font } from "../../../lib/theme";
import { money } from "@/lib/finance/format";

export default function DevHome() {
  const router = useRouter();
  const summary = useQuery(api.dev.dashboard.summary);
  const devs = useQuery(api.dev.sales.listDevelopments);
  const { refreshing, onRefresh } = useRefresh();
  const go = (href: string) => router.push(href as Href);

  if (summary === undefined || devs === undefined) return <Loading />;
  const anyOverdue = summary.overdueBuyers > 0;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <StatGrid>
        <Stat label="Available" value={String(summary.available)} tone="good" />
        <Stat label="Reserved" value={String(summary.reserved)} tone={summary.reserved ? "warning" : undefined} />
        <Stat label="Sold" value={String(summary.sold)} />
        <Stat label="Owed by buyers" value={summary.outstanding} onPress={() => go("/dev/buyers")} />
        <Stat
          label="Overdue"
          value={summary.overdue}
          tone={anyOverdue ? "danger" : "good"}
          hint={anyOverdue ? `${summary.overdueBuyers} buyer${summary.overdueBuyers === 1 ? "" : "s"}` : "Everyone is up to date"}
          onPress={() => go("/dev/buyers")}
        />
        <Stat label="Collected" value={summary.collected} tone="good" />
      </StatGrid>

      <Section title="Developments">
        {devs.length === 0 ? (
          <EmptyState icon="map-outline" title="No developments yet" message="Developments and their stands are set up on the website." />
        ) : (
          devs.map((d) => (
            <Card key={d._id} onPress={() => go(`/dev/developments/${d._id}`)} style={!d.isActive ? { opacity: 0.6 } : undefined}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{d.name}</Text>
                  {!!d.location && (
                    <Body small muted numberOfLines={1}>
                      {d.location}
                    </Body>
                  )}
                </View>
                {!d.isActive ? <Badge label="Closed" /> : d.overdue > 0 ? <Badge tone="danger" label={`${money(d.overdue, d.currency)} overdue`} /> : null}
              </Row>
              <StockBar sold={d.sold} reserved={d.reserved} available={d.available} />
              <Body small muted>
                {d.available} available, {d.reserved} reserved, {d.sold} sold
              </Body>
              {d.sold > 0 && (
                <Body small muted>
                  Collected {money(d.collected, d.currency)}, owed {money(d.outstanding, d.currency)}
                </Body>
              )}
            </Card>
          ))
        )}
      </Section>

      {!summary.role.financeOn && <Body small muted>Payments are recorded in Sync Dev. Sync Finance adds trust accounting and commission.</Body>}
    </Screen>
  );
}
