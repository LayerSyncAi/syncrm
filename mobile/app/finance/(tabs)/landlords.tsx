/** Every landlord the person may see, with what the agency holds for them. */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, EmptyState, List, ListItem, SearchBar } from "../../../components/ui";
import { useRefresh } from "../../../lib/stay/hooks";
import { space } from "../../../lib/theme";
import { money } from "@/lib/finance/format";

export default function FinanceLandlords() {
  const router = useRouter();
  const rows = useQuery(api.finance.trust.landlords);
  const [search, setSearch] = useState("");
  const { refreshing, onRefresh } = useRefresh();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows && q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  return (
    <View style={{ flex: 1 }}>
      <List
        data={shown}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Landlord name" />
            <Body muted small>
              Balance held for each landlord. Tap one for the month statement.
            </Body>
          </View>
        }
        empty={<EmptyState icon="people-outline" title={search ? "No landlord matches" : "No landlords yet"} message={search ? undefined : "Landlords appear once properties are under management in Sync Stay."} />}
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => {
          const held = [r.USD ? money(r.USD, "USD") : "", r.ZiG ? money(r.ZiG, "ZiG") : ""].filter(Boolean);
          return (
            <ListItem
              title={r.name}
              subtitle={held.length ? held.join("\n") : "Nothing held"}
              meta={`${r.properties} propert${r.properties === 1 ? "y" : "ies"}${r.email ? "" : ", no email address"}`}
              onPress={() => router.push(`/finance/landlords/${r._id}` as Href)}
            />
          );
        }}
      />
    </View>
  );
}
