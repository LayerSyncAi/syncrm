/**
 * Property documents in folders (port of the web DocumentManager for a
 * property). Only shown to people who may see private data; the backend
 * enforces the same rule and logs admin access.
 */
import { useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Body, Button, Chips, EmptyState, ListItem, Loading, Section, type IconName } from "../../../ui";
import { pickDocument, uploadFile } from "../../../../lib/files";
import { confirm, useRun } from "../../../../lib/useRun";
import { dateLabel } from "../../../../lib/format";
import { space } from "../../../../lib/theme";
import { fileSize } from "../../../../lib/crm/records/properties/labels";

type Folder = "mandates_to_sell" | "contracts" | "id_copies" | "proof_of_funds";

const FOLDERS: Array<{ value: Folder; label: string }> = [
  { value: "mandates_to_sell", label: "Mandates to sell" },
  { value: "contracts", label: "Contracts" },
  { value: "id_copies", label: "ID copies" },
  { value: "proof_of_funds", label: "Proof of funds" },
];

const MAX_BYTES = 10 * 1024 * 1024;

function iconFor(mime: string): IconName {
  if (mime.startsWith("image/")) return "image-outline";
  if (mime === "application/pdf") return "document-text-outline";
  if (mime.includes("sheet") || mime.includes("excel")) return "grid-outline";
  return "document-outline";
}

export function DocumentsPanel({ propertyId }: { propertyId: Id<"properties"> }) {
  const [folder, setFolder] = useState<Folder>("mandates_to_sell");
  const docs = useQuery(api.documents.listByProperty, { propertyId });
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const upload = useMutation(api.documents.upload);
  const remove = useMutation(api.documents.remove);
  const logAdminAccess = useMutation(api.documents.logAdminPropertyDocumentAccess);
  const { busy, run } = useRun();

  // Audit hook: the backend records when an admin opens private documents.
  useEffect(() => {
    logAdminAccess({ propertyId }).catch(() => undefined);
  }, [propertyId, logAdminAccess]);

  const counts = (f: Folder) => docs?.filter((d) => d.folder === f).length ?? 0;
  const inFolder = docs?.filter((d) => d.folder === folder) ?? [];
  const label = FOLDERS.find((f) => f.value === folder)!.label;

  const add = () =>
    run(async () => {
      const file = await pickDocument();
      if (!file) return;
      if (file.size && file.size > MAX_BYTES) {
        Alert.alert("File too large", `${file.name} is over 10 MB.`);
        return;
      }
      const storageId = await uploadFile(() => generateUploadUrl({}), file);
      await upload({
        name: file.name,
        folder,
        storageId: storageId as Id<"_storage">,
        mimeType: file.mimeType || "application/octet-stream",
        size: file.size ?? 0,
        propertyId,
      });
      Alert.alert("Document uploaded", file.name);
    });

  return (
    <Section title="Documents">
      <Chips options={FOLDERS.map((f) => ({ value: f.value, label: counts(f.value) ? `${f.label} (${counts(f.value)})` : f.label }))} value={folder} onChange={setFolder} />
      <Button variant="secondary" icon="cloud-upload-outline" title={`Upload to ${label}`} onPress={add} loading={busy} />
      {docs === undefined ? (
        <Loading />
      ) : inFolder.length === 0 ? (
        <EmptyState icon="folder-open-outline" title={`No documents in ${label}`} message="Upload files to get started." />
      ) : (
        <View style={{ gap: space.sm }}>
          {inFolder.map((d) => (
            <View key={d._id} style={{ gap: space.xs }}>
              <ListItem
                icon={iconFor(d.mimeType)}
                title={d.name}
                subtitle={`${fileSize(d.size)} · ${dateLabel(d.createdAt)}`}
                onPress={d.url ? () => Linking.openURL(d.url!) : undefined}
              />
              <Button
                small
                variant="ghost"
                icon="trash-outline"
                title="Delete"
                onPress={async () => {
                  if (await confirm("Delete document", `${d.name} will be removed for everyone.`, "Delete", true)) {
                    await run(() => remove({ documentId: d._id }));
                  }
                }}
              />
            </View>
          ))}
        </View>
      )}
      <Body small muted>Files up to 10 MB. Tap a document to open it.</Body>
    </Section>
  );
}
