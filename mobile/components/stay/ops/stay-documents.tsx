import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, Chips, Field, Ionicons, Row, Section, Toggle } from "../../ui";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel } from "../../../lib/format";
import { choosePhoto, pickDocument, uploadFile, type PickedFile } from "../../../lib/files";
import { confirm, useRun } from "../../../lib/useRun";

const KINDS = [
  { value: "lease", label: "Lease" },
  { value: "id_copy", label: "ID copy" },
  { value: "inspection", label: "Inspection" },
  { value: "statement", label: "Statement" },
  { value: "other", label: "Other" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Documents for a property, or for one lease when `leaseId` is given.
 * Staff upload, choose who may see each file in the portals, and delete
 * (directors, or whoever uploaded it).
 */
export function StayDocuments({ stayPropertyId, leaseId }: { stayPropertyId: Id<"stayProperties">; leaseId?: Id<"stayLeases"> }) {
  const docs = useQuery(api.stay.documents.list, leaseId ? { leaseId } : { stayPropertyId });
  const generateUploadUrl = useMutation(api.stay.documents.generateUploadUrl);
  const save = useMutation(api.stay.documents.save);
  const setVisibility = useMutation(api.stay.documents.setVisibility);
  const remove = useMutation(api.stay.documents.remove);
  const { busy, run } = useRun();

  const [kind, setKind] = useState<Kind>(leaseId ? "lease" : "other");
  const [name, setName] = useState("");
  const [tenant, setTenant] = useState(false);
  const [landlord, setLandlord] = useState(false);

  const upload = (pick: () => Promise<PickedFile | null>) =>
    run(async () => {
      const file = await pick();
      if (!file) return;
      const storageId = await uploadFile(() => generateUploadUrl({}), file);
      await save({
        stayPropertyId,
        leaseId,
        name: name.trim() || file.name,
        kind,
        storageId: storageId as Id<"_storage">,
        mimeType: file.mimeType,
        size: file.size ?? 0,
        visibleToTenant: tenant,
        visibleToLandlord: landlord,
      });
      setName("");
    });

  return (
    <Section title="Documents">
      <Card style={{ gap: space.md }}>
        <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="Defaults to the file name" />
        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Type</Text>
          <Chips options={KINDS.map((k) => ({ value: k.value, label: k.label }))} value={kind} onChange={setKind} />
        </View>
        <Toggle label="Tenant can see" value={tenant} onChange={setTenant} />
        <Toggle label="Landlord can see" value={landlord} onChange={setLandlord} />
        <Row>
          <Button style={{ flex: 1 }} variant="secondary" icon="document-attach-outline" title="Choose file" loading={busy} onPress={() => upload(() => pickDocument())} />
          <Button style={{ flex: 1 }} variant="secondary" icon="camera-outline" title="Photo" disabled={busy} onPress={() => upload(() => choosePhoto())} />
        </Row>
      </Card>

      {docs === undefined ? (
        <Body muted>Loading</Body>
      ) : docs.length === 0 ? (
        <Body muted>No documents yet.</Body>
      ) : (
        docs.map((d) => (
          <Card key={d._id} style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <Ionicons name="document-text-outline" size={20} color={colors.muted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
                  {d.name}
                </Text>
                <Body small muted>
                  {`${KINDS.find((k) => k.value === d.kind)?.label} · ${kb(d.size)} · ${d.uploadedByName} · ${dateLabel(d.createdAt)}`}
                </Body>
              </View>
              {d.url ? <Button small variant="ghost" icon="open-outline" title="Open" onPress={() => Linking.openURL(d.url!)} /> : null}
            </Row>
            <Row>
              <Button
                small
                variant="secondary"
                title={`Tenant: ${d.visibleToTenant ? "visible" : "hidden"}`}
                onPress={() => run(() => setVisibility({ id: d._id, visibleToTenant: !d.visibleToTenant, visibleToLandlord: d.visibleToLandlord }))}
              />
              <Button
                small
                variant="secondary"
                title={`Landlord: ${d.visibleToLandlord ? "visible" : "hidden"}`}
                onPress={() => run(() => setVisibility({ id: d._id, visibleToTenant: d.visibleToTenant, visibleToLandlord: !d.visibleToLandlord }))}
              />
              {d.canDelete && (
                <Button
                  small
                  variant="danger"
                  icon="trash-outline"
                  title="Delete"
                  onPress={async () => {
                    if (await confirm("Delete document", `Delete ${d.name}?`, "Delete", true)) await run(() => remove({ id: d._id }));
                  }}
                />
              )}
            </Row>
          </Card>
        ))
      )}
    </Section>
  );
}
