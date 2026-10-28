/** A task's details and actions: open its lead, complete, reschedule, reopen or delete. */
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Facts, Row, Sheet } from "../../ui";
import { confirm, useRun } from "../../../lib/useRun";
import { dateTimeLabel } from "../../../lib/format";
import { activityTypeLabel, isOverdue } from "../../../lib/crm/leads/helpers";
import { useSession } from "../../../lib/session";
import { colors, font, radius, space } from "../../../lib/theme";

export type TaskRow = {
  _id: Id<"activities">;
  title: string;
  description: string;
  type: string;
  status: "todo" | "completed";
  scheduledAt?: number;
  createdAt: number;
  completedAt?: number;
  completionNotes?: string;
  assignedToUserId: Id<"users">;
  createdByUserId: Id<"users">;
  lead: { _id: Id<"leads">; fullName: string; phone?: string } | null;
  property: { _id: Id<"properties">; title: string } | null;
  contact: { _id: Id<"contacts">; name: string } | null;
  assignedTo: { fullName?: string; name?: string; email?: string } | null;
};

export function TaskSheet({
  task,
  onClose,
  onComplete,
  onReschedule,
}: {
  task: TaskRow | null;
  onClose: () => void;
  onComplete: (t: TaskRow) => void;
  onReschedule: (t: TaskRow) => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const reopen = useMutation(api.activities.reopen);
  const remove = useMutation(api.activities.remove);
  const { busy, run } = useRun();
  if (!task) return null;

  // Same rules as the server: admins, or the assignee to change it, the creator to delete it.
  const admin = user?.role === "admin";
  const canChange = admin || task.assignedToUserId === user?._id;
  const canDelete = admin || task.createdByUserId === user?._id;
  const done = task.status === "completed";
  const overdue = isOverdue(task);
  const go = (href: string) => {
    onClose();
    router.push(href as Href);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={task.title}
      footer={
        <>
          {canChange &&
            (done ? (
              <Button title="Reopen task" variant="secondary" loading={busy} onPress={() => run(() => reopen({ activityId: task._id }))} />
            ) : (
              <Row>
                <Button style={{ flex: 1 }} variant="secondary" title="Reschedule" onPress={() => onReschedule(task)} />
                <Button style={{ flex: 1 }} title="Complete" onPress={() => onComplete(task)} />
              </Row>
            ))}
          {canDelete && (
            <Button
              title="Delete"
              variant="danger"
              onPress={async () => {
                if (await confirm("Delete task", `Delete "${task.title}"? This cannot be undone.`, "Delete", true)) {
                  const r = await run(() => remove({ activityId: task._id }));
                  if (r !== undefined) onClose();
                }
              }}
            />
          )}
        </>
      }
    >
      <Row style={{ flexWrap: "wrap" }}>
        <Badge label={done ? "Completed" : overdue ? "Overdue" : "To do"} tone={done ? "success" : overdue ? "danger" : "warning"} />
        <Badge label={activityTypeLabel(task.type)} tone="info" />
      </Row>
      {task.description ? <Text style={{ fontSize: font.md, color: colors.text }}>{task.description}</Text> : null}
      <Facts
        items={[
          { label: "Lead", value: task.lead ? `${task.lead.fullName}${task.lead.phone ? ` (${task.lead.phone})` : ""}` : "Standalone task" },
          { label: "Contact", value: task.contact?.name ?? "" },
          { label: "Property", value: task.property?.title ?? "" },
          { label: "Assigned to", value: task.assignedTo?.fullName || task.assignedTo?.name || task.assignedTo?.email || "Unassigned" },
          { label: "Scheduled", value: task.scheduledAt ? dateTimeLabel(task.scheduledAt) : "" },
          { label: "Created", value: dateTimeLabel(task.createdAt) },
          { label: "Completed", value: task.completedAt ? dateTimeLabel(task.completedAt) : "" },
        ]}
      />
      {done && task.completionNotes ? (
        <View style={{ backgroundColor: colors.successBg, borderRadius: radius.sm, padding: space.md, gap: 4 }}>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>Completion notes</Text>
          <Text style={{ fontSize: font.md, color: colors.text }}>{task.completionNotes}</Text>
        </View>
      ) : null}
      <Row style={{ flexWrap: "wrap" }}>
        {task.lead && <Button small variant="secondary" icon="git-network-outline" title="Open lead" onPress={() => go(`/crm/leads/${task.lead!._id}`)} />}
        {task.contact && <Button small variant="secondary" icon="person-outline" title="Open contact" onPress={() => go(`/crm/contacts/${task.contact!._id}`)} />}
        {task.property && <Button small variant="secondary" icon="business-outline" title="Open property" onPress={() => go(`/crm/properties/${task.property!._id}`)} />}
      </Row>
    </Sheet>
  );
}
