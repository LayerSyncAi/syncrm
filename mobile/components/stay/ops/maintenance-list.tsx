import { useRouter, type Href } from "expo-router";
import { View } from "react-native";
import { Badge, ListItem } from "../../ui";
import { dateLabel, money } from "../../../lib/format";
import { maintenanceStatusVariant, type MaintenanceStatus } from "@/lib/stay-ops/labels";

export type MaintenanceItem = {
  _id: string;
  title: string;
  status: MaintenanceStatus;
  statusLabel: string;
  unitLabel: string;
  propertyTitle: string;
  assigneeName?: string;
  cost?: number;
  currency?: "USD" | "ZiG";
  photoCount: number;
  createdAt: number;
  landlordApproval?: { status: "pending" | "approved" | "declined" };
};

/** One tappable row for a maintenance request. */
export function MaintenanceRow({ item: m, showUnit = true }: { item: MaintenanceItem; showUnit?: boolean }) {
  const router = useRouter();
  const bits = [
    m.assigneeName ?? "Unassigned",
    m.photoCount > 0 ? `${m.photoCount} photo${m.photoCount === 1 ? "" : "s"}` : "",
    m.cost != null && m.currency ? money(m.cost, m.currency) : "",
    dateLabel(m.createdAt),
  ].filter(Boolean);
  return (
    <ListItem
      title={m.title}
      subtitle={showUnit ? `${m.propertyTitle}, ${m.unitLabel}` : undefined}
      meta={bits.join(" · ")}
      onPress={() => router.push(`/stay/maintenance/${m._id}` as Href)}
      right={
        <View style={{ gap: 4, alignItems: "flex-end" }}>
          <Badge label={m.statusLabel} tone={maintenanceStatusVariant[m.status]} />
          {m.landlordApproval?.status === "pending" && <Badge label="Awaiting landlord" tone="warning" />}
          {m.landlordApproval?.status === "declined" && <Badge label="Declined" tone="danger" />}
        </View>
      }
    />
  );
}
