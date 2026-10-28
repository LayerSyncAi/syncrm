/**
 * Properties (port of /app/properties): search, status chips, the full filter
 * set in a sheet, and a growing list. Long-press up to four to compare.
 */
import { useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Button, Chips, EmptyState, Fab, List, Row, SearchBar } from "../../../components/ui";
import { PropertyCard, type PropertyRow } from "../../../components/crm/records/properties/PropertyCard";
import { FiltersSheet, NO_FILTERS, activeCount, type PropertyFilters } from "../../../components/crm/records/properties/FiltersSheet";
import { CompareSheet } from "../../../components/crm/records/properties/CompareSheet";
import { STATUS_OPTIONS, type PropertyStatus } from "../../../lib/crm/records/properties/labels";
import { useDebounced, useLatest } from "../../../lib/crm/records/properties/hooks";
import { parseAmount } from "../../../lib/format";
import { useSession } from "../../../lib/session";
import { colors, font, space } from "../../../lib/theme";

const PAGE = 25;

export default function Properties() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [filters, setFilters] = useState<PropertyFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const q = useDebounced(search.trim());
  const location = useDebounced(filters.location.trim());
  const priceMin = parseAmount(filters.priceMin);

  const live = useQuery(api.properties.list, {
    q: q || undefined,
    status: status === "all" ? undefined : status,
    listingType: filters.listingType || undefined,
    type: filters.type || undefined,
    location: location || undefined,
    priceMin: priceMin && priceMin > 0 ? priceMin : undefined,
    ownerUserId: filters.ownerUserId || undefined,
    sortBy: filters.sortBy || undefined,
    pageSize: limit,
  });
  const result = useLatest(live);
  const items = (result?.items ?? []) as unknown as Array<PropertyRow & { commercialType?: string; zoning?: string; usageType?: string }>;
  const filtered = !!(q || status !== "all" || activeCount(filters));

  const compared = useMemo(() => items.filter((p) => compare.includes(p._id)), [items, compare]);
  const toggleCompare = (id: string) =>
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev));

  const count = activeCount(filters);

  return (
    <View style={{ flex: 1 }}>
      <List
        data={result === undefined ? undefined : items}
        keyExtractor={(p) => p._id}
        renderItem={({ item }) => (
          <PropertyCard
            p={item}
            selected={compare.includes(item._id)}
            onPress={() => (compare.length ? toggleCompare(item._id) : router.push(`/crm/properties/${item._id}` as Href))}
            onLongPress={() => toggleCompare(item._id)}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (result?.hasMore) setLimit((l) => l + PAGE);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // Convex keeps the list live; this only resets paging.
              setRefreshing(true);
              setLimit(PAGE);
              setTimeout(() => setRefreshing(false), 400);
            }}
          />
        }
        header={
          <View style={{ gap: space.md }}>
            <Row>
              <View style={{ flex: 1 }}>
                <SearchBar value={search} onChangeText={setSearch} placeholder="Search by title" />
              </View>
              <Button small variant="secondary" icon="options-outline" title={count ? `Filters (${count})` : "Filters"} onPress={() => setFiltersOpen(true)} />
            </Row>
            <Chips
              options={[{ value: "all" as const, label: "All" }, ...STATUS_OPTIONS]}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setLimit(PAGE);
              }}
            />
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: font.sm }}>
                {result ? `${result.totalCount} ${result.totalCount === 1 ? "property" : "properties"}` : "Loading"}
              </Text>
              {isAdmin && <Button small variant="ghost" icon="download-outline" title="Discover new" onPress={() => router.push("/crm/properties/import")} />}
            </Row>
            {compare.length > 0 && (
              <Row style={{ justifyContent: "space-between", backgroundColor: colors.brandLight, padding: space.sm, borderRadius: 10 }}>
                <Badge label={`${compare.length} selected to compare`} tone="success" />
                <Row>
                  <Button small variant="ghost" title="Clear" onPress={() => setCompare([])} />
                  <Button small variant="brand" title="Compare" disabled={compare.length < 2} onPress={() => setCompareOpen(true)} />
                </Row>
              </Row>
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="business-outline"
            title={filtered ? "No properties match your filters" : "No properties yet"}
            message={filtered ? undefined : "Add your first listing to start matching leads."}
          />
        }
        ListFooterComponent={result?.hasMore ? <Text style={{ textAlign: "center", color: colors.faint, padding: space.md }}>Loading more</Text> : undefined}
      />
      <Fab label="New property" onPress={() => router.push("/crm/properties/new")} />
      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={(f) => {
          setFilters(f);
          setLimit(PAGE);
        }}
      />
      <CompareSheet
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        items={compared}
        onRemove={(id) => {
          const next = compare.filter((x) => x !== id);
          setCompare(next);
          if (next.length < 2) setCompareOpen(false);
        }}
      />
    </View>
  );
}
