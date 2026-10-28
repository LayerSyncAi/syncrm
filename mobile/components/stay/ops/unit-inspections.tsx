import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, ListItem, Section } from "../../ui";
import { space } from "../../../lib/theme";
import { formatDay } from "@/lib/stay-ops/labels";

/** Inspection history for one unit, with a button to start a new one. */
export function UnitInspections({ unitId }: { unitId: Id<"stayUnits"> }) {
  const router = useRouter();
  const items = useQuery(api.stay.inspections.list, { unitId });
  return (
    <Section
      title="Inspections"
      right={<Button small variant="secondary" icon="add" title="New inspection" onPress={() => router.push(`/stay/inspections/new?unitId=${unitId}` as Href)} />}
    >
      {items === undefined ? (
        <Body muted>Loading</Body>
      ) : items.length === 0 ? (
        <Body muted>No inspections yet.</Body>
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((i) => (
            <ListItem
              key={i._id}
              title={i.typeLabel}
              subtitle={`${formatDay(i.date)} by ${i.inspectorName}`}
              onPress={() => router.push(`/stay/inspections/${i._id}` as Href)}
              right={<Badge label={i.status === "completed" ? "Completed" : "Draft"} tone={i.status === "completed" ? "success" : "warning"} />}
            />
          ))}
        </View>
      )}
    </Section>
  );
}
