/** One activity or task: what, when, status and its actions. */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Badge, Card, Row } from "../../ui";
import { activityTypeLabel, isOverdue } from "../../../lib/crm/leads/helpers";
import { dateTimeLabel } from "../../../lib/format";
import { colors, font, radius, space } from "../../../lib/theme";

export type ActivityLike = {
  title: string;
  description: string;
  type: string;
  status: string;
  scheduledAt?: number;
  createdAt: number;
  completedAt?: number;
  completionNotes?: string;
};

export function ActivityCard({ activity, context, actions, onPress }: { activity: ActivityLike; context?: string; actions?: ReactNode; onPress?: () => void }) {
  const overdue = isOverdue(activity);
  const done = activity.status === "completed";
  return (
    <Card onPress={onPress} style={[{ gap: space.sm }, overdue && { borderColor: colors.danger + "66" }]}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }}>{activity.title}</Text>
        <Badge label={done ? "Completed" : overdue ? "Overdue" : "To do"} tone={done ? "success" : overdue ? "danger" : "warning"} />
      </Row>
      <Row style={{ flexWrap: "wrap" }}>
        <Badge label={activityTypeLabel(activity.type)} tone="info" />
        <Text style={{ fontSize: font.sm, color: overdue ? colors.danger : colors.muted, fontWeight: overdue ? "600" : "400" }}>
          {activity.scheduledAt ? `Scheduled ${dateTimeLabel(activity.scheduledAt)}` : `Created ${dateTimeLabel(activity.createdAt)}`}
        </Text>
      </Row>
      {context ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{context}</Text> : null}
      {activity.description ? <Text style={{ fontSize: font.sm, color: colors.text }}>{activity.description}</Text> : null}
      {done && activity.completionNotes ? (
        <View style={{ backgroundColor: colors.successBg, borderRadius: radius.sm, padding: space.sm }}>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>Completion notes{activity.completedAt ? `, ${dateTimeLabel(activity.completedAt)}` : ""}</Text>
          <Text style={{ fontSize: font.sm, color: colors.text }}>{activity.completionNotes}</Text>
        </View>
      ) : null}
      {actions ? <Row style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</Row> : null}
    </Card>
  );
}
