/** Pipeline stages: add, edit, delete and reorder (move up and down instead of dragging). */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Fab, Field, List, Row, Select, Sheet, Title, Toggle } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { confirm, useRun } from "../../lib/useRun";
import { colors, space } from "../../lib/theme";

type Form = { name: string; description: string; action: string; isTerminal: boolean; terminalOutcome: "won" | "lost" | null; winProbability: string };
const EMPTY: Form = { name: "", description: "", action: "", isTerminal: false, terminalOutcome: null, winProbability: "" };

function Inner() {
  const stages = useQuery(api.stages.list);
  const createStage = useMutation(api.stages.adminCreate);
  const updateStage = useMutation(api.stages.adminUpdate);
  const deleteStage = useMutation(api.stages.adminDelete);
  const reorder = useMutation(api.stages.adminReorder);
  const seed = useMutation(api.stages.seedDefaultsIfEmpty);
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"pipelineStages"> | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Same as the website: an empty pipeline is seeded with the defaults.
  useEffect(() => {
    if (stages !== undefined && stages.length === 0) seed().catch(() => {});
  }, [stages, seed]);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };
  const openEdit = (id: Id<"pipelineStages">) => {
    const s = stages?.find((x) => x._id === id);
    if (!s) return;
    setEditId(id);
    setForm({ name: s.name, description: s.description ?? "", action: s.action ?? "", isTerminal: s.isTerminal, terminalOutcome: s.terminalOutcome, winProbability: s.winProbability !== undefined ? String(s.winProbability) : "" });
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return setError("Stage name is required");
    let winProbability: number | undefined;
    if (form.winProbability.trim() !== "") {
      const n = Number(form.winProbability);
      if (Number.isNaN(n) || n < 0 || n > 100) return setError("Win probability must be a number between 0 and 100");
      winProbability = n;
    }
    setError(null);
    const base = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      action: form.action.trim() || undefined,
      isTerminal: form.isTerminal,
      terminalOutcome: form.isTerminal ? form.terminalOutcome : null,
      winProbability,
    };
    const ok = await run(async () => {
      if (editId) await updateStage({ stageId: editId, order: stages?.find((s) => s._id === editId)?.order || 1, ...base });
      else await createStage({ order: (stages?.reduce((m, s) => Math.max(m, s.order), 0) || 0) + 1, ...base });
      return true;
    });
    if (ok) setOpen(false);
  };

  const remove = async (id: Id<"pipelineStages">, name: string) => {
    if (!(await confirm("Delete stage", `Delete "${name}"? If any leads are in this stage you will not be able to delete it.`, "Delete", true))) return;
    await run(() => deleteStage({ stageId: id }));
  };

  const move = (index: number, by: -1 | 1) => {
    if (!stages) return;
    const ids = stages.map((s) => s._id);
    const j = index + by;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    return run(() => reorder({ orderedStageIds: ids }));
  };

  return (
    <>
      <List
        data={stages}
        keyExtractor={(s) => s._id}
        header={<Body muted>Order, descriptions, actions, and which stages close a deal as won or lost.</Body>}
        empty={<EmptyState icon="git-branch-outline" title="No pipeline stages configured" />}
        renderItem={({ item: s, index }) => (
          <Card style={{ gap: space.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Title style={{ fontSize: 17, flex: 1 }}>{index + 1}. {s.name}</Title>
              {s.terminalOutcome === "won" ? <Badge label="Won" tone="success" /> : s.terminalOutcome === "lost" ? <Badge label="Lost" tone="danger" /> : s.isTerminal ? <Badge label="Terminal" /> : null}
            </Row>
            {s.description ? <Body muted>{s.description}</Body> : null}
            {s.action ? <Body small muted>Action: {s.action}</Body> : null}
            {s.winProbability !== undefined ? <Body small muted>Win probability {s.winProbability}%</Body> : null}
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button title="Up" icon="arrow-up" small variant="secondary" disabled={busy || index === 0} onPress={() => move(index, -1)} />
              <Button title="Down" icon="arrow-down" small variant="secondary" disabled={busy || index === (stages?.length ?? 0) - 1} onPress={() => move(index, 1)} />
              <Button title="Edit" icon="create-outline" small variant="secondary" onPress={() => openEdit(s._id)} />
              <Button title="Delete" icon="trash-outline" small variant="danger" disabled={busy} onPress={() => remove(s._id, s.name)} />
            </View>
          </Card>
        )}
      />
      <Fab label="Add stage" onPress={openNew} />
      <Sheet open={open} onClose={() => setOpen(false)} title={editId ? "Edit stage" : "Create stage"} footer={<Button title={editId ? "Save changes" : "Create stage"} loading={busy} onPress={submit} />}>
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <Field label="Stage name" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="e.g. New lead, Qualified, Closed" />
        <Field label="Description" value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline numberOfLines={3} />
        <Field label="Recommended action" value={form.action} onChangeText={(v) => setForm((p) => ({ ...p, action: v }))} multiline numberOfLines={2} hint="What should be done when a lead is in this stage?" />
        <Toggle label="This is a terminal stage (deal ends here)" value={form.isTerminal} onChange={(v) => setForm((p) => ({ ...p, isTerminal: v, terminalOutcome: v ? "won" : null }))} />
        {form.isTerminal && (
          <Select
            label="Final outcome"
            value={form.terminalOutcome ?? "won"}
            options={[
              { value: "won", label: "Won (success)" },
              { value: "lost", label: "Lost (did not convert)" },
            ]}
            onChange={(v) => setForm((p) => ({ ...p, terminalOutcome: v }))}
          />
        )}
        <Field
          label="Win probability (%)"
          value={form.winProbability}
          onChangeText={(v) => setForm((p) => ({ ...p, winProbability: v }))}
          keyboardType="numeric"
          placeholder="e.g. 40"
          hint="Expected chance an open lead in this stage closes as won. Powers forecasted pipeline revenue in Reports. Leave blank if unknown."
        />
      </Sheet>
    </>
  );
}

export default function StagesScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
