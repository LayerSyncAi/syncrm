import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Chips, EmptyState, Fab, List, ListItem, Notice } from "../../../components/ui";
import { useQuickRefresh } from "../../../lib/stay-ops/photos";
import { colors, space } from "../../../lib/theme";
import { formatDay } from "@/lib/stay-ops/labels";

type Tab = "due" | "draft" | "completed";

/** Due and overdue units, drafts and completed reports. Optional ?unitId= narrows to one unit. */
export default function InspectionsList() {
  const router = useRouter();
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  const [tab, setTab] = useState<Tab>("due");
  const { refreshing, onRefresh } = useQuickRefresh();
  const uid = unitId ? (unitId as Id<"stayUnits">) : undefined;

  const due = useQuery(api.stay.inspections.dueUnits);
  const drafts = useQuery(api.stay.inspections.list, { status: "draft", unitId: uid });
  const done = useQuery(api.stay.inspections.list, { status: "completed", unitId: uid });

  const dueRows = due === undefined ? undefined : uid ? due.filter((u) => u.unitId === uid) : due;
  const label = (t: string, n?: number) => (n ? `${t} (${n})` : t);
  const tabs = [
    { value: "due" as Tab, label: label("Due", dueRows?.length) },
    { value: "draft" as Tab, label: label("Drafts", drafts?.length) },
    { value: "completed" as Tab, label: label("Completed", done?.length) },
  ];

  const header = (
    <View style={{ gap: space.md, marginBottom: space.md }}>
      {unitId && (
        <>
          <Notice>Showing inspections for one unit.</Notice>
          <Button small variant="secondary" title="Show all units" onPress={() => router.setParams({ unitId: undefined })} />
        </>
      )}
      <Chips value={tab} onChange={setTab} options={tabs} />
    </View>
  );
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Inspections" }} />
      {tab === "due" ? (
        <List
          data={dueRows}
          keyExtractor={(u) => u.unitId}
          header={header}
          refreshControl={refreshControl}
          empty={<EmptyState icon="clipboard-outline" title="Nothing due" message="Units show here when a routine inspection is overdue or due within 30 days. Set an inspection interval on a unit to switch this on." />}
          renderItem={({ item: u }) => (
            <ListItem
              title={u.unitLabel}
              subtitle={`${u.propertyTitle}. Due ${formatDay(u.nextInspectionDue)}`}
              right={
                <View style={{ gap: 6, alignItems: "flex-end" }}>
                  <Badge label={u.state === "overdue" ? "Overdue" : "Due soon"} tone={u.state === "overdue" ? "danger" : "warning"} />
                  <Button small variant="secondary" title="Start" onPress={() => router.push(`/stay/inspections/new?unitId=${u.unitId}` as Href)} />
                </View>
              }
            />
          )}
        />
      ) : (
        <List
          data={tab === "draft" ? drafts : done}
          keyExtractor={(i) => i._id}
          header={header}
          refreshControl={refreshControl}
          empty={<EmptyState icon="clipboard-outline" title={tab === "draft" ? "No drafts" : "No completed inspections"} message="Start an inspection from a unit that is due, or create one." />}
          renderItem={({ item: i }) => (
            <ListItem
              title={`${i.typeLabel}: ${i.unitLabel}`}
              subtitle={i.propertyTitle}
              meta={`${formatDay(i.date)} by ${i.inspectorName}${i.sentToLandlordAt ? ". Sent to landlord" : ""}`}
              onPress={() => router.push(`/stay/inspections/${i._id}` as Href)}
              right={i.issueCount > 0 ? <Badge label={`${i.issueCount} to fix`} tone="warning" /> : undefined}
            />
          )}
        />
      )}
      <Fab label="New inspection" onPress={() => router.push((unitId ? `/stay/inspections/new?unitId=${unitId}` : "/stay/inspections/new") as Href)} />
    </View>
  );
}
