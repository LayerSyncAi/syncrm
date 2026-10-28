import { useMemo, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, Chips, EmptyState, Fab, List, Notice, Select } from "../../../components/ui";
import { MaintenanceRow } from "../../../components/stay/ops/maintenance-list";
import { useQuickRefresh } from "../../../lib/stay-ops/photos";
import { colors, space } from "../../../lib/theme";
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from "@/lib/stay-ops/labels";
import { RefreshControl } from "react-native";

type StatusFilter = MaintenanceStatus | "all";

/** Repair requests across the properties the user can see. Optional ?unitId= narrows to one unit. */
export default function MaintenanceList() {
  const router = useRouter();
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [propertyId, setPropertyId] = useState("");
  const { refreshing, onRefresh } = useQuickRefresh();

  const units = useQuery(api.stay.maintenance.unitOptions);
  const items = useQuery(api.stay.maintenance.list, {
    status: status === "all" ? undefined : status,
    stayPropertyId: propertyId ? (propertyId as Id<"stayProperties">) : undefined,
    unitId: unitId ? (unitId as Id<"stayUnits">) : undefined,
  });

  const properties = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units ?? []) m.set(u.stayPropertyId, u.propertyTitle);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [units]);

  const newHref = (unitId ? `/stay/maintenance/new?unitId=${unitId}` : "/stay/maintenance/new") as Href;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Maintenance" }} />
      <List
        data={items}
        keyExtractor={(m) => m._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        header={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            {unitId && (
              <>
                <Notice>Showing requests for one unit.</Notice>
                <Button small variant="secondary" title="Show all units" onPress={() => router.setParams({ unitId: undefined })} />
              </>
            )}
            <Chips<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: "All" }, ...MAINTENANCE_STATUSES.map((s) => ({ value: s.value as StatusFilter, label: s.label }))]}
            />
            {!unitId && (
              <Select label="Property" value={propertyId} onChange={setPropertyId} options={[{ value: "", label: "All properties" }, ...properties]} />
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="construct-outline"
            title="No maintenance requests"
            message="Log a request when a tenant reports a fault or an inspection finds one."
          />
        }
        renderItem={({ item }) => <MaintenanceRow item={item} showUnit={!unitId} />}
      />
      <Fab label="New request" onPress={() => router.push(newHref)} />
    </View>
  );
}
