/** One lead: summary and actions on top, then timeline, documents, viewings, properties and notes. */
import { useState } from "react";
import { Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Button, Chips, EmptyState, Ionicons, Loading, Screen } from "../../../components/ui";
import { LeadHero } from "../../../components/crm/leads/LeadHero";
import { LeadEditSheet } from "../../../components/crm/leads/LeadEditSheet";
import { StageMover } from "../../../components/crm/leads/StageMover";
import { DeleteLeadSheet } from "../../../components/crm/leads/DeleteLeadSheet";
import { DuplicateWarning } from "../../../components/crm/leads/DuplicateWarning";
import { LeadTimeline } from "../../../components/crm/leads/LeadTimeline";
import { LeadDocuments } from "../../../components/crm/leads/LeadDocuments";
import { LeadMatches, LeadSuggestions } from "../../../components/crm/leads/LeadMatches";
import { LeadNotes, LeadViewings } from "../../../components/crm/leads/LeadExtras";
import { useRefresh } from "../../../lib/crm/leads/useRefresh";
import type { StageLite } from "../../../lib/crm/leads/helpers";
import { colors } from "../../../lib/theme";

type Tab = "timeline" | "documents" | "viewings" | "matches" | "suggested" | "notes";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "timeline", label: "Timeline" },
  { value: "documents", label: "Documents" },
  { value: "viewings", label: "Viewings" },
  { value: "matches", label: "Properties" },
  { value: "suggested", label: "Suggested" },
  { value: "notes", label: "Notes" },
];

export default function LeadDetail() {
  const router = useRouter();
  const { leadId: raw } = useLocalSearchParams<{ leadId: string }>();
  const leadId = raw as Id<"leads">;
  const [deleted, setDeleted] = useState(false);
  const data = useQuery(api.leads.getById, deleted ? "skip" : { leadId });
  const stages = useQuery(api.stages.list, {});
  const score = useQuery(api.leadScoring.getScoreBreakdown, deleted ? "skip" : { leadId });
  const matches = useQuery(api.matches.listForLead, deleted || !data ? "skip" : { leadId });
  const [tab, setTab] = useState<Tab>("timeline");
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { refreshing, onRefresh } = useRefresh();

  if (deleted) return null;
  if (data === undefined) return <Loading />;
  if (data === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Lead" }} />
        <EmptyState icon="lock-closed-outline" title="Lead not found" message="It may have been deleted, or you do not have access." action={<Button title="Back to leads" onPress={() => router.replace("/crm/leads")} />} />
      </Screen>
    );
  }
  // getById reads the stage and owner by untyped id, so name their shapes here.
  const lead = data.lead as Doc<"leads">;
  const stage = data.stage as StageLite | null;
  const owner = data.owner as { fullName?: string; name?: string; email?: string } | null;
  const propertyTitle = matches?.[0]?.property?.title ?? null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen
        options={{
          title: lead.fullName,
          headerRight: () => (
            <Pressable onPress={() => setDeleting(true)} hitSlop={10} accessibilityLabel="Delete lead">
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          ),
        }}
      />
      <LeadHero lead={lead} stage={stage} owner={owner} stages={stages} score={score} onMove={() => setMoving(true)} onEdit={() => setEditing(true)} />
      <DuplicateWarning email={lead.email} phone={lead.phone} excludeLeadId={leadId} />
      <Chips options={TABS} value={tab} onChange={setTab} />
      {tab === "timeline" && <LeadTimeline leadId={leadId} />}
      {tab === "documents" && <LeadDocuments leadId={leadId} />}
      {tab === "viewings" && <LeadViewings leadId={leadId} />}
      {tab === "matches" && <LeadMatches leadId={leadId} />}
      {tab === "suggested" && <LeadSuggestions leadId={leadId} />}
      {tab === "notes" && <LeadNotes leadId={leadId} notes={lead.notes} />}

      <LeadEditSheet open={editing} onClose={() => setEditing(false)} lead={lead} />
      <StageMover open={moving} onClose={() => setMoving(false)} lead={lead} stages={stages} />
      <DeleteLeadSheet
        lead={deleting ? { _id: leadId, fullName: lead.fullName, propertyTitle } : null}
        onClose={() => setDeleting(false)}
        onPending={setDeleted}
        onDeleted={() => router.back()}
      />
    </Screen>
  );
}
