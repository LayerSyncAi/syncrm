/**
 * Inspection form (VW-20..22), filled in on the phone at the property: number
 * pads, photos straight from the camera, compressed before upload. Saved as a
 * draft until the valuer marks it complete.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, CheckList, Chips, DateField, Field, Ionicons, Loading, Row, Select } from "../ui";
import { uploadFile } from "../../lib/files";
import { useRun, confirm } from "../../lib/useRun";
import { colors, font, radius, space } from "../../lib/theme";
import { choosePhotos } from "../../lib/worth/files";
import { formatArea, isEditableStatus, numOrUndef, numStr, todayIso, type JobView } from "../../lib/worth/util";
import { Actions, ErrorNote, Pair, Panel } from "./bits";
import { toast } from "../../lib/toast";

const PROPERTY_TYPES = [
  "Detached house",
  "Cluster or townhouse",
  "Flat or apartment",
  "Vacant residential stand",
  "Office",
  "Retail",
  "Industrial or warehouse",
  "Mixed use",
  "Agricultural",
  "Other",
].map((t) => ({ value: t, label: t }));

const ROOMS = [
  ["bedrooms", "Bedrooms"],
  ["bathrooms", "Bathrooms"],
  ["ensuites", "En-suites"],
  ["lounges", "Lounges"],
  ["diningRooms", "Dining rooms"],
  ["kitchens", "Kitchens"],
  ["studies", "Studies"],
  ["garages", "Garages"],
  ["carports", "Carports"],
  ["staffQuarters", "Staff quarters"],
] as const;

const SERVICES = [
  ["municipalWater", "Municipal water"],
  ["borehole", "Borehole"],
  ["electricity", "Mains electricity"],
  ["solar", "Solar"],
  ["sewer", "Mains sewer"],
  ["septicTank", "Septic tank"],
  ["tarredRoad", "Tarred road"],
  ["boundaryWall", "Boundary wall"],
  ["electricFence", "Electric fence"],
  ["pool", "Swimming pool"],
] as const;

const SUGGEST = {
  walls: ["Face brick", "Plastered and painted brick", "Concrete block"],
  roof: ["Concrete tiles on timber trusses", "IBR sheeting", "Asbestos sheeting", "Thatch", "Concrete slab"],
  floors: ["Ceramic tiles", "Porcelain tiles", "Wooden parquet", "Screed"],
};

type RoomKey = (typeof ROOMS)[number][0];
type ServiceKey = (typeof SERVICES)[number][0];
type Condition = "excellent" | "good" | "fair" | "poor";

type FormState = {
  inspectionDate: string;
  attendees: string;
  propertyType: string;
  condition: Condition | "";
  walls: string;
  roof: string;
  floors: string;
  ceilings: string;
  windows: string;
  yearBuilt: string;
  storeys: string;
  rooms: Record<RoomKey, string>;
  otherRooms: string;
  services: ServiceKey[];
  servicesNotes: string;
  landSizeM2: string;
  buildingAreas: Array<{ name: string; areaM2: string }>;
  notes: string;
};

/** Quick fills under a text field, like the website's suggestion lists. */
function Suggest({ options, onPick }: { options: string[]; onPick: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -4 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function InspectionForm({ job }: { job: JobView }) {
  const inspection = useQuery(api.worth.inspections.get, { jobId: job._id });
  const save = useMutation(api.worth.inspections.save);
  const complete = useMutation(api.worth.inspections.complete);
  const reopen = useMutation(api.worth.inspections.reopen);
  const addPhoto = useMutation(api.worth.inspections.addPhoto);
  const removePhoto = useMutation(api.worth.inspections.removePhoto);
  const updateCaption = useMutation(api.worth.inspections.updatePhotoCaption);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { run } = useRun();

  const editable = job.canWork && isEditableStatus(job.status);
  const [f, setF] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once from the saved draft (or blanks).
  useEffect(() => {
    if (inspection === undefined || f) return;
    const i = inspection;
    const rooms = Object.fromEntries(ROOMS.map(([k]) => [k, numStr(i?.accommodation[k])])) as Record<RoomKey, string>;
    if (!i) {
      rooms.bedrooms = numStr(job.property?.bedrooms);
      rooms.bathrooms = numStr(job.property?.bathrooms);
    }
    setF({
      inspectionDate: i?.inspectionDate ?? todayIso(),
      attendees: i?.attendees ?? "",
      propertyType: i?.propertyType ?? "",
      condition: i?.condition ?? "",
      walls: i?.construction.walls ?? "",
      roof: i?.construction.roof ?? "",
      floors: i?.construction.floors ?? "",
      ceilings: i?.construction.ceilings ?? "",
      windows: i?.construction.windows ?? "",
      yearBuilt: numStr(i?.construction.yearBuilt),
      storeys: numStr(i?.construction.storeys),
      rooms,
      otherRooms: i?.accommodation.other ?? "",
      services: i ? SERVICES.map(([k]) => k).filter((k) => i.services[k]) : [],
      servicesNotes: i?.services.notes ?? "",
      landSizeM2: numStr(i?.landSizeM2 ?? (job.property?.area || undefined)),
      buildingAreas: i?.buildingAreas.length ? i.buildingAreas.map((b) => ({ name: b.name, areaM2: String(b.areaM2) })) : [{ name: "Main house", areaM2: "" }],
      notes: i?.notes ?? "",
    });
  }, [inspection, f, job.property]);

  if (inspection === undefined || !f) return <Loading />;

  const set = (patch: Partial<FormState>) => {
    setF({ ...f, ...patch });
    setDirty(true);
  };

  const payload = () => {
    const services: Partial<Record<ServiceKey, boolean>> = {};
    for (const k of f.services) services[k] = true;
    return {
      jobId: job._id,
      inspectionDate: f.inspectionDate || undefined,
      attendees: f.attendees || undefined,
      propertyType: f.propertyType || undefined,
      condition: f.condition || undefined,
      construction: {
        walls: f.walls.trim() || undefined,
        roof: f.roof.trim() || undefined,
        floors: f.floors.trim() || undefined,
        ceilings: f.ceilings.trim() || undefined,
        windows: f.windows.trim() || undefined,
        yearBuilt: numOrUndef(f.yearBuilt),
        storeys: numOrUndef(f.storeys),
      },
      accommodation: {
        ...(Object.fromEntries(ROOMS.map(([k]) => [k, numOrUndef(f.rooms[k])])) as Record<RoomKey, number | undefined>),
        other: f.otherRooms.trim() || undefined,
      },
      services: { ...services, notes: f.servicesNotes.trim() || undefined },
      landSizeM2: numOrUndef(f.landSizeM2),
      buildingAreas: f.buildingAreas.map((b) => ({ name: b.name.trim(), areaM2: numOrUndef(b.areaM2) ?? 0 })).filter((b) => b.name || b.areaM2 > 0),
      notes: f.notes || undefined,
    };
  };

  const saveDraft = async (quiet = false) => {
    setBusy(true);
    setError(null);
    try {
      await save(payload());
      setDirty(false);
      if (!quiet) toast.success("Inspection saved");
      return true;
    } catch (e) {
      setError(getErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const markComplete = async () => {
    if (!(await saveDraft(true))) return;
    await run(() => complete({ jobId: job._id }), { success: "Inspection completed" });
  };

  const addPhotos = async () => {
    const files = await choosePhotos();
    if (!files.length) return;
    setUploading(files.length);
    for (const file of files) {
      await run(async () => {
        const storageId = await uploadFile(() => generateUploadUrl({}), file);
        await addPhoto({ jobId: job._id, storageId: storageId as Id<"_storage"> });
      });
      setUploading((n) => n - 1);
    }
  };

  const totalBuilding = f.buildingAreas.reduce((s, b) => s + (numOrUndef(b.areaM2) ?? 0), 0);
  const completed = inspection?.status === "completed";
  const ro = !editable;

  return (
    <View style={{ gap: space.lg }}>
      <Row>
        <Badge tone={completed ? "success" : "neutral"} label={completed ? "Completed" : "Draft"} />
        {dirty && <Body small muted>Unsaved changes</Body>}
        {ro && <Body small muted>Read only</Body>}
      </Row>
      <ErrorNote message={error} />

      <View pointerEvents={ro ? "none" : "auto"} style={{ gap: space.lg }}>
        <Panel title="Visit">
          <DateField label="Inspection date" value={f.inspectionDate} onChange={(v) => set({ inspectionDate: v })} />
          <Field label="Present at inspection" value={f.attendees} onChangeText={(t) => set({ attendees: t })} placeholder="Owner, tenant, agent" editable={!ro} />
          <Select label="Property type" value={f.propertyType} options={PROPERTY_TYPES} onChange={(v) => set({ propertyType: v })} />
          <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Overall condition</Text>
          <Chips
            options={[
              { value: "excellent", label: "Excellent" },
              { value: "good", label: "Good" },
              { value: "fair", label: "Fair" },
              { value: "poor", label: "Poor" },
            ]}
            value={f.condition as Condition}
            onChange={(c) => set({ condition: f.condition === c ? "" : c })}
          />
        </Panel>

        <Panel title="Construction">
          <Field label="Walls" value={f.walls} onChangeText={(t) => set({ walls: t })} editable={!ro} />
          {!ro && <Suggest options={SUGGEST.walls} onPick={(v) => set({ walls: v })} />}
          <Field label="Roof" value={f.roof} onChangeText={(t) => set({ roof: t })} editable={!ro} />
          {!ro && <Suggest options={SUGGEST.roof} onPick={(v) => set({ roof: v })} />}
          <Field label="Floors" value={f.floors} onChangeText={(t) => set({ floors: t })} editable={!ro} />
          {!ro && <Suggest options={SUGGEST.floors} onPick={(v) => set({ floors: v })} />}
          <Field label="Ceilings" value={f.ceilings} onChangeText={(t) => set({ ceilings: t })} editable={!ro} />
          <Field label="Windows" value={f.windows} onChangeText={(t) => set({ windows: t })} editable={!ro} />
          <Pair>
            <Field label="Year built" value={f.yearBuilt} onChangeText={(t) => set({ yearBuilt: t })} keyboardType="number-pad" editable={!ro} />
            <Field label="Storeys" value={f.storeys} onChangeText={(t) => set({ storeys: t })} keyboardType="number-pad" editable={!ro} />
          </Pair>
        </Panel>

        <Panel title="Accommodation">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {ROOMS.map(([k, label]) => (
              <View key={k} style={{ width: "48%" }}>
                <Field label={label} value={f.rooms[k]} onChangeText={(t) => set({ rooms: { ...f.rooms, [k]: t } })} keyboardType="number-pad" editable={!ro} />
              </View>
            ))}
          </View>
          <Field label="Other rooms and features" value={f.otherRooms} onChangeText={(t) => set({ otherRooms: t })} placeholder="Pantry, scullery, cottage" editable={!ro} />
        </Panel>

        <Panel title="Services">
          <CheckList options={SERVICES.map(([k, label]) => ({ value: k, label }))} value={f.services} onChange={(v) => set({ services: v })} />
          <Field label="Services notes" value={f.servicesNotes} onChangeText={(t) => set({ servicesNotes: t })} placeholder="Water storage tanks, generator" editable={!ro} />
        </Panel>

        <Panel title="Land and buildings" description={totalBuilding > 0 ? `Total building area ${formatArea(totalBuilding)}` : undefined}>
          <Field label="Land size (m²)" hint="1 hectare is 10,000 m²." value={f.landSizeM2} onChangeText={(t) => set({ landSizeM2: t })} keyboardType="decimal-pad" editable={!ro} />
          {f.buildingAreas.map((b, i) => (
            <Row key={i} style={{ alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={i === 0 ? "Building" : " "}
                  value={b.name}
                  placeholder="Main house, cottage"
                  editable={!ro}
                  onChangeText={(t) => set({ buildingAreas: f.buildingAreas.map((x, j) => (j === i ? { ...x, name: t } : x)) })}
                />
              </View>
              <View style={{ width: 96 }}>
                <Field
                  label={i === 0 ? "Area (m²)" : " "}
                  value={b.areaM2}
                  keyboardType="decimal-pad"
                  editable={!ro}
                  onChangeText={(t) => set({ buildingAreas: f.buildingAreas.map((x, j) => (j === i ? { ...x, areaM2: t } : x)) })}
                />
              </View>
              {!ro && (
                <Pressable accessibilityLabel="Remove building" hitSlop={8} style={{ paddingBottom: 14 }} onPress={() => set({ buildingAreas: f.buildingAreas.filter((_, j) => j !== i) })}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              )}
            </Row>
          ))}
          {!ro && <Button small variant="secondary" icon="add" title="Add building" onPress={() => set({ buildingAreas: [...f.buildingAreas, { name: "", areaM2: "" }] })} />}
        </Panel>

        <Panel title="Notes">
          <Field label="Inspection notes" value={f.notes} onChangeText={(t) => set({ notes: t })} multiline placeholder="Defects, improvements, neighbourhood, anything that affects value" editable={!ro} />
        </Panel>
      </View>

      <Panel
        title="Photos"
        description="Photos are reduced to about 300 KB each before upload."
        right={editable && <Button small icon="camera-outline" title={uploading > 0 ? `Uploading ${uploading}` : "Add"} loading={uploading > 0} onPress={addPhotos} />}
      >
        {inspection?.photos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {inspection.photos.map((p) => (
              <View key={p.storageId} style={{ width: "48%", gap: 4 }}>
                <View style={{ aspectRatio: 4 / 3, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface }}>
                  {p.url && <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}
                  {editable && (
                    <Pressable
                      accessibilityLabel="Remove photo"
                      onPress={async () => {
                        if (await confirm("Remove photo", "The photo is deleted from the inspection.", "Remove", true)) {
                          void run(() => removePhoto({ jobId: job._id, storageId: p.storageId }));
                        }
                      }}
                      style={{ position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, padding: 5 }}
                    >
                      <Ionicons name="trash-outline" size={15} color="#fff" />
                    </Pressable>
                  )}
                </View>
                <TextInput
                  defaultValue={p.caption ?? ""}
                  placeholder="Caption"
                  placeholderTextColor={colors.faint}
                  editable={editable}
                  style={{ fontSize: font.sm, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 }}
                  onEndEditing={(e) => {
                    const caption = e.nativeEvent.text;
                    if (caption !== (p.caption ?? "")) void run(() => updateCaption({ jobId: job._id, storageId: p.storageId, caption }));
                  }}
                />
              </View>
            ))}
          </View>
        ) : (
          <Body muted small>
            No photos yet.
          </Body>
        )}
      </Panel>

      {editable && (
        <Actions>
          {completed ? (
            <Button variant="secondary" title="Reopen" style={{ flex: 1 }} onPress={() => run(() => reopen({ jobId: job._id }))} />
          ) : (
            <Button variant="secondary" title="Mark complete" style={{ flex: 1 }} onPress={markComplete} disabled={busy} />
          )}
          <Button title={completed ? "Save changes" : "Save draft"} style={{ flex: 1 }} loading={busy} onPress={() => saveDraft()} />
        </Actions>
      )}
    </View>
  );
}
