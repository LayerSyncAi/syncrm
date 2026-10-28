/** Notes and activity log per job (VW-13). */
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Field, Loading, Select } from "../ui";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { formatInstant, type JobView } from "../../lib/worth/util";
import { Pair, Panel } from "./bits";

type NoteKind = "note" | "call" | "client_query" | "access";

const KIND_LABELS: Record<NoteKind | "system", string> = {
  note: "Note",
  call: "Call",
  client_query: "Client query",
  access: "Access",
  system: "Update",
};

const KIND_OPTIONS = (["note", "call", "client_query", "access"] as const).map((k) => ({ value: k, label: KIND_LABELS[k] }));

export function JobActivity({ job }: { job: JobView }) {
  const notes = useQuery(api.worth.jobs.listNotes, { jobId: job._id });
  const addNote = useMutation(api.worth.jobs.addNote);
  const [kind, setKind] = useState<NoteKind>("note");
  const [body, setBody] = useState("");
  const { busy, run } = useRun();

  const submit = async () => {
    if (!body.trim()) return;
    const ok = await run(async () => {
      await addNote({ jobId: job._id, kind, body });
      return true;
    });
    if (ok) setBody("");
  };

  return (
    <Panel title="Notes and activity" description="Calls, client queries, access arrangements and every status change.">
      <Field label="Add a note" value={body} onChangeText={setBody} multiline placeholder="What happened" />
      <Pair>
        <Select label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
        <View style={{ justifyContent: "flex-end" }}>
          <Button title="Add" onPress={submit} loading={busy} disabled={!body.trim()} />
        </View>
      </Pair>
      {notes === undefined ? (
        <Loading />
      ) : notes.length === 0 ? (
        <Body muted small>
          Nothing logged yet.
        </Body>
      ) : (
        <View style={{ gap: space.md, marginTop: space.sm }}>
          {notes.map((n) => (
            <View key={n._id} style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.kind === "system" ? colors.borderStrong : colors.brand }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, color: n.kind === "system" ? colors.muted : colors.text, lineHeight: 20 }}>{n.body}</Text>
                <Text style={{ fontSize: font.xs, color: colors.faint }}>
                  {KIND_LABELS[n.kind]} · {n.byName} · {formatInstant(n.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}
