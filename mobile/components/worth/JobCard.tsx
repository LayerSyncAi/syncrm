/** A valuation job in a list: reference, property, client, due date and status. */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { WorthStatus } from "../../../convex/worth/lib";
import { Card, Row } from "../ui";
import { colors, font } from "../../lib/theme";
import { DueText, StatusBadge } from "./bits";

export type JobRow = {
  _id: string;
  reference: string;
  propertyAddress: string;
  suburb?: string;
  clientName: string;
  status: WorthStatus;
  dueDate: string;
  valuerName: string | null;
  dueFlag: "overdue" | "due_soon" | null;
};

export function JobCard({ job, onPress, showValuer = true, action }: { job: JobRow; onPress: () => void; showValuer?: boolean; action?: ReactNode }) {
  return (
    <Card onPress={onPress}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: font.xs, fontWeight: "600", color: colors.muted }}>{job.reference}</Text>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
            {job.propertyAddress}
          </Text>
          <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>
            {[job.suburb, job.clientName].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {action ?? <StatusBadge status={job.status} />}
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <DueText dueDate={job.dueDate} flag={job.dueFlag} prefix="Due " />
        {showValuer && <Text style={{ fontSize: font.sm, color: colors.muted }}>{job.valuerName ?? "Unassigned"}</Text>}
      </Row>
    </Card>
  );
}
