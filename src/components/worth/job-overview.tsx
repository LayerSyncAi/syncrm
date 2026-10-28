"use client";

/** Job overview: instruction details, assignment, hold and cancel, and the fee (VW-01..13, VW-70..72). */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import {
  CLASS_LABELS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  formatDay,
  formatInstant,
  formatMoney,
  todayIso,
} from "@/lib/worth/format";
import { buildInvoicePdf } from "@/lib/worth/invoice-pdf";
import type { WorthPartyType, WorthPropertyClass, WorthPurpose } from "../../../convex/worth/lib";
import { ReasonModal } from "./reason-modal";
import { DueText, ErrorNote, Field, KeyValues, Section, attempt, numOrUndef, worthToast } from "./ui";

export type JobView = NonNullable<FunctionReturnType<typeof api.worth.jobs.get>>;

export function JobOverview({ job }: { job: JobView }) {
  const caps = job.caps;
  const [editing, setEditing] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const hold = useMutation(api.worth.jobs.hold);
  const resume = useMutation(api.worth.jobs.resume);
  const cancel = useMutation(api.worth.jobs.cancel);
  const open = !["issued", "cancelled"].includes(job.status);

  return (
    <div className="space-y-4">
      {job.status === "on_hold" && job.holdReason && (
        <div className="rounded-[12px] bg-[var(--status-neutral-bg)] p-4 text-sm">
          <span className="font-medium">On hold:</span> {job.holdReason}
        </div>
      )}
      {job.status === "cancelled" && job.cancelReason && (
        <div className="rounded-[12px] bg-danger/10 p-4 text-sm text-danger">
          <span className="font-medium">Cancelled:</span> {job.cancelReason}
        </div>
      )}

      <Section
        title="Instruction"
        actions={
          (caps.canManageJobs || caps.canEditFee) && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        <KeyValues
          rows={[
            ["Instructing party", `${job.clientName} (${PARTY_LABELS[job.partyType]})`],
            ["Contact person", job.contactPerson],
            ["Phone", job.client?.phone],
            ["Email", job.client?.email],
            ["Purpose", job.purpose === "other" && job.purposeNote ? job.purposeNote : PURPOSE_LABELS[job.purpose]],
            ["Category", CLASS_LABELS[job.propertyClass]],
            ["Property", `${job.propertyAddress}, ${job.suburb}`],
            ["Agreed fee", formatMoney(job.fee, job.currency)],
            ["Received", formatDay(job.receivedDate)],
            ["Due", <DueText key="due" dueDate={job.dueDate} flag={job.dueFlag} />],
          ]}
        />
      </Section>

      <Section
        title="Assignment"
        actions={
          caps.canManageJobs &&
          open && (
            <>
              <Button size="sm" onClick={() => setAssigning(true)}>
                {job.assignedValuerId ? "Reassign" : "Assign valuer"}
              </Button>
              {job.status === "on_hold" ? (
                <Button size="sm" variant="secondary" onClick={() => attempt(() => resume({ jobId: job._id }), "Job resumed")}>
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setHolding(true)}>
                  Put on hold
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                Cancel job
              </Button>
            </>
          )
        }
      >
        <KeyValues
          rows={[
            ["Valuer", job.valuerName ?? "Not assigned"],
            ["Status", STATUS_LABELS[job.status]],
            ["Prepared by", job.preparedByName],
            ["Signed by", job.signedByName],
            ["Issued", job.issuedDate ? `${formatDay(job.issuedDate)} (version ${job.version})` : null],
            ["Logged", formatInstant(job.createdAt)],
          ]}
        />
      </Section>

      <FeeSection job={job} />

      <EditInstruction job={job} open={editing} onClose={() => setEditing(false)} />
      <AssignModal job={job} open={assigning} onClose={() => setAssigning(false)} />
      <ReasonModal
        open={holding}
        title="Put job on hold"
        description="Say why, for example waiting for keys or the title deed."
        confirmLabel="Put on hold"
        onClose={() => setHolding(false)}
        onSubmit={(reason) => hold({ jobId: job._id, reason })}
      />
      <ReasonModal
        open={cancelling}
        title="Cancel job"
        description="The job stays on record with the reason."
        confirmLabel="Cancel job"
        destructive
        onClose={() => setCancelling(false)}
        onSubmit={(reason) => cancel({ jobId: job._id, reason })}
      />
    </div>
  );
}

function FeeSection({ job }: { job: JobView }) {
  const caps = job.caps;
  const markInvoiced = useMutation(api.worth.jobs.markInvoiced);
  const setPaid = useMutation(api.worth.jobs.setPaid);
  const org = useQuery(api.hub.getOrgSettings);
  const branding = useQuery(api.branding.get);
  const [busy, setBusy] = React.useState(false);

  const downloadInvoice = async (raise: boolean) => {
    if (!org) return;
    setBusy(true);
    try {
      if (raise) await markInvoiced({ jobId: job._id });
      await buildInvoicePdf({
        org,
        logoUrl: branding?.logoUrl,
        reference: job.reference,
        invoiceDate: job.invoicedAt ? new Date(job.invoicedAt).toISOString().slice(0, 10) : todayIso(),
        client: {
          name: job.client?.name ?? job.clientName,
          company: job.client?.company,
          email: job.client?.email,
          phone: job.client?.phone,
        },
        propertyAddress: `${job.propertyAddress}, ${job.suburb}`,
        purpose: job.purpose,
        fee: job.fee,
        currency: job.currency,
        paid: !!job.paidAt,
      });
      if (raise) worthToast.done("Invoice raised", job.reference);
    } catch (e) {
      worthToast.failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Fee"
      description={job.holdReportUntilPaid ? "The agency holds reports until the fee is paid." : undefined}
      actions={
        caps.canManageFees &&
        job.status !== "cancelled" && (
          <>
            {!job.invoicedAt ? (
              <Button size="sm" onClick={() => downloadInvoice(true)} disabled={busy || !org}>
                Raise invoice
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => downloadInvoice(false)} disabled={busy || !org}>
                Download invoice
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => attempt(() => setPaid({ jobId: job._id, paid: !job.paidAt }), job.paidAt ? "Marked unpaid" : "Marked paid")}
            >
              {job.paidAt ? "Mark unpaid" : "Mark paid"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold tabular-nums">{formatMoney(job.fee, job.currency)}</span>
        {job.paidAt ? (
          <Badge variant="success">Paid {formatInstant(job.paidAt)}</Badge>
        ) : job.invoicedAt ? (
          <Badge variant="warning">Invoiced {formatInstant(job.invoicedAt)}, unpaid</Badge>
        ) : (
          <Badge variant="neutral">Not invoiced</Badge>
        )}
      </div>
    </Section>
  );
}

function EditInstruction({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const update = useMutation(api.worth.jobs.updateInstruction);
  const [f, setF] = React.useState(() => fromJob(job));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const detailsLocked = !job.caps.canManageJobs || job.status === "issued" || job.status === "cancelled";
  const feeLocked = !job.caps.canEditFee;

  React.useEffect(() => {
    if (open) {
      setF(fromJob(job));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const fee = numOrUndef(f.fee);
    if (fee === undefined) return setError("Enter the fee.");
    setBusy(true);
    try {
      await update({
        jobId: job._id,
        partyType: f.partyType,
        contactPerson: f.contactPerson,
        purpose: f.purpose,
        purposeNote: f.purposeNote,
        propertyClass: f.propertyClass,
        fee,
        currency: f.currency,
        receivedDate: f.receivedDate,
        dueDate: f.dueDate,
      });
      worthToast.done("Instruction updated");
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Edit ${job.reference}`}
      description={detailsLocked ? "Only the fee can change on this job." : "Fee changes are recorded in the audit log."}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ErrorNote message={error} />
        </div>
        <Field label="Instructing party type">
          <Select disabled={detailsLocked} value={f.partyType} onChange={(e) => setF({ ...f, partyType: e.target.value as WorthPartyType })}>
            {Object.entries(PARTY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact person">
          <Input disabled={detailsLocked} value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} />
        </Field>
        <Field label="Purpose">
          <Select disabled={detailsLocked} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value as WorthPurpose })}>
            {Object.entries(PURPOSE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purpose note">
          <Input disabled={detailsLocked} value={f.purposeNote} onChange={(e) => setF({ ...f, purposeNote: e.target.value })} />
        </Field>
        <Field label="Category">
          <Select disabled={detailsLocked} value={f.propertyClass} onChange={(e) => setF({ ...f, propertyClass: e.target.value as WorthPropertyClass })}>
            {Object.entries(CLASS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agreed fee">
          <div className="flex gap-2">
            <Select disabled={feeLocked} className="w-24 shrink-0" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as "USD" | "ZiG" })}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
            <Input disabled={feeLocked} inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
          </div>
        </Field>
        <Field label="Date received">
          <Input disabled={detailsLocked} type="date" value={f.receivedDate} onChange={(e) => setF({ ...f, receivedDate: e.target.value })} />
        </Field>
        <Field label="Date due">
          <Input disabled={detailsLocked} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function fromJob(job: JobView) {
  return {
    partyType: job.partyType,
    contactPerson: job.contactPerson,
    purpose: job.purpose,
    purposeNote: job.purposeNote,
    propertyClass: job.propertyClass,
    fee: String(job.fee),
    currency: job.currency,
    receivedDate: job.receivedDate,
    dueDate: job.dueDate,
  };
}

function AssignModal({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const valuers = useQuery(api.worth.jobs.valuers, open ? {} : "skip");
  const assign = useMutation(api.worth.jobs.assign);
  const [busy, setBusy] = React.useState<Id<"users"> | null>(null);

  const pick = async (id: Id<"users">) => {
    setBusy(id);
    const ok = await attempt(() => assign({ jobId: job._id, valuerId: id }), "Valuer assigned");
    setBusy(null);
    if (ok) onClose();
  };

  return (
    <Modal open={open} title="Assign valuer" description="Open jobs show each valuer's current workload." onClose={onClose}>
      {valuers === undefined ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : valuers.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nobody holds the Valuer or Signing valuer role yet. A director can give roles under Users.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-[10px] border border-border">
          {[...valuers]
            .sort((a, b) => a.openJobs - b.openJobs)
            .map((v) => (
              <div key={v.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {v.name}
                    {v.isSigning && <span className="ml-2 text-xs text-text-muted">Signing valuer</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {v.openJobs} open job{v.openJobs === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={job.assignedValuerId === v.userId ? "secondary" : "primary"}
                  disabled={busy !== null || job.assignedValuerId === v.userId}
                  onClick={() => pick(v.userId)}
                >
                  {job.assignedValuerId === v.userId ? "Assigned" : busy === v.userId ? "Assigning..." : "Assign"}
                </Button>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
