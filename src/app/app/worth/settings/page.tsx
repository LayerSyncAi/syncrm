"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useRequireAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/errors";
import { compressImage, uploadBlob } from "@/lib/worth/image";
import { Checkbox, ErrorNote, Field, PageHeader, Section, worthToast } from "@/components/worth/ui";

type Profile = NonNullable<ReturnType<typeof useProfiles>>[number];

function useProfiles() {
  return useQuery(api.worth.settings.listProfiles);
}

export default function WorthSettingsPage() {
  const { isLoading } = useRequireAuth();
  const settings = useQuery(api.worth.settings.get);
  const profiles = useProfiles();
  const update = useMutation(api.worth.settings.update);
  const [f, setF] = React.useState<null | {
    assumptions: string;
    limitingConditions: string;
    disclaimer: string;
    holdReportUntilPaid: boolean;
    dueSoonDays: string;
    referencePrefix: string;
  }>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<Profile | null>(null);

  React.useEffect(() => {
    if (settings && !f) {
      setF({
        assumptions: settings.assumptions,
        limitingConditions: settings.limitingConditions,
        disclaimer: settings.disclaimer,
        holdReportUntilPaid: settings.holdReportUntilPaid,
        dueSoonDays: String(settings.dueSoonDays),
        referencePrefix: settings.referencePrefix,
      });
    }
  }, [settings, f]);

  if (isLoading || settings === undefined || !f) return <ListSkeleton />;
  const canAdmin = settings.caps.canAdmin;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await update({ ...f, dueSoonDays: Number(f.dueSoonDays) || 0 });
      worthToast.done("Settings saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Worth settings"
        description="Standard report wording, fee rules and valuer profiles. Agency name, address and logo come from the Hub settings and brand kit."
      />

      <Section title="Report wording" description="Set once and printed on every report. One point per line.">
        <ErrorNote message={error} />
        <fieldset disabled={!canAdmin} className="space-y-3">
          <Field label="Assumptions">
            <Textarea rows={6} value={f.assumptions} onChange={(e) => setF({ ...f, assumptions: e.target.value })} />
          </Field>
          <Field label="Limiting conditions">
            <Textarea rows={6} value={f.limitingConditions} onChange={(e) => setF({ ...f, limitingConditions: e.target.value })} />
          </Field>
          <Field label="Disclaimer">
            <Textarea rows={3} className="min-h-[72px]" value={f.disclaimer} onChange={(e) => setF({ ...f, disclaimer: e.target.value })} />
          </Field>
        </fieldset>
      </Section>

      <Section title="Jobs and fees">
        <fieldset disabled={!canAdmin} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference prefix" hint={`Next reference looks like ${f.referencePrefix || "VAL"}-${new Date().getFullYear()}-0001.`}>
              <Input value={f.referencePrefix} onChange={(e) => setF({ ...f, referencePrefix: e.target.value.toUpperCase() })} maxLength={8} />
            </Field>
            <Field label="Flag jobs as due soon (days before due date)">
              <Input inputMode="numeric" value={f.dueSoonDays} onChange={(e) => setF({ ...f, dueSoonDays: e.target.value })} />
            </Field>
          </div>
          <Checkbox
            label="Hold issued reports until the fee is paid"
            checked={f.holdReportUntilPaid}
            disabled={!canAdmin}
            onChange={(v) => setF({ ...f, holdReportUntilPaid: v })}
          />
        </fieldset>
        {canAdmin && (
          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save settings"}
            </Button>
          </div>
        )}
      </Section>

      <Section
        title="Valuer profiles"
        description="Names, registration numbers and scanned signatures printed on signed reports. Give people the Valuer or Signing valuer role under Users first."
      >
        {profiles === undefined ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-text-muted">No valuers yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {profiles.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-[8px] border border-border bg-white">
                    {p.signatureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.signatureUrl} alt={`${p.name} signature`} className="max-h-10 max-w-[88px] object-contain" />
                    ) : (
                      <span className="text-[10px] text-text-dim">No signature</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {p.name}
                      {p.isSigning && <span className="ml-2 text-xs text-text-muted">Signing valuer</span>}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {p.registrationNumber ? `Reg. ${p.registrationNumber}` : "No registration number"}
                      {p.qualifications ? ` · ${p.qualifications}` : ""}
                    </p>
                  </div>
                </div>
                {p.canEdit && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ProfileModal profile={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProfileModal({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const saveProfile = useMutation(api.worth.settings.saveProfile);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [reg, setReg] = React.useState("");
  const [quals, setQuals] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [clear, setClear] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (profile) {
      setReg(profile.registrationNumber);
      setQuals(profile.qualifications);
      setFile(null);
      setClear(false);
      setError(null);
    }
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      let signatureStorageId: Id<"_storage"> | null | undefined;
      if (file) {
        // Signatures are small; keep PNG transparency when given one.
        const blob = file.type === "image/png" ? file : await compressImage(file, 800, 0.9);
        const url = await generateUploadUrl();
        signatureStorageId = (await uploadBlob(url, blob, blob.type || "image/png")) as Id<"_storage">;
      } else if (clear) {
        signatureStorageId = null;
      }
      await saveProfile({
        userId: profile.userId,
        registrationNumber: reg,
        qualifications: quals,
        signatureStorageId,
      });
      worthToast.done("Profile saved");
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!profile}
      title={profile ? `Valuer profile: ${profile.name}` : "Valuer profile"}
      description="Printed in the signature block of every report this valuer prepares or signs."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <ErrorNote message={error} />
        <Field label="Registration number" hint="Required before a signing valuer can issue reports.">
          <Input value={reg} onChange={(e) => setReg(e.target.value)} />
        </Field>
        <Field label="Qualifications">
          <Input value={quals} onChange={(e) => setQuals(e.target.value)} placeholder="e.g. BSc Rural and Urban Planning, MRICS" />
        </Field>
        <Field label="Scanned signature" hint="A PNG with a transparent background prints best.">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="block w-full text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {profile?.signatureUrl && !file && (
          <Checkbox label="Remove the current signature" checked={clear} onChange={setClear} />
        )}
      </div>
    </Modal>
  );
}
