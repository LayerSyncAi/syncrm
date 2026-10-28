"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus, Wrench, X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONDITIONS, type Condition } from "@/lib/stay-ops/labels";
import type { PhotoItem } from "@/lib/stay-ops/photos";
import { cn } from "@/lib/utils";
import { PhotoStrip } from "./photo-strip";

type Detail = NonNullable<FunctionReturnType<typeof api.stay.inspections.get>>;

type RoomState = {
  key: string;
  name: string;
  condition?: Condition;
  note: string;
  photos: PhotoItem[];
};

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

const CONDITION_STYLE: Record<Condition, string> = {
  good: "border-[var(--status-success-fg)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  fair: "border-[var(--status-info-fg)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  poor: "border-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  damaged: "border-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
};

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

  const [date, setDate] = React.useState(inspection.date);
  const [inspector, setInspector] = React.useState<string>(inspection.inspectorUserId);
  const [rooms, setRooms] = React.useState<RoomState[]>(() =>
    inspection.rooms.map((r) => ({
      key: nextKey(),
      name: r.name,
      condition: r.condition,
      note: r.note ?? "",
      photos: r.photos.map((sid, i) => ({ storageId: sid, url: r.photoUrls[i] ?? "" })),
    }))
  );
  const [water, setWater] = React.useState(inspection.meterReadings?.water ?? "");
  const [electricity, setElectricity] = React.useState(inspection.meterReadings?.electricity ?? "");
  const [comments, setComments] = React.useState(inspection.comments ?? "");
  const [newRoom, setNewRoom] = React.useState("");
  const [saveState, setSaveState] = React.useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = React.useState<string | null>(null);
  const [raised, setRaised] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const snapshot = React.useMemo(
    () => ({
      date,
      inspectorUserId: inspector as Id<"users">,
      rooms: rooms.map((r) => ({
        name: r.name,
        condition: r.condition,
        note: r.note,
        photos: r.photos.map((p) => p.storageId as Id<"_storage">),
      })),
      meterReadings: { water: water || undefined, electricity: electricity || undefined },
      comments,
    }),
    [date, inspector, rooms, water, electricity, comments]
  );
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const first = React.useRef(true);

  const flush = React.useCallback(async () => {
    setSaveState("saving");
    try {
      await saveDraft({ id, ...latest.current });
      setSaveState("saved");
      return true;
    } catch (e) {
      setSaveState("error");
      setError(errText(e));
      return false;
    }
  }, [saveDraft, id]);

  // Debounced autosave whenever the form changes.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("dirty");
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [snapshot, flush]);

  const setRoom = (key: string, patch: Partial<RoomState>) =>
    setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    setRooms((rs) => [...rs, { key: nextKey(), name, note: "", photos: [] }]);
    setNewRoom("");
  };

  const raiseFor = async (r: RoomState) => {
    setError(null);
    if (!(await flush())) return;
    try {
      const rid = await raise({ id, roomName: r.name });
      setRaised((m) => ({ ...m, [r.key]: rid }));
    } catch (e) {
      setError(errText(e));
    }
  };

  const finish = async () => {
    if (rooms.some((r) => !r.condition)) {
      setError("Rate every room before completing.");
      return;
    }
    if (!window.confirm("Complete this inspection? The report is locked afterwards. You can still add dated addenda.")) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await flush())) return;
      await complete({ id });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Delete this draft and its photos?")) return;
    try {
      await removeDraft({ id });
      router.push("/app/stay/inspections");
    } catch (e) {
      setError(errText(e));
    }
  };

  const saveAsStandard = async () => {
    try {
      await updateUnitRooms({ unitId: inspection.unitId, rooms: rooms.map((r) => r.name) });
      setError(null);
    } catch (e) {
      setError(errText(e));
    }
  };

  const statusText =
    saveState === "saving" ? "Saving" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Not saved" : "Draft saved";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{inspection.typeLabel} inspection</h1>
        <p className="text-sm text-text-muted">
          {inspection.propertyTitle}, {inspection.unitLabel}
          {inspection.tenantName ? `. Tenant: ${inspection.tenantName}` : ""}
        </p>
      </div>

      {error && <p className="rounded-[10px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">{error}</p>}

      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Inspector</Label>
            <Select value={inspector} onChange={(e) => setInspector(e.target.value)}>
              {(staff ?? []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
              {!(staff ?? []).some((s) => s._id === inspector) && (
                <option value={inspector}>{inspection.inspectorName}</option>
              )}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Water meter</Label>
            <Input inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Electricity meter</Label>
            <Input inputMode="decimal" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rooms.map((r) => (
          <Card key={r.key}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center gap-2">
                <Input
                  value={r.name}
                  onChange={(e) => setRoom(r.key, { name: e.target.value })}
                  aria-label="Room name"
                  className="font-medium"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove room"
                  onClick={() => window.confirm(`Remove ${r.name}?`) && setRooms((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setRoom(r.key, { condition: c.value })}
                    className={cn(
                      "h-11 rounded-[10px] border text-sm font-medium transition-colors",
                      r.condition === c.value ? CONDITION_STYLE[c.value] : "border-border-strong text-text-muted hover:border-primary/60"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={r.note}
                onChange={(e) => setRoom(r.key, { note: e.target.value })}
                rows={2}
                placeholder="Notes"
              />
              <PhotoStrip photos={r.photos} onChange={(photos) => setRoom(r.key, { photos })} />
              {raised[r.key] ? (
                <Link href={`/app/stay/maintenance/${raised[r.key]}`} className="text-sm text-primary-600 underline">
                  Request raised. Open it
                </Link>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => raiseFor(r)}>
                  <Wrench className="h-3.5 w-3.5" />
                  Raise maintenance request
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newRoom}
          onChange={(e) => setNewRoom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRoom()}
          placeholder="Add a room"
        />
        <Button variant="secondary" onClick={addRoom}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {inspection.canSend && (
        <button type="button" onClick={saveAsStandard} className="text-sm text-primary-600 underline">
          Use this room list for all future inspections of this unit
        </button>
      )}

      <div className="space-y-1.5">
        <Label>Overall comments</Label>
        <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4} />
      </div>

      <Button variant="ghost" className="text-danger" onClick={discard}>Delete draft</Button>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-strong bg-card-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">{statusText}</span>
          <Button onClick={finish} disabled={busy}>Complete inspection</Button>
        </div>
      </div>
    </div>
  );
}
