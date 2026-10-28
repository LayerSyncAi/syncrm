/** Everyone on a lease you manage, with what they owe. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Card, Chips, EmptyState, Fab, List, Row, SearchBar } from "../../../components/ui";
import { useDebounced, useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { formatTotals, type CurrencyTotals } from "@/lib/stay/format";

type Status = "current" | "past" | "all";
const hasAmount = (t: CurrencyTotals) => Object.values(t).some((n) => (n ?? 0) > 0);

export default function StayTenants() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [status, setStatus] = useState<Status>("current");
  const tenants = useQuery(api.stay.people.listTenants, { q: q || undefined, status });
  const { refreshing, onRefresh } = useRefresh();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Tenants" }} />
      <List
        data={tenants}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Name, phone, email, unit" />
            <Chips<Status>
              value={status}
              onChange={setStatus}
              options={[
                { value: "current", label: "Current" },
                { value: "past", label: "Past" },
                { value: "all", label: "All" },
              ]}
            />
            {tenants && (
              <Body small muted>
                {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
              </Body>
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="people-outline"
            title={q ? "No matching tenants" : "No tenants yet"}
            message={q ? "Try a different search." : "A tenant is added when you create their lease."}
          />
        }
        keyExtractor={(t) => t._id}
        renderItem={({ item: t }) => (
          <Card onPress={() => router.push(`/stay/tenants/${t._id}` as Href)}>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{t.name}</Text>
                <Body small muted numberOfLines={2}>
                  {t.units.join("; ") || "No active lease"}
                </Body>
                {t.phone ? (
                  <Body small muted>
                    {t.phone}
                  </Body>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {hasAmount(t.overdue) ? (
                  <>
                    <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.danger }}>{formatTotals(t.overdue)}</Text>
                    <Body small muted>
                      overdue
                    </Body>
                  </>
                ) : hasAmount(t.owed) ? (
                  <>
                    <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{formatTotals(t.owed)}</Text>
                    <Body small muted>
                      balance
                    </Body>
                  </>
                ) : hasAmount(t.credit) ? (
                  <Text style={{ fontSize: font.sm, color: colors.success }}>Credit {formatTotals(t.credit)}</Text>
                ) : (
                  <Body small muted>
                    Up to date
                  </Body>
                )}
              </View>
            </Row>
          </Card>
        )}
      />
      <Fab label="New lease" onPress={() => router.push("/stay/leases/new")} />
    </View>
  );
}
