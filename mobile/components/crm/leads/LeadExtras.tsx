/** Smaller lead tabs: signed viewing forms and free-text notes. */
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, EmptyState, Field, ListItem, Loading, Section } from "../../ui";
import { useRun } from "../../../lib/useRun";
import { dateLabel } from "../../../lib/format";

/** Viewing forms signed for this lead. Forms are created and opened in Viewings. */
export function LeadViewings({ leadId }: { leadId: Id<"leads"> }) {
  const router = useRouter();
  const forms = useQuery(api.viewingForms.listByLead, { leadId });
  return (
    <Section title="Viewings" right={<Button small variant="secondary" title="All viewings" onPress={() => router.push("/crm/viewings")} />}>
      {forms === undefined ? (
        <Loading />
      ) : forms.length === 0 ? (
        <EmptyState icon="create-outline" title="No viewing forms yet" message="Signed viewing forms for this lead appear here." />
      ) : (
        forms.map((f) => (
          <ListItem
            key={f._id}
            icon="create-outline"
            title={f.propertyAddress || "Viewing"}
            subtitle={`${dateLabel(f.viewingDate)}${f.viewingTime ? `, ${f.viewingTime}` : ""} · ${f.agentName}`}
            right={<Badge label={f.status === "completed" ? "Signed" : "Draft"} tone={f.status === "completed" ? "success" : "warning"} />}
          />
        ))
      )}
    </Section>
  );
}

export function LeadNotes({ leadId, notes }: { leadId: Id<"leads">; notes: string }) {
  const updateNotes = useMutation(api.leads.updateNotes);
  const { busy, run } = useRun();
  const [text, setText] = useState(notes);
  useEffect(() => setText(notes), [notes]);
  return (
    <Section title="Notes">
      <Field label="Lead notes" value={text} onChangeText={setText} multiline placeholder="Add notes about this lead" />
      <Button title="Save notes" loading={busy} disabled={text === notes} onPress={() => run(() => updateNotes({ leadId, notes: text }))} />
    </Section>
  );
}
