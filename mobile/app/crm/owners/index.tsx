/**
 * Owners (port of /app/owners): the sellers and landlords whose property the
 * agency represents, the other side of the pipeline from Contacts.
 */
import { useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Button, Card, Chips, EmptyState, Fab, List, Row, SearchBar } from "../../../components/ui";
import { OwnerForm } from "../../../components/crm/records/owners/OwnerForm";
import { useDebounced, useLatest } from "../../../lib/crm/records/properties/hooks";
import { OWNER_TYPE_OPTIONS, ownerTypeLabel, type OwnerType } from "../../../lib/crm/records/contacts";
import { colors, font, space } from "../../../lib/theme";

const PAGE = 25;

export default function Owners() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<OwnerType | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounced(search.trim());

  const live = useQuery(api.owners.list, { q: q || undefined, ownerType: type === "all" ? undefined : type, pageSize: limit });
  const result = useLatest(live);
  const total = result?.totalCount ?? 0;
  const filtered = !!(q || type !== "all");

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Owners" }} />
      <List
        data={result?.items}
        keyExtractor={(o) => o._id}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (result?.hasMore) setLimit((l) => l + PAGE);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setLimit(PAGE);
              setTimeout(() => setRefreshing(false), 400);
            }}
          />
        }
        header={
          <View style={{ gap: space.md }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Name, phone, email, company" />
            <Chips<OwnerType | "all">
              value={type}
              onChange={(v) => {
                setType(v);
                setLimit(PAGE);
              }}
              options={[{ value: "all", label: "All types" }, ...OWNER_TYPE_OPTIONS]}
            />
            <Text style={{ color: colors.muted, fontSize: font.sm }}>{result ? `${total} owner${total === 1 ? "" : "s"}` : "Loading"}</Text>
          </View>
        }
        empty={
          <EmptyState
            icon="key-outline"
            title={filtered ? "No matching owners" : "No owners yet"}
            message={filtered ? "Try a different search or clear the type filter." : "Add the sellers and landlords you work with, or create one from a property's Owner tab."}
            action={!filtered ? <Button title="New owner" icon="add" onPress={() => setCreating(true)} /> : undefined}
          />
        }
        renderItem={({ item: o }) => (
          <Card onPress={() => router.push(`/crm/owners/${o._id}` as Href)}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                {o.name}
              </Text>
              <Badge label={ownerTypeLabel(o.ownerType)} tone="info" />
            </Row>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>
              {o.propertyCount} propert{o.propertyCount === 1 ? "y" : "ies"}
              {o.ownerNames.length ? ` · ${o.ownerNames.join(", ")}` : ""}
            </Text>
            {o.phone ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{o.phone}</Text> : null}
            {o.email ? <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>{o.email}</Text> : null}
            {o.alsoBuyerTenant && <Badge label="Also a buyer or tenant" />}
          </Card>
        )}
        ListFooterComponent={result?.hasMore ? <Text style={{ textAlign: "center", color: colors.faint, padding: space.md }}>Loading more</Text> : undefined}
      />
      <Fab label="New owner" onPress={() => setCreating(true)} />
      <OwnerForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/crm/owners/${id}` as Href)} />
    </View>
  );
}
