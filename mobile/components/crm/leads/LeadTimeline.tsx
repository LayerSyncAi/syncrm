/** The lead's activity timeline: log, complete and delete activities. */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, EmptyState, Loading, Section } from "../../ui";
import { confirm, useRun } from "../../../lib/useRun";
import { ActivityCard } from "./ActivityCard";
import { ActivityFormSheet, CompleteSheet, RescheduleSheet } from "./ActivitySheets";

export function LeadTimeline({ leadId }: { leadId: Id<"leads"> }) {
  const activities = useQuery(api.activities.listForLead, { leadId });
  const remove = useMutation(api.activities.remove);
  const reopen = useMutation(api.activities.reopen);
  const { run } = useRun();
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<{ _id: Id<"activities">; title: string } | null>(null);
  const [rescheduling, setRescheduling] = useState<{ _id: Id<"activities">; title: string; scheduledAt?: number } | null>(null);

  const del = async (a: { _id: Id<"activities">; title: string }) => {
    if (await confirm("Delete activity", `Delete "${a.title}"? This cannot be undone.`, "Delete", true)) {
      await run(() => remove({ activityId: a._id }));
    }
  };

  return (
    <Section title="Timeline" right={<Button small title="Log activity" icon="add" onPress={() => setAdding(true)} />}>
      {activities === undefined ? (
        <Loading />
      ) : activities.length === 0 ? (
        <EmptyState icon="time-outline" title="No activities yet" message="Log a call, WhatsApp, viewing or follow-up." />
      ) : (
        activities.map((a) => (
          <ActivityCard
            key={a._id}
            activity={a}
            actions={
              <>
                <Button small variant="danger" title="Delete" onPress={() => del(a)} />
                {a.status === "completed" ? (
                  <Button small variant="secondary" title="Reopen" onPress={() => run(() => reopen({ activityId: a._id }))} />
                ) : (
                  <>
                    <Button small variant="secondary" title="Reschedule" onPress={() => setRescheduling(a)} />
                    <Button small title="Complete" onPress={() => setCompleting(a)} />
                  </>
                )}
              </>
            }
          />
        ))
      )}
      <ActivityFormSheet open={adding} onClose={() => setAdding(false)} leadId={leadId} />
      <CompleteSheet activity={completing} onClose={() => setCompleting(null)} />
      <RescheduleSheet activity={rescheduling} onClose={() => setRescheduling(null)} />
    </Section>
  );
}
