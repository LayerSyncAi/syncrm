"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Wrench } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoGallery, PhotoStrip } from "@/components/stay/ops/photo-strip";
import { errText, NotAvailable, PageTitle, PortalLoading, usePortal } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { formatDay, maintenanceStatusVariant } from "@/lib/stay-ops/labels";
import type { PhotoItem } from "@/lib/stay-ops/photos";

const dateOf = (ms: number) => formatDay(new Date(ms).toISOString().slice(0, 10));

/** Photos load only when the request is opened. */
function Photos({ urls, count }: { urls: string[]; count: number }) {
  const [show, setShow] = React.useState(false);
  if (count === 0) return null;
  if (!show) {
    return (
      <button type="button" onClick={() => setShow(true)} className="min-h-10 text-sm text-primary-600">
        Show {count} photo{count === 1 ? "" : "s"}
      </button>
    );
  }
  return <PhotoGallery urls={urls} />;
}

function ReportForm({ onClose }: { onClose: () => void }) {
  const units = useQuery(api.portal.tenant.maintenanceUnits);
  const create = useMutation(api.portal.tenant.createMaintenance);
  const [leaseId, setLeaseId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const selected = leaseId || units?.[0]?.leaseId || "";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await create({
        leaseId: selected as Id<"stayLeases">,
        title,
        description,
        photos: photos.map((p) => p.storageId as Id<"_storage">),
      });
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Report a repair"
      onClose={onClose}
      footer={
        <Button size="lg" onClick={submit} disabled={busy || !selected || !title.trim() || !description.trim()}>
          {busy ? "Sending" : "Send request"}
        </Button>
      }
    >
      {units === undefined ? (
        <PortalLoading />
      ) : units.length === 0 ? (
        <p className="text-sm text-text-muted">You need an active lease to report a repair.</p>
      ) : (
        <div className="space-y-3">
          {units.length > 1 && (
            <Select value={selected} onChange={(e) => setLeaseId(e.target.value)} className="h-12" aria-label="Unit">
              {units.map((u) => (
                <option key={u.leaseId} value={u.leaseId}>{u.label}</option>
              ))}
            </Select>
          )}
          {units.length === 1 && <p className="text-sm text-text-muted">{units[0].label}</p>}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is wrong?" className="h-12" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the problem" />
          <PhotoStrip photos={photos} onChange={setPhotos} max={6} />
          {error && <p className="text-sm text-[var(--status-danger-fg)]">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function TenantMaintenance() {
  const rows = useQuery(api.portal.tenant.maintenance);
  const [open, setOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <>
      <PageTitle title="Repairs" />
      <Button size="lg" className="mb-4 w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Wrench className="h-4 w-4" />
        Report a repair
      </Button>
      {rows === undefined ? (
        <PortalLoading />
      ) : rows.length === 0 ? (
        <EmptyState icon={Wrench} title="No repair requests" description="Anything you report will be listed here with its status." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r._id}>
              <CardContent className="space-y-2 pt-5">
                <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpenId(openId === r._id ? null : r._id)}>
                  <span className="min-w-0">
                    <span className="block font-medium text-text">{r.title}</span>
                    <span className="block text-xs text-text-muted">{r.propertyTitle}, {r.unitLabel}. {dateOf(r.createdAt)}</span>
                  </span>
                  <Badge variant={maintenanceStatusVariant[r.status]}>{r.statusLabel}</Badge>
                </button>
                {openId === r._id && (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-text">{r.description}</p>
                    <Photos urls={r.photoUrls} count={r.photoCount} />
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {open && <ReportForm onClose={() => setOpen(false)} />}
    </>
  );
}

function DecideButtons({ id }: { id: Id<"stayMaintenance"> }) {
  const decide = useMutation(api.portal.landlord.decideRepair);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const go = async (status: "approved" | "declined") => {
    setBusy(true);
    setError(null);
    try {
      await decide({ maintenanceId: id, status, note: note || undefined });
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-[10px] bg-surface-2 p-3">
      <p className="text-sm font-medium text-text">Your approval is needed</p>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" />
      {error && <p className="text-sm text-[var(--status-danger-fg)]">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={busy} onClick={() => go("approved")}>Approve</Button>
        <Button size="lg" variant="secondary" disabled={busy} onClick={() => go("declined")}>Decline</Button>
      </div>
    </div>
  );
}

function LandlordMaintenance() {
  const rows = useQuery(api.portal.landlord.maintenance);
  if (rows === undefined) return <PortalLoading />;
  return (
    <>
      <PageTitle title="Repairs" />
      {rows.length === 0 ? (
        <EmptyState icon={Wrench} title="No repair requests" description="Repairs on your properties will be listed here." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const a = r.landlordApproval;
            return (
              <Card key={r._id}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{r.title}</p>
                      <p className="text-xs text-text-muted">{r.propertyTitle}, {r.unitLabel}. {dateOf(r.createdAt)}</p>
                    </div>
                    <Badge variant={maintenanceStatusVariant[r.status]}>{r.statusLabel}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-text">{r.description}</p>
                  <p className="text-xs text-text-muted">
                    {r.assigneeName ? `Assigned to ${r.assigneeName}` : "Not assigned yet"}
                    {r.cost != null && r.currency ? `. Cost ${formatMoney(r.cost, r.currency)}` : ""}
                  </p>
                  {a && a.status !== "pending" && (
                    <p className="text-sm text-text-muted">
                      You {a.status} this repair{a.note ? `: ${a.note}` : "."}
                    </p>
                  )}
                  <Photos urls={r.photoUrls} count={r.photoCount} />
                  {a?.status === "pending" && <DecideButtons id={r._id} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function PortalMaintenancePage() {
  const portal = usePortal();
  if (portal === undefined) return <PortalLoading />;
  if (!portal) return <NotAvailable />;
  return portal.kind === "tenant" ? <TenantMaintenance /> : <LandlordMaintenance />;
}
