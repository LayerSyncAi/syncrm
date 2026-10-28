import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, Field, Loading, Screen, Select } from "../../../components/ui";
import { PhotoStrip } from "../../../components/stay/ops/photo-strip";
import { useRun } from "../../../lib/useRun";
import type { PhotoItem } from "../../../lib/stay-ops/photos";
import { colors, font, space } from "../../../lib/theme";

/** Log a maintenance request. ?unitId= pre-selects the unit. */
export default function NewMaintenance() {
  const router = useRouter();
  const params = useLocalSearchParams<{ unitId?: string }>();
  const units = useQuery(api.stay.maintenance.unitOptions);
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const create = useMutation(api.stay.maintenance.create);
  const { busy, run } = useRun();

  const [unit, setUnit] = useState(params.unitId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (units === undefined) return <Loading />;

  const save = async () => {
    if (!unit) return setError("Pick a unit.");
    if (!title.trim()) return setError("Add a short title.");
    setError(null);
    const id = await run(() =>
      create({
        unitId: unit as Id<"stayUnits">,
        title,
        description,
        photos: photos.map((p) => p.storageId as Id<"_storage">),
        assigneeUserId: assignee ? (assignee as Id<"users">) : undefined,
      })
    );
    if (id) router.replace(`/stay/maintenance/${id}` as Href);
  };

  return (
    <Screen contentStyle={{ gap: space.lg }}>
      <Stack.Screen options={{ title: "New request" }} />
      <Select
        label="Unit"
        placeholder="Choose a unit"
        value={unit}
        onChange={setUnit}
        options={units.map((u) => ({ value: u.unitId, label: `${u.propertyTitle}, ${u.label}${u.tenantName ? ` (${u.tenantName})` : ""}` }))}
      />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Leaking kitchen tap" error={error && !title.trim() ? error : null} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <Select
        label="Assign to"
        value={assignee}
        onChange={setAssignee}
        options={[{ value: "", label: "Unassigned" }, ...(staff ?? []).map((s) => ({ value: s._id as string, label: s.name }))]}
      />
      <View style={{ gap: space.sm }}>
        <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Photos (up to 6)</Text>
        <PhotoStrip photos={photos} onChange={setPhotos} max={6} />
      </View>
      {error && unit === "" && <Text style={{ color: colors.danger, fontSize: font.sm }}>{error}</Text>}
      <Button title="Log request" loading={busy} onPress={save} />
    </Screen>
  );
}
