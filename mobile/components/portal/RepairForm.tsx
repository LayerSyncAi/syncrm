/** Tenant "Report a repair" sheet: unit, title, description and up to 6 photos. */
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Field, Ionicons, Loading, Select, Sheet } from "../ui";
import { choosePhoto, uploadFile, type PickedFile } from "../../lib/files";
import { useRun } from "../../lib/useRun";
import { colors, space } from "../../lib/theme";

const MAX_PHOTOS = 6;

export function RepairForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const units = useQuery(api.portal.tenant.maintenanceUnits);
  const create = useMutation(api.portal.tenant.createMaintenance);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [leaseId, setLeaseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const { busy, run } = useRun();
  const selected = leaseId || units?.[0]?.leaseId || "";

  const addPhoto = async () => {
    const p = await choosePhoto();
    if (p) setPhotos((prev) => [...prev, p].slice(0, MAX_PHOTOS));
  };

  const submit = async () => {
    const ok = await run(async () => {
      const ids: Id<"_storage">[] = [];
      for (const p of photos) ids.push((await uploadFile(() => generateUploadUrl({}), p)) as Id<"_storage">);
      await create({ leaseId: selected as Id<"stayLeases">, title, description, photos: ids });
      return true;
    });
    if (ok) {
      setTitle("");
      setDescription("");
      setPhotos([]);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Report a repair"
      footer={<Button title="Send request" loading={busy} disabled={!selected || !title.trim() || !description.trim()} onPress={submit} />}
    >
      {units === undefined ? (
        <Loading />
      ) : units.length === 0 ? (
        <Body muted>You need an active lease to report a repair.</Body>
      ) : (
        <>
          {units.length > 1 ? (
            <Select label="Unit" value={selected} options={units.map((u) => ({ value: u.leaseId, label: u.label }))} onChange={setLeaseId} />
          ) : (
            <Body muted>{units[0].label}</Body>
          )}
          <Field label="What is wrong?" value={title} onChangeText={setTitle} />
          <Field label="Describe the problem" value={description} onChangeText={setDescription} multiline numberOfLines={4} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {photos.map((p) => (
              <View key={p.uri}>
                <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: 8 }} />
                <Pressable
                  onPress={() => setPhotos((prev) => prev.filter((x) => x.uri !== p.uri))}
                  accessibilityLabel="Remove photo"
                  style={{ position: "absolute", top: -6, right: -6, backgroundColor: colors.card, borderRadius: 12 }}
                >
                  <Ionicons name="close-circle" size={22} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable
                onPress={addPhoto}
                style={{ width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="camera-outline" size={26} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <Body small muted>Up to {MAX_PHOTOS} photos.</Body>
        </>
      )}
    </Sheet>
  );
}
