"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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
export function StayDocuments({
  stayPropertyId,
  leaseId,
}: {
  stayPropertyId: Id<"stayProperties">;
  leaseId?: Id<"stayLeases">;
}) {
  const docs = useQuery(
    api.stay.documents.list,
    leaseId ? { leaseId } : { stayPropertyId }
  );
  const generateUploadUrl = useMutation(api.stay.documents.generateUploadUrl);
  const save = useMutation(api.stay.documents.save);
  const setVisibility = useMutation(api.stay.documents.setVisibility);
  const remove = useMutation(api.stay.documents.remove);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState<Kind>(leaseId ? "lease" : "other");
  const [name, setName] = React.useState("");
  const [tenant, setTenant] = React.useState(false);
  const [landlord, setLandlord] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(await generateUploadUrl(), {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await save({
        stayPropertyId,
        leaseId,
        name: name.trim() || file.name,
        kind,
        storageId,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        visibleToTenant: tenant,
        visibleToLandlord: landlord,
      });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="font-medium">Documents</h3>

      <div className="space-y-3 rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Type">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={tenant} onChange={(e) => setTenant(e.target.checked)} />
            Tenant can see
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={landlord} onChange={(e) => setLandlord(e.target.checked)} />
            Landlord can see
          </label>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {busy ? "Uploading" : "Upload file"}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {docs === undefined ? (
        <p className="text-sm text-text-muted">Loading</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-text-muted">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)]">
          {docs.map((d) => (
            <li key={d._id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-text-muted">
                      {KINDS.find((k) => k.value === d.kind)?.label} · {kb(d.size)} · {d.uploadedByName} ·{" "}
                      {new Date(d.createdAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" aria-label="Download">
                      <Button size="sm" variant="ghost"><Download className="h-4 w-4" /></Button>
                    </a>
                  )}
                  {d.canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete"
                      onClick={() => window.confirm(`Delete ${d.name}?`) && remove({ id: d._id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisibility({ id: d._id, visibleToTenant: !d.visibleToTenant, visibleToLandlord: d.visibleToLandlord })
                  }
                >
                  <Badge variant={d.visibleToTenant ? "info" : "neutral"}>
                    Tenant: {d.visibleToTenant ? "visible" : "hidden"}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setVisibility({ id: d._id, visibleToTenant: d.visibleToTenant, visibleToLandlord: !d.visibleToLandlord })
                  }
                >
                  <Badge variant={d.visibleToLandlord ? "info" : "neutral"}>
                    Landlord: {d.visibleToLandlord ? "visible" : "hidden"}
                  </Badge>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
