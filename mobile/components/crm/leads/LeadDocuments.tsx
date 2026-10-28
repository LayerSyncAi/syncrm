/**
 * Lead documents in the website's four folders: list, upload from the phone
 * (file or photo), open and delete. Files go to Convex storage through
 * storage.generateUploadUrl, then documents.upload records them.
 */
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, Chips, EmptyState, ListItem, Loading, Row, Section, Ionicons, type IconName } from "../../ui";
import { choosePhoto, pickDocument, uploadFile, type PickedFile } from "../../../lib/files";
import { confirm, useRun } from "../../../lib/useRun";
import { dateLabel } from "../../../lib/format";
import { colors } from "../../../lib/theme";

type Folder = "lead_documentation" | "id_copies" | "proof_of_funds" | "contracts";

const FOLDERS: Array<{ value: Folder; label: string }> = [
  { value: "lead_documentation", label: "Lead documentation" },
  { value: "id_copies", label: "ID copies" },
  { value: "proof_of_funds", label: "Proof of funds" },
  { value: "contracts", label: "Contracts" },
];

const MAX_BYTES = 10 * 1024 * 1024;

function iconFor(mime: string): IconName {
  if (mime.startsWith("image/")) return "image-outline";
  if (mime === "application/pdf") return "document-text-outline";
  return "document-outline";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LeadDocuments({ leadId }: { leadId: Id<"leads"> }) {
  const docs = useQuery(api.documents.listByLead, { leadId });
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const upload = useMutation(api.documents.upload);
  const remove = useMutation(api.documents.remove);
  const { run } = useRun();
  const [folder, setFolder] = useState<Folder>("lead_documentation");
  const [uploading, setUploading] = useState(false);

  const send = async (file: PickedFile | null) => {
    if (!file) return;
    if (file.size && file.size > MAX_BYTES) {
      Alert.alert("File too large", `${file.name} is over 10 MB.`);
      return;
    }
    setUploading(true);
    await run(async () => {
      const storageId = await uploadFile(() => generateUploadUrl({}), file);
      let size = file.size;
      if (!size) size = (await (await fetch(file.uri)).blob()).size;
      await upload({ name: file.name, folder, storageId: storageId as Id<"_storage">, mimeType: file.mimeType, size, leadId });
    });
    setUploading(false);
  };

  const inFolder = docs?.filter((d) => d.folder === folder) ?? [];
  const count = (f: Folder) => docs?.filter((d) => d.folder === f).length ?? 0;

  return (
    <Section title="Documents">
      <Chips options={FOLDERS.map((f) => ({ value: f.value, label: count(f.value) ? `${f.label} (${count(f.value)})` : f.label }))} value={folder} onChange={setFolder} />
      <Row>
        <Button small style={{ flex: 1 }} icon="attach-outline" title="Upload file" loading={uploading} onPress={async () => send(await pickDocument())} />
        <Button small style={{ flex: 1 }} variant="secondary" icon="camera-outline" title="Photo" disabled={uploading} onPress={async () => send(await choosePhoto())} />
      </Row>
      {docs === undefined ? (
        <Loading />
      ) : inFolder.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="No documents here" message="Upload an ID copy, proof of funds or contract." />
      ) : (
        inFolder.map((d) => (
          <ListItem
            key={d._id}
            icon={iconFor(d.mimeType)}
            title={d.name}
            subtitle={`${sizeLabel(d.size)} · ${dateLabel(d.createdAt)}`}
            onPress={d.url ? () => WebBrowser.openBrowserAsync(d.url!) : undefined}
            right={
              <Pressable
                hitSlop={12}
                style={{ padding: 4 }}
                accessibilityLabel={`Delete ${d.name}`}
                onPress={async () => {
                  if (await confirm("Delete document", `Delete ${d.name}?`, "Delete", true)) await run(() => remove({ documentId: d._id }));
                }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            }
          />
        ))
      )}
    </Section>
  );
}
