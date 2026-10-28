/** Portal home: balance and next due date for a tenant, collected, arrears and occupancy for a landlord. */
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Body, Button, Card, EmptyState, Ionicons, Loading, Notice, Screen, Stat, StatGrid, Title } from "../../components/ui";
import { moneyLines, usePortal } from "../../components/portal/common";
import { dateLabel, money } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

function TenantHome({ orgPhone, orgEmail }: { orgPhone: string | null; orgEmail: string | null }) {
  const router = useRouter();
  const leases = useQuery(api.portal.tenant.home);
  if (leases === undefined) return <Loading />;
  return (
    <Screen>
      <Title>Home</Title>
      {leases.length === 0 ? (
        <EmptyState icon="home-outline" title="No lease yet" message="Your lease will appear here once the agency has set it up." />
      ) : (
        leases.map((l) => {
          const credit = l.balance < 0;
          return (
            <Card key={l._id} style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>
                    {l.propertyTitle}, {l.unitLabel}
                  </Text>
                  {l.propertyLocation ? <Body small muted>{l.propertyLocation}</Body> : null}
                </View>
                {l.status !== "active" && <Badge label={l.status} />}
              </View>
              <View>
                <Body small muted>Current balance</Body>
                <Text style={{ fontSize: font.xxl, fontWeight: "700", color: credit ? colors.success : colors.text }}>
                  {credit ? `In credit ${money(Math.abs(l.balance), l.currency)}` : money(l.balance, l.currency)}
                </Text>
              </View>
              {l.overdue && <Notice tone="danger">Rent is overdue. Please pay as soon as you can.</Notice>}
              <View style={{ flexDirection: "row", gap: space.xl }}>
                <View>
                  <Body small muted>Rent</Body>
                  <Body>{money(l.rentAmount, l.currency)}</Body>
                </View>
                {l.nextDueDate ? (
                  <View>
                    <Body small muted>Next due</Body>
                    <Body>{dateLabel(l.nextDueDate)}</Body>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })
      )}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Payments" icon="receipt-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.navigate("/portal/payments")} />
        <Button title="Report a repair" icon="construct-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.navigate("/portal/maintenance")} />
      </View>
      {(orgPhone || orgEmail) && (
        <Card style={{ gap: space.xs }}>
          <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>Need help?</Text>
          {orgPhone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${orgPhone}`)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 }}>
              <Ionicons name="call-outline" size={18} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: font.md }}>{orgPhone}</Text>
            </Pressable>
          ) : null}
          {orgEmail ? (
            <Pressable onPress={() => Linking.openURL(`mailto:${orgEmail}`)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 }}>
              <Ionicons name="mail-outline" size={18} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: font.md }}>{orgEmail}</Text>
            </Pressable>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

function LandlordHome() {
  const h = useQuery(api.portal.landlord.home);
  if (h === undefined) return <Loading />;
  const hasArrears = Object.values(h.arrears).some((n) => n);
  return (
    <Screen>
      <Title>Home</Title>
      <StatGrid>
        <Stat label="Rent collected this month" value={moneyLines(h.collected) || money(0)} />
        <Stat label="Arrears" value={moneyLines(h.arrears) || money(0)} tone={hasArrears ? "danger" : undefined} />
        <Stat label="Occupancy" value={`${h.occupied} of ${h.units} units`} />
        <Stat label="Open repairs" value={String(h.openRepairs)} />
        <Stat label="Properties" value={String(h.properties)} />
      </StatGrid>
    </Screen>
  );
}

export default function PortalHome() {
  const portal = usePortal();
  if (portal === undefined) return <Loading />;
  if (!portal) return <EmptyState icon="lock-closed-outline" title="Not available" message="This page is not part of your portal." />;
  return portal.kind === "tenant" ? <TenantHome orgPhone={portal.orgPhone} orgEmail={portal.orgEmail} /> : <LandlordHome />;
}
