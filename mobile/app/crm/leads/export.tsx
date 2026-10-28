/**
 * Lead export (leadExport.getLeadsForExport): filter by stage, agent and
 * created date, choose columns, then share an Excel workbook from the phone,
 * as the website does.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, DateField, Ionicons, Row, Screen, Section, Select } from "../../../components/ui";
import { useRun } from "../../../lib/useRun";
import { fileStamp, generateCSV, shareCsv, toInstant } from "../../../lib/crm/leads/helpers";
import { isEffectiveAdmin } from "../../../lib/crm/leads/useRefresh";
import { useSession } from "../../../lib/session";
import { colors, font, radius, space } from "../../../lib/theme";

const FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
  { key: "stageName", label: "Stage" },
  { key: "ownerName", label: "Assigned Agent" },
  { key: "score", label: "Score" },
  { key: "closedAt", label: "Closed At" },
  { key: "closeReason", label: "Close Reason" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
] as const;

export default function LeadExport() {
  const { user } = useSession();
  const isAdmin = isEffectiveAdmin(user);
  const { busy, run } = useRun();
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fields, setFields] = useState<string[]>(FIELDS.map((f) => f.key));
  const stages = useQuery(api.stages.list, {});
  const users = useQuery(api.users.listAll, isAdmin ? {} : "skip");
  const leads = useQuery(api.leadExport.getLeadsForExport, {
    stageId: stageId ? (stageId as Id<"pipelineStages">) : undefined,
    ownerUserId: ownerId ? (ownerId as Id<"users">) : undefined,
    dateFrom: from ? (toInstant(from, "00:00") ?? undefined) : undefined,
    // End of the chosen day, as on the website.
    dateTo: to && toInstant(to, "23:59") !== null ? toInstant(to, "23:59")! + 59_999 : undefined,
  });

  const toggle = (k: string) => setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const exportCsv = () =>
    run(async () => {
      if (!leads) return;
      const keys = FIELDS.filter((f) => fields.includes(f.key));
      const csv = generateCSV(
        keys.map((k) => k.label),
        leads.map((l) => keys.map((k) => String((l as Record<string, unknown>)[k.key] ?? "")))
      );
      await shareCsv(csv, `${fileStamp()}_leads-export.csv`);
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: "Lead export" }} />
      <Section title="Filters">
        <Select label="Stage" value={stageId} options={[{ value: "", label: "All stages" }, ...(stages ?? []).map((s) => ({ value: s._id as string, label: s.name }))]} onChange={setStageId} />
        {isAdmin && (
          <Select
            label="Assigned agent"
            value={ownerId}
            options={[{ value: "", label: "All agents" }, ...(users ?? []).map((u) => ({ value: u._id as string, label: u.fullName || u.name || u.email || "Unknown" }))]}
            onChange={setOwnerId}
          />
        )}
        <DateField label="Created from" value={from} onChange={setFrom} />
        <DateField label="Created to" value={to} onChange={setTo} />
      </Section>

      <Section
        title="Columns"
        right={
          <Row>
            <Button small variant="ghost" title="All" onPress={() => setFields(FIELDS.map((f) => f.key))} />
            <Button small variant="ghost" title="Minimum" onPress={() => setFields(["fullName", "phone"])} />
          </Row>
        }
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {FIELDS.map((f) => {
            const on = fields.includes(f.key);
            return (
              <Pressable
                key={f.key}
                onPress={() => toggle(f.key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: on ? colors.brand : colors.borderStrong,
                  backgroundColor: on ? colors.brandLight : colors.card,
                }}
              >
                <Ionicons name={on ? "checkmark" : "add"} size={14} color={on ? colors.brand : colors.muted} />
                <Text style={{ fontSize: font.sm, color: on ? colors.brand : colors.muted }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Card>
        <Body>{leads === undefined ? "Counting leads" : `${leads.length} lead${leads.length === 1 ? "" : "s"} match your filters`}</Body>
        <Button title="Export to Excel" icon="share-outline" loading={busy} disabled={!leads || leads.length === 0 || fields.length === 0} onPress={exportCsv} />
      </Card>
    </Screen>
  );
}
