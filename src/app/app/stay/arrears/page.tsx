"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, MessageSquarePlus, Phone, Receipt } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useRecordPayment } from "@/components/stay/record-payment";
import { AGE_BUCKET_LABELS, dateLabel, formatTotals, money, parseAmount, todayLocal } from "@/lib/stay/format";
import { cn } from "@/lib/utils";

type Bucket = "0_30" | "31_60" | "61_90" | "90_plus";
const BUCKETS: Bucket[] = ["0_30", "31_60", "61_90", "90_plus"];
const BUCKET_VARIANT: Record<Bucket, BadgeProps["variant"]> = {
  "0_30": "warning",
  "31_60": "warning",
  "61_90": "danger",
  "90_plus": "danger",
};

export default function StayArrearsPage() {
  const { open: openPayment } = useRecordPayment();
  const [managerUserId, setManagerUserId] = React.useState("");
  const [stayPropertyId, setStayPropertyId] = React.useState("");
  const [landlordContactId, setLandlordContactId] = React.useState("");
  const [bucket, setBucket] = React.useState<Bucket | "">("");
  const [noteFor, setNoteFor] = React.useState<{ leaseId: Id<"stayLeases">; tenantName: string } | null>(null);

  const data = useQuery(api.stay.arrears.list, {
    managerUserId: (managerUserId || undefined) as Id<"users"> | undefined,
    stayPropertyId: (stayPropertyId || undefined) as Id<"stayProperties"> | undefined,
    landlordContactId: (landlordContactId || undefined) as Id<"contacts"> | undefined,
  });
  const managers = useQuery(api.stay.properties.listManagers);
  const properties = useQuery(api.stay.properties.list, {});
  const landlords = useQuery(api.stay.people.listLandlords);

  const rows = (data?.rows ?? []).filter((r) => !bucket || r.bucket === bucket);
  const filtered = !!(managerUserId || stayPropertyId || landlordContactId || bucket);

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Arrears"
        description="Every tenant with money overdue, aged by the oldest unpaid charge. Reminder emails go out automatically."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total overdue" value={data ? formatTotals(data.totals) : "..."} tone="danger" hint={data ? `${data.rows.length} tenancies` : undefined} />
        {BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(bucket === b ? "" : b)}
            className={cn("text-left rounded-[12px]", bucket === b && "ring-2 ring-primary")}
            aria-pressed={bucket === b}
          >
            <StatTile label={AGE_BUCKET_LABELS[b]} value={data ? formatTotals(data.bucketTotals[b]) : "..."} tone={b === "0_30" ? "warning" : "danger"} />
          </button>
        ))}
      </div>

      <div className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Property manager</Label>
            <Select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
              <option value="">All managers</option>
              {managers?.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={stayPropertyId} onChange={(e) => setStayPropertyId(e.target.value)}>
              <option value="">All properties</option>
              {properties?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Landlord</Label>
            <Select value={landlordContactId} onChange={(e) => setLandlordContactId(e.target.value)}>
              <option value="">All landlords</option>
              {landlords?.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Days overdue</Label>
            <Select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket | "")}>
              <option value="">Any</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {AGE_BUCKET_LABELS[b]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {data === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filtered ? "No arrears match these filters" : "No arrears"}
          description={filtered ? "Clear a filter to see more." : "Every tenant is up to date."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Oldest due</TableHead>
                  <TableHead>Last note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TableRow key={r.leaseId}>
                    <TableCell>
                      <Link href={`/app/stay/tenants/${r.tenantContactId}`} className="font-medium hover:underline">
                        {r.tenantName}
                      </Link>
                      {r.tenantPhone && <div className="text-xs text-text-muted">{r.tenantPhone}</div>}
                      {r.leaseStatus !== "active" && <Badge variant="neutral" className="mt-1">Lease ended</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/app/stay/leases/${r.leaseId}`} className="hover:underline">
                        {r.propertyName}, {r.unitLabel}
                      </Link>
                      {r.managerName && <div className="text-xs text-text-muted">{r.managerName}</div>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-semibold text-danger">{money(r.total, r.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{r.daysOverdue} days</div>
                      <Badge variant={BUCKET_VARIANT[r.bucket]} className="mt-1">
                        {AGE_BUCKET_LABELS[r.bucket]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm">
                      <LastNote note={r.lastNote} currency={r.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => setNoteFor({ leaseId: r.leaseId, tenantName: r.tenantName })}>
                          <MessageSquarePlus className="h-4 w-4" />
                          Note
                        </Button>
                        <Button size="sm" className="" onClick={() => openPayment(r.leaseId)}>
                          <Receipt className="h-4 w-4" />
                          Payment
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.leaseId} className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/stay/leases/${r.leaseId}`} className="font-medium">
                      {r.tenantName}
                    </Link>
                    <p className="truncate text-xs text-text-muted">
                      {r.propertyName}, {r.unitLabel}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-danger">{money(r.total, r.currency)}</p>
                    <Badge variant={BUCKET_VARIANT[r.bucket]}>{r.daysOverdue} days</Badge>
                  </div>
                </div>
                {r.lastNote && (
                  <div className="mt-2 text-sm">
                    <LastNote note={r.lastNote} currency={r.currency} />
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {r.tenantPhone ? (
                    <a href={`tel:${r.tenantPhone}`} className="inline-flex h-10 items-center justify-center gap-1 rounded-[10px] border border-border-strong text-sm">
                      <Phone className="h-4 w-4" />
                      Call
                    </a>
                  ) : (
                    <span />
                  )}
                  <Button variant="secondary" onClick={() => setNoteFor({ leaseId: r.leaseId, tenantName: r.tenantName })}>
                    Note
                  </Button>
                  <Button className="" onClick={() => openPayment(r.leaseId)}>
                    Payment
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AddNoteModal target={noteFor} onClose={() => setNoteFor(null)} />
    </div>
  );
}

function LastNote({
  note,
  currency,
}: {
  note: { note: string; promiseDate: string | null; promiseAmount: number | null; createdAt: number } | null;
  currency: string;
}) {
  if (!note) return <span className="text-text-muted">-</span>;
  const broken = note.promiseDate && note.promiseDate < todayLocal();
  return (
    <div>
      <p className="line-clamp-2">{note.note}</p>
      {note.promiseDate && (
        <p className={cn("text-xs", broken ? "text-danger" : "text-text-muted")}>
          Promised {note.promiseAmount ? money(note.promiseAmount, currency) : ""} by {dateLabel(note.promiseDate)}
          {broken ? " (passed)" : ""}
        </p>
      )}
      <p className="text-xs text-text-muted">{new Date(note.createdAt).toLocaleDateString("en-GB")}</p>
    </div>
  );
}

function AddNoteModal({ target, onClose }: { target: { leaseId: Id<"stayLeases">; tenantName: string } | null; onClose: () => void }) {
  const addNote = useMutation(api.stay.arrears.addNote);
  const [note, setNote] = React.useState("");
  const [promiseDate, setPromiseDate] = React.useState("");
  const [promiseAmount, setPromiseAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (target) {
      setNote("");
      setPromiseDate("");
      setPromiseAmount("");
      setError(null);
    }
  }, [target]);

  const save = async () => {
    if (!target) return;
    if (!note.trim()) return setError("Write a note.");
    const amount = promiseAmount.trim() ? parseAmount(promiseAmount) : undefined;
    if (amount !== undefined && !(amount > 0)) return setError("Enter a valid promised amount.");
    setSaving(true);
    setError(null);
    try {
      await addNote({ leaseId: target.leaseId, note: note.trim(), promiseDate: promiseDate || undefined, promiseAmount: amount });
      animatedToast.success("Note saved", { description: target.tenantName });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={`Arrears note: ${target?.tenantName ?? ""}`}
      description="Log a call, a visit or a promise to pay."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save note"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Note</Label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called the tenant, will pay on Friday" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Promised payment date (optional)</Label>
            <Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Promised amount (optional)</Label>
            <Input inputMode="decimal" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
