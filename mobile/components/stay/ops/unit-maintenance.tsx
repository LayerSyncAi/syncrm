import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Row, Section } from "../../ui";
import { space } from "../../../lib/theme";
import { MaintenanceRow } from "./maintenance-list";

/** Maintenance requests for one unit, with a button to log a new one. */
export function UnitMaintenance({ unitId }: { unitId: Id<"stayUnits"> }) {
  const router = useRouter();
  const items = useQuery(api.stay.maintenance.list, { unitId });
  return (
    <Section
      title="Maintenance"
      right={<Button small variant="secondary" icon="add" title="Log request" onPress={() => router.push(`/stay/maintenance/new?unitId=${unitId}` as Href)} />}
    >
      {items === undefined ? (
        <Body muted>Loading</Body>
      ) : items.length === 0 ? (
        <Body muted>No requests for this unit.</Body>
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((m) => (
            <MaintenanceRow key={m._id} item={m} showUnit={false} />
          ))}
        </View>
      )}
    </Section>
  );
}
