/**
 * Tasks: every call, meeting and follow-up (activities.listAllTasks). Admins
 * see the agency's tasks, agents their own. Filter by when and type, create
 * standalone tasks, complete, reschedule, reopen and delete.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Chips, EmptyState, Fab, List, Select, Stat, StatGrid } from "../../../components/ui";
import { ActivityCard } from "../../../components/crm/leads/ActivityCard";
import { ActivityFormSheet, CompleteSheet, RescheduleSheet } from "../../../components/crm/leads/ActivitySheets";
import { TaskSheet, type TaskRow } from "../../../components/crm/leads/TaskSheet";
import { ACTIVITY_TYPE_OPTIONS, startOfToday, type ActivityType } from "../../../lib/crm/leads/helpers";
import { useRefresh, useSticky } from "../../../lib/crm/leads/useRefresh";
import { space } from "../../../lib/theme";

type When = "today" | "overdue" | "upcoming" | "open" | "completed";
const WHEN: Array<{ value: When; label: string }> = [
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "open", label: "All open" },
  { value: "completed", label: "Completed" },
];
const DAY = 24 * 60 * 60 * 1000;
const PAGE = 50;

export default function Tasks() {
  const [when, setWhen] = useState<When>("today");
  const [type, setType] = useState<ActivityType | "all">("all");
  const [doneLimit, setDoneLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [rescheduling, setRescheduling] = useState<TaskRow | null>(null);
  const { refreshing, onRefresh } = useRefresh();

  // Open tasks are split by date on the phone, so fetch them in one go.
  const open = useSticky(useQuery(api.activities.listAllTasks, when === "completed" ? "skip" : { status: "todo", type, pageSize: 1000 }));
  const done = useSticky(useQuery(api.activities.listAllTasks, when === "completed" ? { status: "completed", type, pageSize: doneLimit } : "skip"));

  const buckets = useMemo(() => {
    const items = (open?.items ?? []) as TaskRow[];
    const start = startOfToday();
    const end = start + DAY;
    const now = Date.now();
    const byTime = (a: TaskRow, b: TaskRow) => (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity);
    return {
      today: items.filter((t) => t.scheduledAt && t.scheduledAt >= start && t.scheduledAt < end).sort(byTime),
      overdue: items.filter((t) => t.scheduledAt && t.scheduledAt < now).sort(byTime),
      // Unscheduled tasks have no date, so they wait under Upcoming.
      upcoming: items.filter((t) => !t.scheduledAt || t.scheduledAt >= end).sort(byTime),
      open: items.slice().sort(byTime),
    };
  }, [open]);

  const data: TaskRow[] | undefined = when === "completed" ? (done?.items as TaskRow[] | undefined) : open ? buckets[when] : undefined;

  // Read the open task from live data so its status updates in place.
  const selected = selectedId ? ([...(open?.items ?? []), ...(done?.items ?? [])] as TaskRow[]).find((t) => t._id === selectedId) ?? null : null;

  const later = (fn: () => void) => {
    setSelectedId(null);
    // Let the detail sheet close before the next one opens.
    setTimeout(fn, 400);
  };

  const header = (
    <View style={{ gap: space.md }}>
      {open && (
        <StatGrid>
          <Stat label="Today" value={String(buckets.today.length)} onPress={() => setWhen("today")} />
          <Stat label="Overdue" value={String(buckets.overdue.length)} tone={buckets.overdue.length ? "danger" : undefined} onPress={() => setWhen("overdue")} />
        </StatGrid>
      )}
      <Chips options={WHEN} value={when} onChange={setWhen} />
      <Select label="Type" value={type} options={[{ value: "all" as const, label: "All types" }, ...ACTIVITY_TYPE_OPTIONS]} onChange={setType} />
    </View>
  );

  const context = (t: TaskRow) =>
    [t.lead ? `Lead: ${t.lead.fullName}` : t.contact ? `Contact: ${t.contact.name}` : "", t.property ? `Property: ${t.property.title}` : "", t.assignedTo ? `For ${t.assignedTo.fullName || t.assignedTo.name || t.assignedTo.email}` : ""]
      .filter(Boolean)
      .join(" · ");

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Tasks" }} />
      <List
        data={data}
        header={header}
        keyExtractor={(t) => t._id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.4}
        onEndReached={() => when === "completed" && done?.hasMore && setDoneLimit((n) => n + PAGE)}
        empty={<EmptyState icon="checkbox-outline" title="No tasks here" message="Change the filters, or add a call, viewing or follow-up." />}
        renderItem={({ item }) => <ActivityCard activity={item} context={context(item)} onPress={() => setSelectedId(item._id)} />}
      />
      <Fab label="New task" onPress={() => setCreating(true)} />
      <ActivityFormSheet open={creating} onClose={() => setCreating(false)} />
      <TaskSheet task={selected} onClose={() => setSelectedId(null)} onComplete={(t) => later(() => setCompleting(t))} onReschedule={(t) => later(() => setRescheduling(t))} />
      <CompleteSheet activity={completing} onClose={() => setCompleting(null)} />
      <RescheduleSheet activity={rescheduling} onClose={() => setRescheduling(null)} />
    </View>
  );
}
