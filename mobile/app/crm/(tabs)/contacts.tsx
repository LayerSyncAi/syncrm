/**
 * Contacts (port of /app/contacts): the people the agency works with, apart
 * from property-specific leads. Search, role and agent filters, a growing
 * list, and a new-contact sheet that warns about duplicates.
 */
import { useEffect, useState } from "react";
import { Linking, RefreshControl, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Card, Chips, EmptyState, Fab, List, Row, SearchBar, Select } from "../../../components/ui";
import { ContactForm } from "../../../components/crm/records/contacts/ContactForm";
import { useDebounced, useLatest } from "../../../lib/crm/records/properties/hooks";
import { ROLE_OPTIONS, type RoleFilter } from "../../../lib/crm/records/contacts";
import { useSession } from "../../../lib/session";
import { colors, font, space } from "../../../lib/theme";

const PAGE = 25;

export default function Contacts() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("buyer_tenant");
  const [agent, setAgent] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const q = useDebounced(search.trim());
  const users = useQuery(api.users.listForAssignment, isAdmin ? {} : "skip");
  const live = useQuery(api.contacts.list, {
    q: q || undefined,
    role,
    ownerUserId: (agent || undefined) as Id<"users"> | undefined,
    pageSize: limit,
  });
  const result = useLatest(live);

  // Keep the agency's area suggestions seeded and topped up, as the website does.
  const locations = useQuery(api.locations.list);
  const seed = useMutation(api.locations.seedDefaultsIfEmpty);
  const sync = useMutation(api.locations.syncDefaults);
  const hasLocations = locations !== undefined;
  useEffect(() => {
    if (!hasLocations) return;
    (locations.length === 0 ? seed() : sync()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocations]);

  const filtered = !!(q || agent || role !== "buyer_tenant");
  const total = result?.totalCount ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <List
        data={result?.items}
        keyExtractor={(c) => c._id}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (result?.hasMore) setLimit((l) => l + PAGE);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // The list is live; this only resets paging.
              setRefreshing(true);
              setLimit(PAGE);
              setTimeout(() => setRefreshing(false), 400);
            }}
          />
        }
        header={
          <View style={{ gap: space.md }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Name, phone, email, company" />
            <Chips<RoleFilter>
              value={role}
              onChange={(v) => {
                setRole(v);
                setLimit(PAGE);
              }}
              options={ROLE_OPTIONS}
            />
            {isAdmin && (
              <Select
                label="Assigned agent"
                value={agent}
                onChange={(v) => {
                  setAgent(v);
                  setLimit(PAGE);
                }}
                options={[{ value: "", label: "All agents" }, ...(users ?? []).map((u) => ({ value: u._id as string, label: u.name }))]}
              />
            )}
            <Text style={{ color: colors.muted, fontSize: font.sm }}>{result ? `${total} contact${total === 1 ? "" : "s"}` : "Loading"}</Text>
          </View>
        }
        empty={
          <EmptyState
            icon="people-outline"
            title={filtered ? "No contacts match your filters" : "No contacts yet"}
            message={filtered ? undefined : "Add the people you work with to match them to properties."}
          />
        }
        renderItem={({ item: c }) => (
          <Card onPress={() => router.push(`/crm/contacts/${c._id}` as Href)}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.company ? <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>{c.company}</Text> : null}
                {c.phone ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{c.phone}</Text> : null}
                {c.email ? <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>{c.email}</Text> : null}
              </View>
              <Row gap={space.xs}>
                {c.phone ? <Button small variant="secondary" icon="call-outline" title="" onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
                {c.email ? <Button small variant="secondary" icon="mail-outline" title="" onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
              </Row>
            </Row>
            <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
              {c.ownerType ? <Badge label="Owner" tone="info" /> : null}
              {c.ownerNames.slice(0, 2).map((n, i) => (
                <Badge key={i} label={n} />
              ))}
              {c.ownerNames.length > 2 && <Badge label={`+${c.ownerNames.length - 2}`} />}
            </Row>
          </Card>
        )}
        ListFooterComponent={result?.hasMore ? <Text style={{ textAlign: "center", color: colors.faint, padding: space.md }}>Loading more</Text> : undefined}
      />
      <Fab label="New contact" onPress={() => setCreating(true)} />
      <ContactForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/crm/contacts/${id}` as Href)} />
    </View>
  );
}
