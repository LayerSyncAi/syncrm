"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoStrip } from "./photo-strip";
import type { PhotoItem } from "@/lib/stay-ops/photos";

/** Modal to log a maintenance request. Pass `unitId` to fix the unit. */
export function MaintenanceForm({
  open,
  onClose,
  unitId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  unitId?: Id<"stayUnits">;
  onCreated?: (id: Id<"stayMaintenance">) => void;
}) {
  const units = useQuery(api.stay.maintenance.unitOptions);
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const create = useMutation(api.stay.maintenance.create);

  const [unit, setUnit] = React.useState<string>(unitId ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setAssignee("");
    setPhotos([]);
    setError(null);
    if (!unitId) setUnit("");
  };

  const save = async () => {
    const target = unitId ?? unit;
    if (!target) return setError("Pick a unit.");
    if (!title.trim()) return setError("Add a short title.");
    setSaving(true);
    setError(null);
    try {
      const id = await create({
        unitId: target as Id<"stayUnits">,
        title,
        description,
        photos: photos.map((p) => p.storageId as Id<"_storage">),
        assigneeUserId: assignee ? (assignee as Id<"users">) : undefined,
      });
      reset();
      onClose();
      onCreated?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New maintenance request"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving" : "Log request"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!unitId && (
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Choose a unit</option>
              {(units ?? []).map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.propertyTitle}, {u.label}
                  {u.tenantName ? ` (${u.tenantName})` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leaking kitchen tap" />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {(staff ?? []).map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Photos</Label>
          <PhotoStrip photos={photos} onChange={setPhotos} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
