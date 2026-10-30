"use client";

/**
 * Inspection form (VW-20..22), built for a phone at the property: large
 * targets, number pads, photos straight from the camera, compressed before
 * upload. Saved as a draft until the valuer marks it complete.
 */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { getErrorMessage } from "@/lib/errors";
import { compressImage, uploadBlob } from "@/lib/worth/image";
import { formatArea, todayIso } from "@/lib/worth/format";
import { cn } from "@/lib/utils";
import { Checkbox, ErrorNote, Field, Section, attempt, numOrUndef, numStr, worthToast } from "./ui";
import type { JobView } from "./job-overview";

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
];

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
  services: Partial<Record<ServiceKey, boolean>>;
  servicesNotes: string;
  landSizeM2: string;
  buildingAreas: Array<{ name: string; areaM2: string }>;
  notes: string;
};

const emptyRooms = () => Object.fromEntries(ROOMS.map(([k]) => [k, ""])) as Record<RoomKey, string>;

export function InspectionForm({ job }: { job: JobView }) {
  const inspection = useQuery(api.worth.inspections.get, { jobId: job._id });
  const save = useMutation(api.worth.inspections.save);
  const complete = useMutation(api.worth.inspections.complete);
  const reopen = useMutation(api.worth.inspections.reopen);
  const addPhoto = useMutation(api.worth.inspections.addPhoto);
  const removePhoto = useMutation(api.worth.inspections.removePhoto);
  const updateCaption = useMutation(api.worth.inspections.updatePhotoCaption);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const editable = job.canWork && ["new", "assigned", "inspected", "draft"].includes(job.status);
  const [f, setF] = React.useState<FormState | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Seed the form once from the saved draft (or blanks).
  React.useEffect(() => {
    if (inspection === undefined || f) return;
    const i = inspection;
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
      rooms: i
        ? (Object.fromEntries(ROOMS.map(([k]) => [k, numStr(i.accommodation[k])])) as Record<RoomKey, string>)
        : { ...emptyRooms(), bedrooms: numStr(job.property?.bedrooms), bathrooms: numStr(job.property?.bathrooms) },
      otherRooms: i?.accommodation.other ?? "",
      services: i ? { ...i.services } : {},
      servicesNotes: i?.services.notes ?? "",
      landSizeM2: numStr(i?.landSizeM2 ?? (job.property?.area || undefined)),
      buildingAreas: i?.buildingAreas.length
        ? i.buildingAreas.map((b) => ({ name: b.name, areaM2: String(b.areaM2) }))
        : [{ name: "Main house", areaM2: "" }],
      notes: i?.notes ?? "",
    });
  }, [inspection, f, job.property]);

  if (inspection === undefined || !f) return <ListSkeleton />;

  const set = (patch: Partial<FormState>) => {
    setF({ ...f, ...patch });
    setDirty(true);
  };

  const payload = () => {
    const services: Partial<Record<ServiceKey, boolean>> = {};
    for (const [k] of SERVICES) if (f.services[k]) services[k] = true;
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
      buildingAreas: f.buildingAreas
        .map((b) => ({ name: b.name.trim(), areaM2: numOrUndef(b.areaM2) ?? 0 }))
        .filter((b) => b.name || b.areaM2 > 0),
      notes: f.notes || undefined,
    };
  };

  const saveDraft = async (quiet = false) => {
    setBusy(true);
    setError(null);
    try {
      await save(payload());
      setDirty(false);
      if (!quiet) worthToast.done("Inspection saved");
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
    await attempt(() => complete({ jobId: job._id }), "Inspection completed");
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((x) => x.type.startsWith("image/"));
    setUploading(list.length);
    for (const file of list) {
      try {
        const blob = await compressImage(file);
        const url = await generateUploadUrl();
        const storageId = await uploadBlob(url, blob, "image/jpeg");
        await addPhoto({ jobId: job._id, storageId: storageId as Id<"_storage"> });
      } catch (e) {
        worthToast.failed(e, `Could not upload ${file.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const totalBuilding = f.buildingAreas.reduce((s, b) => s + (numOrUndef(b.areaM2) ?? 0), 0);
  const completed = inspection?.status === "completed";

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={completed ? "success" : "neutral"}>{completed ? "Completed" : "Draft"}</Badge>
        {dirty && <span className="text-xs text-text-muted">Unsaved changes</span>}
        {!editable && <span className="text-xs text-text-muted">Read only</span>}
      </div>
      <ErrorNote message={error} />

      <fieldset disabled={!editable} className="space-y-4">
        <Section title="Visit">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Inspection date" required>
              <Input type="date" value={f.inspectionDate} onChange={(e) => set({ inspectionDate: e.target.value })} />
            </Field>
            <Field label="Present at inspection">
              <Input value={f.attendees} onChange={(e) => set({ attendees: e.target.value })} placeholder="Owner, tenant, agent" />
            </Field>
            <Field label="Property type">
              <Select value={f.propertyType} onChange={(e) => set({ propertyType: e.target.value })}>
                <option value="">Choose</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Overall condition">
              <div className="grid grid-cols-4 gap-1.5">
                {(["excellent", "good", "fair", "poor"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ condition: f.condition === c ? "" : c })}
                    className={cn(
                      "h-10 rounded-[10px] border text-xs font-medium capitalize",
                      f.condition === c ? "border-primary-600 bg-primary-600 text-primary-foreground" : "border-border-strong text-text-muted"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Construction">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Walls">
              <Input list="worth-walls" value={f.walls} onChange={(e) => set({ walls: e.target.value })} />
            </Field>
            <Field label="Roof">
              <Input list="worth-roof" value={f.roof} onChange={(e) => set({ roof: e.target.value })} />
            </Field>
            <Field label="Floors">
              <Input list="worth-floors" value={f.floors} onChange={(e) => set({ floors: e.target.value })} />
            </Field>
            <Field label="Ceilings">
              <Input value={f.ceilings} onChange={(e) => set({ ceilings: e.target.value })} />
            </Field>
            <Field label="Windows">
              <Input value={f.windows} onChange={(e) => set({ windows: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year built">
                <Input inputMode="numeric" value={f.yearBuilt} onChange={(e) => set({ yearBuilt: e.target.value })} />
              </Field>
              <Field label="Storeys">
                <Input inputMode="numeric" value={f.storeys} onChange={(e) => set({ storeys: e.target.value })} />
              </Field>
            </div>
          </div>
          <datalist id="worth-walls">
            <option value="Face brick" />
            <option value="Plastered and painted brick" />
            <option value="Concrete block" />
          </datalist>
          <datalist id="worth-roof">
            <option value="Concrete tiles on timber trusses" />
            <option value="IBR sheeting" />
            <option value="Asbestos sheeting" />
            <option value="Thatch" />
            <option value="Concrete slab" />
          </datalist>
          <datalist id="worth-floors">
            <option value="Ceramic tiles" />
            <option value="Porcelain tiles" />
            <option value="Wooden parquet" />
            <option value="Screed" />
          </datalist>
        </Section>

        <Section title="Accommodation">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ROOMS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  inputMode="numeric"
                  value={f.rooms[k]}
                  onChange={(e) => set({ rooms: { ...f.rooms, [k]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
          <Field label="Other rooms and features" className="mt-3">
            <Input value={f.otherRooms} onChange={(e) => set({ otherRooms: e.target.value })} placeholder="Pantry, scullery, cottage" />
          </Field>
        </Section>

        <Section title="Services">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(([k, label]) => (
              <Checkbox
                key={k}
                label={label}
                checked={!!f.services[k]}
                disabled={!editable}
                onChange={(v) => set({ services: { ...f.services, [k]: v } })}
              />
            ))}
          </div>
          <Field label="Services notes" className="mt-3">
            <Input value={f.servicesNotes} onChange={(e) => set({ servicesNotes: e.target.value })} placeholder="Water storage tanks, generator" />
          </Field>
        </Section>

        <Section title="Land and buildings" description={totalBuilding > 0 ? `Total building area ${formatArea(totalBuilding)}` : undefined}>
          <Field label="Land size (m²)" hint="1 hectare is 10,000 m².">
            <Input inputMode="decimal" value={f.landSizeM2} onChange={(e) => set({ landSizeM2: e.target.value })} />
          </Field>
          <div className="mt-3 space-y-2">
            {f.buildingAreas.map((b, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={i === 0 ? "Building" : ""} className="flex-1">
                  <Input
                    value={b.name}
                    onChange={(e) =>
                      set({ buildingAreas: f.buildingAreas.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                    }
                    placeholder="Main house, cottage, garage"
                  />
                </Field>
                <Field label={i === 0 ? "Area (m²)" : ""} className="w-28">
                  <Input
                    inputMode="decimal"
                    value={b.areaM2}
                    onChange={(e) =>
                      set({ buildingAreas: f.buildingAreas.map((x, j) => (j === i ? { ...x, areaM2: e.target.value } : x)) })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-10 p-0"
                  aria-label="Remove building"
                  onClick={() => set({ buildingAreas: f.buildingAreas.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => set({ buildingAreas: [...f.buildingAreas, { name: "", areaM2: "" }] })}
            >
              <Plus className="h-4 w-4" />
              Add building
            </Button>
          </div>
        </Section>

        <Section title="Notes">
          <Textarea rows={5} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Defects, improvements, neighbourhood, anything that affects value" />
        </Section>
      </fieldset>

      <Section
        title="Photos"
        description="Photos are reduced to about 300 KB each before upload."
        actions={
          editable && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
                <Camera className="h-4 w-4" />
                {uploading > 0 ? `Uploading ${uploading}...` : "Add photos"}
              </Button>
            </>
          )
        }
      >
        {inspection?.photos.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inspection.photos.map((p) => (
              <div key={p.storageId} className="space-y-1.5">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2">
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.caption ?? "Inspection photo"} className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {editable && (
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => attempt(() => removePhoto({ jobId: job._id, storageId: p.storageId }))}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  className="h-8 text-xs"
                  disabled={!editable}
                  defaultValue={p.caption ?? ""}
                  placeholder="Caption"
                  onBlur={(e) => {
                    if (e.target.value !== (p.caption ?? "")) {
                      void attempt(() => updateCaption({ jobId: job._id, storageId: p.storageId, caption: e.target.value }));
                    }
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No photos yet.</p>
        )}
      </Section>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card-bg/95 p-3 backdrop-blur md:static md:z-auto md:justify-end md:border-0 md:bg-transparent md:p-0">
          {completed ? (
            <Button variant="secondary" className="flex-1 md:flex-none" onClick={() => attempt(() => reopen({ jobId: job._id }))}>
              Reopen
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1 md:flex-none" onClick={markComplete} disabled={busy}>
              Mark complete
            </Button>
          )}
          <Button className="flex-1 md:flex-none" onClick={() => saveDraft()} disabled={busy}>
            {busy ? "Saving..." : completed ? "Save changes" : "Save draft"}
          </Button>
        </div>
      )}
    </div>
  );
}
