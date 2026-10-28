import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, DateField, Field, Row, Screen, Section, Select } from "../../ui";
import { ConditionChips } from "./condition-chips";
import { PhotoStrip } from "./photo-strip";
import { getErrorMessage } from "@/lib/errors";
import { confirm } from "../../../lib/useRun";
import { toPhotoItems, type PhotoItem } from "../../../lib/stay-ops/photos";
import { colors, font, space } from "../../../lib/theme";
import type { Condition } from "@/lib/stay-ops/labels";

type Detail = NonNullable<FunctionReturnType<typeof api.stay.inspections.get>>;
type RoomState = { key: string; name: string; condition?: Condition; note: string; photos: PhotoItem[] };
type SaveState = "saved" | "dirty" | "saving" | "error";

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

/** Phone-first draft editor. Changes save automatically a moment after you stop typing. */
export function InspectionEditor({ inspection }: { inspection: Detail }) {
  const router = useRouter();
  const id = inspection._id;
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const saveDraft = useMutation(api.stay.inspections.saveDraft);
  const complete = useMutation(api.stay.inspections.complete);
  const removeDraft = useMutation(api.stay.inspections.removeDraft);
  const raise = useMutation(api.stay.inspections.raiseMaintenance);
  const updateUnitRooms = useMutation(api.stay.inspections.updateUnitRooms);

  const [date, setDate] = useState(inspection.date);
  const [inspector, setInspector] = useState<string>(inspection.inspectorUserId);
  const [rooms, setRooms] = useState<RoomState[]>(() =>
    inspection.rooms.map((r) => ({ key: nextKey(), name: r.name, condition: r.condition, note: r.note ?? "", photos: toPhotoItems(r.photos, r.photoUrls) }))
  );
  const [water, setWater] = useState(inspection.meterReadings?.water ?? "");
  const [electricity, setElectricity] = useState(inspection.meterReadings?.electricity ?? "");
  const [comments, setComments] = useState(inspection.comments ?? "");
  const [newRoom, setNewRoom] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [raised, setRaised] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const snapshot = useMemo(
    () => ({
      date,
      inspectorUserId: inspector as Id<"users">,
      rooms: rooms.map((r) => ({ name: r.name, condition: r.condition, note: r.note, photos: r.photos.map((p) => p.storageId as Id<"_storage">) })),
      meterReadings: { water: water || undefined, electricity: electricity || undefined },
      comments,
    }),
    [date, inspector, rooms, water, electricity, comments]
  );
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const first = useRef(true);

  const flush = useCallback(async () => {
    setSaveState("saving");
    try {
      await saveDraft({ id, ...latest.current });
      setSaveState("saved");
      setError(null);
      return true;
    } catch (e) {
      setSaveState("error");
      setError(getErrorMessage(e));
      return false;
    }
  }, [saveDraft, id]);

  // Debounced autosave whenever the form changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("dirty");
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [snapshot, flush]);

  const setRoom = (key: string, patch: Partial<RoomState>) => setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    setRooms((rs) => [...rs, { key: nextKey(), name, note: "", photos: [] }]);
    setNewRoom("");
  };

  const raiseFor = async (r: RoomState) => {
    if (!(await flush())) return;
    try {
      const rid = await raise({ id, roomName: r.name });
      setRaised((m) => ({ ...m, [r.key]: rid }));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const finish = async () => {
    if (rooms.some((r) => !r.condition)) return setError("Rate every room before completing.");
    if (!(await confirm("Complete inspection", "The report is locked afterwards. You can still add dated addenda.", "Complete"))) return;
    setBusy(true);
    try {
      if (await flush()) await complete({ id });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!(await confirm("Delete draft", "Delete this draft and its photos?", "Delete", true))) return;
    try {
      await removeDraft({ id });
      router.back();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const saveAsStandard = async () => {
    try {
      await updateUnitRooms({ unitId: inspection.unitId, rooms: rooms.map((r) => r.name) });
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const statusText = saveState === "saving" ? "Saving" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Not saved" : "Draft saved";
  const inspectors = [...(staff ?? []).map((s) => ({ value: s._id as string, label: s.name }))];
  if (!inspectors.some((s) => s.value === inspector)) inspectors.push({ value: inspector, label: inspection.inspectorName });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Screen contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{inspection.typeLabel} inspection</Text>
          <Body muted small>{`${inspection.propertyTitle}, ${inspection.unitLabel}${inspection.tenantName ? `. Tenant: ${inspection.tenantName}` : ""}`}</Body>
        </View>

        {error && <Text style={{ color: colors.danger, fontSize: font.sm }}>{error}</Text>}

        <Card style={{ gap: space.md }}>
          <DateField label="Date" value={date} onChange={setDate} />
          <Select label="Inspector" value={inspector} onChange={setInspector} options={inspectors} />
          <Field label="Water meter" value={water} onChangeText={setWater} keyboardType="decimal-pad" onBlur={() => void flush()} />
          <Field label="Electricity meter" value={electricity} onChangeText={setElectricity} keyboardType="decimal-pad" onBlur={() => void flush()} />
        </Card>

        <Section title="Rooms">
          {rooms.map((r) => (
            <Card key={r.key} style={{ gap: space.md }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="Room name" value={r.name} onChangeText={(name) => setRoom(r.key, { name })} onBlur={() => void flush()} />
                </View>
                <Button
                  small
                  variant="danger"
                  icon="trash-outline"
                  title=""
                  onPress={async () => {
                    if (await confirm("Remove room", `Remove ${r.name}?`, "Remove", true)) setRooms((rs) => rs.filter((x) => x.key !== r.key));
                  }}
                />
              </Row>
              <ConditionChips value={r.condition} onChange={(condition) => setRoom(r.key, { condition })} />
              <Field label="Notes" value={r.note} onChangeText={(note) => setRoom(r.key, { note })} multiline onBlur={() => void flush()} />
              <PhotoStrip photos={r.photos} onChange={(photos) => setRoom(r.key, { photos })} />
              {raised[r.key] ? (
                <Button small variant="ghost" icon="open-outline" title="Request raised. Open it" onPress={() => router.push(`/stay/maintenance/${raised[r.key]}` as Href)} />
              ) : (
                <Button small variant="secondary" icon="construct-outline" title="Raise maintenance request" onPress={() => raiseFor(r)} />
              )}
            </Card>
          ))}
          <Card style={{ gap: space.md }}>
            <Field label="Add a room" value={newRoom} onChangeText={setNewRoom} placeholder="Room name" returnKeyType="done" onSubmitEditing={addRoom} />
            <Button variant="secondary" icon="add" title="Add room" onPress={addRoom} />
            {inspection.canSend && (
              <Button small variant="ghost" title="Use this room list for future inspections of this unit" onPress={saveAsStandard} />
            )}
          </Card>
        </Section>

        <Field label="Overall comments" value={comments} onChangeText={setComments} multiline onBlur={() => void flush()} />

        <Button variant="danger" title="Delete draft" onPress={discard} />
      </Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, padding: space.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ fontSize: font.sm, color: saveState === "error" ? colors.danger : colors.muted }}>{statusText}</Text>
        <Button title="Complete inspection" loading={busy} onPress={finish} />
      </View>
    </KeyboardAvoidingView>
  );
}
