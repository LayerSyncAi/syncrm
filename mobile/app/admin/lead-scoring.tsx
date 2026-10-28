/** Lead scoring: criteria on or off, weights (steppers instead of sliders), live preview and recompute. */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, Field, Loading, Notice, Screen, Section, Select, Toggle } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { confirm, useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";

type Criterion = { key: string; label: string; type: "boolean" | "threshold"; weight: number; enabled: boolean; threshold?: number };

function Inner() {
  const config = useQuery(api.leadScoring.getConfig);
  const leads = useQuery(api.leads.list, {});
  const saveConfig = useMutation(api.leadScoring.saveConfig);
  const recompute = useMutation(api.leadScoring.recomputeAllScores);
  const { busy, run } = useRun();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [previewLeadId, setPreviewLeadId] = useState("");

  useEffect(() => {
    if (config?.criteria) setCriteria(config.criteria as Criterion[]);
  }, [config]);

  const clean = criteria.map((c) => ({ ...c, threshold: c.threshold ?? undefined }));
  const preview = useQuery(api.leadScoring.computeScorePreview, previewLeadId ? { leadId: previewLeadId as Id<"leads">, criteria: clean } : "skip");

  const update = (i: number, patch: Partial<Criterion>) => setCriteria((prev) => prev.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const max = criteria.filter((c) => c.enabled).reduce((s, c) => s + c.weight, 0);

  if (!config) return <Loading />;

  return (
    <Screen>
      <Body muted>Configure scoring criteria and weights. Max possible score: {max}.</Body>
      {criteria.map((c, i) => (
        <Card key={c.key} style={[{ gap: space.sm }, !c.enabled && { opacity: 0.6 }]}>
          <Toggle label={c.label} hint={c.type === "boolean" ? "Yes/No" : "Threshold"} value={c.enabled} onChange={(v) => update(i, { enabled: v })} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Button title="-5" small variant="secondary" disabled={!c.enabled} onPress={() => update(i, { weight: Math.max(0, c.weight - 5) })} />
            <View style={{ flex: 1 }}>
              <Field
                label="Weight"
                value={String(c.weight)}
                editable={c.enabled}
                keyboardType="numeric"
                onChangeText={(v) => update(i, { weight: Math.max(0, Math.min(100, Number(v.replace(/\D/g, "")) || 0)) })}
              />
            </View>
            <Button title="+5" small variant="secondary" disabled={!c.enabled} onPress={() => update(i, { weight: Math.min(100, c.weight + 5) })} />
          </View>
          {c.type === "threshold" && (
            <Field label="Threshold" value={String(c.threshold ?? 0)} editable={c.enabled} keyboardType="numeric" onChangeText={(v) => update(i, { threshold: Number(v.replace(/[^\d.]/g, "")) || 0 })} />
          )}
        </Card>
      ))}
      <Button title="Save config" icon="save-outline" loading={busy} onPress={() => run(() => saveConfig({ criteria: clean }), { success: "Scoring config saved" })} />
      <Button
        title="Recompute all scores"
        icon="refresh"
        variant="secondary"
        disabled={busy}
        onPress={async () => {
          if (!(await confirm("Recompute all scores?", "Every lead is scored again with the saved config.", "Recompute"))) return;
          await run(() => recompute(), { success: "Scores recomputed" });
        }}
      />

      <Section title="Live score preview">
        <Card style={{ gap: space.md }}>
          <Select
            label="Lead"
            value={previewLeadId}
            placeholder="Select a lead to preview"
            options={(leads?.items ?? []).slice(0, 50).map((l) => ({ value: l._id as string, label: `${l.fullName} (${l.phone})` }))}
            onChange={setPreviewLeadId}
          />
          {!previewLeadId ? (
            <Body muted>Select a lead to see a live score preview. Adjusting criteria updates it as you go.</Body>
          ) : !preview ? (
            <Loading />
          ) : (
            <>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 34, fontWeight: "700", color: colors.text }}>{preview.totalScore}</Text>
                <Body muted>out of {max}</Body>
              </View>
              {preview.breakdown.map((b: { key: string; label: string; points: number; met: boolean }) => (
                <View key={b.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <Text style={{ flex: 1, fontSize: font.md, color: b.met ? colors.text : colors.muted }}>{b.met ? "Met: " : "Not met: "}{b.label}</Text>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: b.met ? colors.success : colors.muted }}>{b.met ? `+${b.points}` : "0"}</Text>
                </View>
              ))}
            </>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

export default function LeadScoringScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
