/** Landlord properties: units and current tenants (name and lease dates only). */
import { Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Body, Card, EmptyState, Loading, Screen, Title } from "../../components/ui";
import { KindGuard } from "../../components/portal/common";
import { dateLabel } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

function Inner() {
  const props = useQuery(api.portal.landlord.properties);
  if (props === undefined) return <Loading />;
  return (
    <Screen>
      <Title>Properties</Title>
      {props.length === 0 ? (
        <EmptyState icon="business-outline" title="No properties yet" message="Your properties will appear here." />
      ) : (
        props.map((p) => (
          <Card key={p._id} style={{ gap: space.sm }}>
            <View>
              <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{p.title}</Text>
              {p.location ? <Body small muted>{p.location}</Body> : null}
            </View>
            {p.units.length === 0 && <Body muted>No units.</Body>}
            {p.units.map((u) => (
              <View key={u._id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{u.label}</Text>
                  {u.tenantName ? (
                    <Body small muted>
                      {u.tenantName}
                      {u.leaseStart ? `. ${dateLabel(u.leaseStart)}` : ""}
                      {u.leaseEnd ? ` to ${dateLabel(u.leaseEnd)}` : ""}
                    </Body>
                  ) : (
                    <Body small muted>No current tenant</Body>
                  )}
                </View>
                <Badge label={u.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} tone={u.status === "vacant" ? "warning" : "success"} />
              </View>
            ))}
          </Card>
        ))
      )}
    </Screen>
  );
}

export default function PortalProperties() {
  return (
    <KindGuard kind="landlord">
      <Inner />
    </KindGuard>
  );
}
