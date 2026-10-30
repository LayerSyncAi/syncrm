"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";

type Form = {
  name: string;
  defaultCurrency: "USD" | "ZiG";
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
};

/**
 * Agency details printed on receipts, statements and reports. Admins edit;
 * everyone else reads.
 */
export default function AgencySettingsPage() {
  const settings = useQuery(api.hub.getOrgSettings);
  const hubContext = useQuery(api.hub.getContext);
  const update = useMutation(api.hub.updateOrgSettings);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = !!hubContext?.isAdmin;
  const branches = useQuery(api.hub.listBranches);
  const branding = useQuery(api.branding.get);

  // Seed the form once the saved values arrive.
  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      animatedToast.error("Agency name is required");
      return;
    }
    setSaving(true);
    try {
      await update(form);
      animatedToast.success("Agency settings saved");
    } catch (err) {
      animatedToast.error("Could not save settings", { description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (settings === undefined || hubContext === undefined || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Agency settings</h1>
        <p className="text-sm text-text-muted">
          These details appear on receipts, statements and reports.
          {!canEdit && " Only admins can change them."}
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-h3">Agency details</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agency-name">Agency name</Label>
            <Input id="agency-name" value={form.name} readOnly={!canEdit} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-currency">Default currency</Label>
            <Select
              id="agency-currency"
              value={form.defaultCurrency}
              disabled={!canEdit}
              onChange={(e) => set("defaultCurrency", e.target.value as "USD" | "ZiG")}
            >
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-address">Address</Label>
            <Input id="agency-address" value={form.address} readOnly={!canEdit} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agency-phone">Phone</Label>
              <Input id="agency-phone" value={form.phone} readOnly={!canEdit} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency-email">Email</Label>
              <Input id="agency-email" type="email" value={form.email} readOnly={!canEdit} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-vat">VAT number</Label>
            <Input id="agency-vat" value={form.vatNumber} readOnly={!canEdit} onChange={(e) => set("vatNumber", e.target.value)} />
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <LogoCard logoUrl={branding?.logoUrl} canEdit={canEdit} />
      <BranchesCard branches={branches} canEdit={canEdit} />
    </div>
  );
}

/**
 * The agency logo. It is the same file as the SyncMedia brand kit's main
 * logo, so receipts, statements and brochures always carry one logo.
 */
function LogoCard({ logoUrl, canEdit }: { logoUrl: string | undefined; canEdit: boolean }) {
  const saveBranding = useMutation(api.branding.save);
  const clearLogo = useMutation(api.branding.clearLogo);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      animatedToast.error("That file is not an image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      animatedToast.error("Logos must be 2 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json();
      // Store the storage id, as the brand kit does, so the blob stays deletable.
      await saveBranding({ logoRef: storageId as string });
      animatedToast.success("Logo saved");
    } catch (err) {
      animatedToast.error("Could not save the logo", { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await clearLogo({ which: "logo" });
      animatedToast.success("Logo removed");
    } catch (err) {
      animatedToast.error("Could not remove the logo", { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-h3">Logo</h2>
        <p className="text-sm text-text-muted">Also used by SyncMedia brochures.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-border bg-surface-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Agency logo" className="max-h-16 max-w-36 object-contain" />
          ) : (
            <span className="text-xs text-text-muted">No logo</span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={upload} />
            <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {logoUrl ? "Replace" : "Upload"}
            </Button>
            {logoUrl && (
              <Button variant="secondary" onClick={remove} disabled={busy} aria-label="Remove logo">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type BranchRow = { id: string; name: string; userCount: number };

/** HB-02: branches. Staff are assigned to one in admin/users. */
function BranchesCard({ branches, canEdit }: { branches: BranchRow[] | undefined; canEdit: boolean }) {
  const addBranch = useMutation(api.hub.addBranch);
  const renameBranch = useMutation(api.hub.renameBranch);
  const removeBranch = useMutation(api.hub.removeBranch);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      animatedToast.success(done);
      return true;
    } catch (err) {
      animatedToast.error("Could not update branches", { description: getErrorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (await run(() => addBranch({ name: newName }), "Branch added")) setNewName("");
  };

  const handleRename = async () => {
    if (!editing) return;
    if (await run(() => renameBranch(editing), "Branch renamed")) setEditing(null);
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-h3">Branches</h2>
        <p className="text-sm text-text-muted">Offices your staff work from. Assign people to a branch on the Users page.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {branches === undefined ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary-ink" />
        ) : branches.length === 0 ? (
          <p className="text-sm text-text-muted">No branches yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                {editing?.id === b.id ? (
                  <div className="flex flex-1 gap-2">
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ id: b.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleRename()}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleRename} disabled={busy}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium text-text">{b.name}</p>
                      <p className="text-xs text-text-muted">
                        {b.userCount} {b.userCount === 1 ? "staff member" : "staff members"}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Rename ${b.name}`} onClick={() => setEditing({ id: b.id, name: b.name })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${b.name}`}
                          disabled={busy || b.userCount > 0}
                          title={b.userCount > 0 ? "Move its staff to another branch first" : undefined}
                          onClick={() => run(() => removeBranch({ id: b.id }), "Branch removed")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Borrowdale"
              aria-label="New branch name"
            />
            <Button onClick={handleAdd} disabled={busy || !newName.trim()}>Add branch</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
