/** Buildings managed for landlords, with their units and the agreed fee. */
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Button, Card, EmptyState, Fab, List, Row, SearchBar } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useDebounced, useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { formatTotals } from "@/lib/stay/format";

export default function StayProperties() {
  const router = useRouter();
  const { hub } = useSession();
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const rows = useQuery(api.stay.properties.list, { q: q || undefined });
  const { refreshing, onRefresh } = useRefresh();

  return (
    <View style={{ flex: 1 }}>
      <List
        data={rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Name, address, landlord or manager" />
            {hub?.isAdmin && <Button small variant="secondary" icon="cloud-upload-outline" title="Import from a spreadsheet" onPress={() => router.push("/stay/import")} />}
          </View>
        }
        empty={
          <EmptyState
            icon="business-outline"
            title={q ? "No matching properties" : "No properties yet"}
            message={q ? "Try a different search." : "Add the first property you manage, or import your existing list."}
          />
        }
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/stay/properties/${r._id}` as Href)}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{r.name}</Text>
                <Body small muted numberOfLines={1}>
                  {r.address}
                </Body>
              </View>
              <Body small muted>
                {r.managementFeePct}%
              </Body>
            </Row>
            <Body small>
              {r.units} unit{r.units === 1 ? "" : "s"}
              <Text style={{ color: colors.muted }}>
                {" "}
                ({r.occupied} let{r.vacant ? `, ${r.vacant} vacant` : ""}
                {r.notice ? `, ${r.notice} on notice` : ""})
              </Text>
            </Body>
            <Body small muted>
              {r.landlordName}
              {r.managerName ? ` · ${r.managerName}` : ""}
            </Body>
            <Body small>{formatTotals(r.rentRoll)} a month</Body>
          </Card>
        )}
      />
      <Fab label="Add property" onPress={() => router.push("/stay/properties/new")} />
    </View>
  );
}
