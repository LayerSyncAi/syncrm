/** Supporting documents on a job (VW-23): title deed, plans, lease, rates statement. */
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { File } from "expo-file-system";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Ionicons, Loading, Row, Select } from "../ui";
import { choosePhoto, pickDocument, uploadFile, type PickedFile } from "../../lib/files";
import { confirm, useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { formatInstant, type JobView } from "../../lib/worth/util";
import { Pair, Panel } from "./bits";

type Kind = "title_deed" | "plans" | "lease" | "rates_statement" | "other";

const KIND_LABELS: Record<Kind, string> = {
  title_deed: "Title deed",
  plans: "Plans",
  lease: "Lease",
  rates_statement: "Rates statement",
  other: "Other",
};

const MAX_BYTES = 15 * 1024 * 1024;

function fileSize(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobDocuments({ job }: { job: JobView }) {
  const docs = useQuery(api.worth.documents.list, { jobId: job._id });
  const add = useMutation(api.worth.documents.add);
  const remove = useMutation(api.worth.documents.remove);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { run } = useRun();
  const [kind, setKind] = useState<Kind>("title_deed");
  const [busy, setBusy] = useState(false);
  const canUpload = (job.canWork || job.caps.canManageJobs) && job.status !== "issued" && job.status !== "cancelled";

  const upload = async (picked: PickedFile | null) => {
    if (!picked) return;
    // Photos from the camera come without a size; read it from the file.
    const file = { ...picked, size: picked.size ?? fileSize(picked.uri) };
    if (file.size > MAX_BYTES) {
      Alert.alert("File too large", `${file.name} is larger than 15 MB.`);
      return;
    }
    setBusy(true);
    await run(
      async () => {
        const storageId = await uploadFile(() => generateUploadUrl({}), file);
        await add({ jobId: job._id, name: file.name, kind, storageId: storageId as Id<"_storage">, mimeType: file.mimeType, size: file.size });
      },
      { success: "Document added" }
    );
    setBusy(false);
  };

  return (
    <Panel title="Supporting documents" description="Title deed, plans, lease and rates statement.">
      {canUpload && (
        <View style={{ gap: space.sm }}>
          <Select label="Document type" value={kind} options={(Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} onChange={setKind} />
          <Pair>
            <Button small icon="document-attach-outline" title="Choose file" loading={busy} onPress={async () => upload(await pickDocument())} />
            <Button small variant="secondary" icon="camera-outline" title="Photograph" disabled={busy} onPress={async () => upload(await choosePhoto())} />
          </Pair>
        </View>
      )}
      {docs === undefined ? (
        <Loading />
      ) : docs.length === 0 ? (
        <Body muted small>
          No documents yet.
        </Body>
      ) : (
        docs.map((d) => (
          <Row key={d._id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
            <Pressable style={{ flex: 1, flexDirection: "row", gap: space.md, alignItems: "center" }} onPress={() => d.url && WebBrowser.openBrowserAsync(d.url)}>
              <Ionicons name="document-text-outline" size={20} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={{ fontSize: font.xs, color: colors.muted }}>
                  {KIND_LABELS[d.kind]} · {size(d.size)} · {d.uploadedBy} · {formatInstant(d.createdAt)}
                </Text>
              </View>
            </Pressable>
            {canUpload && (
              <Pressable
                accessibilityLabel={`Remove ${d.name}`}
                hitSlop={10}
                onPress={async () => {
                  if (await confirm("Remove document", d.name, "Remove", true)) void run(() => remove({ documentId: d._id }), { success: "Document removed" });
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            )}
          </Row>
        ))
      )}
    </Panel>
  );
}
