/** Job overview: instruction details, assignment, hold and cancel, and the fee (VW-01..13, VW-70..72). */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, DateField, Facts, Field, Notice, Row, Select, Sheet } from "../ui";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { buildInvoiceHtml } from "../../lib/worth/invoice-html";
import { printPdf, sharePdfFile } from "../../lib/worth/files";
import {
  CLASS_LABELS,
  CURRENCY_OPTIONS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  formatDay,
  formatInstant,
  formatMoney,
  numOrUndef,
  optionsOf,
  todayIso,
  type JobView,
} from "../../lib/worth/util";
import { Actions, DueText, ErrorNote, Pair, Panel, ReasonSheet } from "./bits";

export function JobOverview({ job }: { job: JobView }) {
  const caps = job.caps;
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const hold = useMutation(api.worth.jobs.hold);
  const resume = useMutation(api.worth.jobs.resume);
  const cancel = useMutation(api.worth.jobs.cancel);
  const { busy, run } = useRun();
  const open = job.status !== "issued" && job.status !== "cancelled";

  return (
    <View style={{ gap: space.lg }}>
      {job.status === "on_hold" && job.holdReason ? <Notice tone="warning">On hold: {job.holdReason}</Notice> : null}
      {job.status === "cancelled" && job.cancelReason ? <Notice tone="danger">Cancelled: {job.cancelReason}</Notice> : null}

      <Panel
        title="Instruction"
        right={(caps.canManageJobs || caps.canEditFee) && <Button small variant="secondary" title="Edit" onPress={() => setEditing(true)} />}
      >
        <Facts
          items={[
            { label: "Instructing party", value: `${job.clientName} (${PARTY_LABELS[job.partyType]})` },
            { label: "Contact person", value: job.contactPerson },
            { label: "Phone", value: job.client?.phone },
            { label: "Email", value: job.client?.email },
            { label: "Purpose", value: job.purpose === "other" && job.purposeNote ? job.purposeNote : PURPOSE_LABELS[job.purpose] },
            { label: "Category", value: CLASS_LABELS[job.propertyClass] },
            { label: "Property", value: `${job.propertyAddress}, ${job.suburb}` },
            { label: "Agreed fee", value: formatMoney(job.fee, job.currency) },
            { label: "Received", value: formatDay(job.receivedDate) },
            { label: "Due", value: <DueText dueDate={job.dueDate} flag={job.dueFlag} /> },
          ]}
        />
      </Panel>

      <Panel title="Assignment">
        <Facts
          items={[
            { label: "Valuer", value: job.valuerName ?? "Not assigned" },
            { label: "Status", value: STATUS_LABELS[job.status] },
            { label: "Prepared by", value: job.preparedByName ?? "" },
            { label: "Signed by", value: job.signedByName ?? "" },
            { label: "Issued", value: job.issuedDate ? `${formatDay(job.issuedDate)} (version ${job.version})` : "" },
            { label: "Logged", value: formatInstant(job.createdAt) },
          ]}
        />
        {caps.canManageJobs && open && (
          <Actions>
            <Button small title={job.assignedValuerId ? "Reassign" : "Assign valuer"} onPress={() => setAssigning(true)} />
            {job.status === "on_hold" ? (
              <Button small variant="secondary" title="Resume" loading={busy} onPress={() => run(() => resume({ jobId: job._id }), { success: "Job resumed" })} />
            ) : (
              <Button small variant="secondary" title="Put on hold" onPress={() => setHolding(true)} />
            )}
            <Button small variant="danger" title="Cancel job" onPress={() => setCancelling(true)} />
          </Actions>
        )}
      </Panel>

      <FeePanel job={job} />

      <EditInstruction job={job} open={editing} onClose={() => setEditing(false)} />
      <AssignSheet job={job} open={assigning} onClose={() => setAssigning(false)} />
      <ReasonSheet
        open={holding}
        title="Put job on hold"
        description="Say why, for example waiting for keys or the title deed."
        confirmLabel="Put on hold"
        onClose={() => setHolding(false)}
        onSubmit={(reason) => hold({ jobId: job._id, reason })}
      />
      <ReasonSheet
        open={cancelling}
        title="Cancel job"
        description="The job stays on record with the reason."
        confirmLabel="Cancel job"
        destructive
        onClose={() => setCancelling(false)}
        onSubmit={(reason) => cancel({ jobId: job._id, reason })}
      />
    </View>
  );
}

function FeePanel({ job }: { job: JobView }) {
  const caps = job.caps;
  const markInvoiced = useMutation(api.worth.jobs.markInvoiced);
  const setPaid = useMutation(api.worth.jobs.setPaid);
  const org = useQuery(api.hub.getOrgSettings, caps.canManageFees ? {} : "skip");
  const branding = useQuery(api.branding.get, caps.canManageFees ? {} : "skip");
  const { busy, run } = useRun();

  /** Optionally raise the invoice, then build the PDF and open the share sheet. */
  const invoice = (raise: boolean) =>
    run(
      async () => {
        if (!org) return;
        if (raise) await markInvoiced({ jobId: job._id });
        const html = await buildInvoiceHtml({
          org,
          logoUrl: branding?.logoUrl,
          reference: job.reference,
          invoiceDate: job.invoicedAt ? new Date(job.invoicedAt).toISOString().slice(0, 10) : todayIso(),
          client: { name: job.client?.name ?? job.clientName, company: job.client?.company, email: job.client?.email, phone: job.client?.phone },
          propertyAddress: `${job.propertyAddress}, ${job.suburb}`,
          purpose: job.purpose,
          fee: job.fee,
          currency: job.currency,
          paid: !!job.paidAt,
        });
        await sharePdfFile(await printPdf(html, `${job.reference}-invoice.pdf`));
      },
      { success: raise ? "Invoice raised" : undefined }
    );

  return (
    <Panel title="Fee" description={job.holdReportUntilPaid ? "The agency holds reports until the fee is paid." : undefined}>
      <Row style={{ flexWrap: "wrap" }}>
        <Text style={{ fontSize: font.xxl, fontWeight: "700", color: colors.text }}>{formatMoney(job.fee, job.currency)}</Text>
        {job.paidAt ? (
          <Badge tone="success" label={`Paid ${formatInstant(job.paidAt)}`} />
        ) : job.invoicedAt ? (
          <Badge tone="warning" label={`Invoiced ${formatInstant(job.invoicedAt)}, unpaid`} />
        ) : (
          <Badge label="Not invoiced" />
        )}
      </Row>
      {caps.canManageFees && job.status !== "cancelled" && (
        <Actions>
          {!job.invoicedAt ? (
            <Button small icon="document-text-outline" title="Raise invoice" disabled={!org} loading={busy} onPress={() => invoice(true)} />
          ) : (
            <Button small variant="secondary" icon="share-outline" title="Share invoice" disabled={!org} loading={busy} onPress={() => invoice(false)} />
          )}
          <Button
            small
            variant="secondary"
            title={job.paidAt ? "Mark unpaid" : "Mark paid"}
            onPress={() => run(() => setPaid({ jobId: job._id, paid: !job.paidAt }), { success: job.paidAt ? "Marked unpaid" : "Marked paid" })}
          />
        </Actions>
      )}
    </Panel>
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

function EditInstruction({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const update = useMutation(api.worth.jobs.updateInstruction);
  const [f, setF] = useState(() => fromJob(job));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailsLocked = !job.caps.canManageJobs || job.status === "issued" || job.status === "cancelled";
  const feeLocked = !job.caps.canEditFee;

  useEffect(() => {
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
      await update({ jobId: job._id, ...f, fee });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Edit ${job.reference}`} footer={<Button title="Save" onPress={save} loading={busy} />}>
      <Body muted small>
        {detailsLocked ? "Only the fee can change on this job." : "Fee changes are recorded in the audit log."}
      </Body>
      <ErrorNote message={error} />
      {!detailsLocked && (
        <>
          <Select label="Instructing party type" value={f.partyType} options={optionsOf(PARTY_LABELS)} onChange={(v) => setF({ ...f, partyType: v })} />
          <Field label="Contact person" value={f.contactPerson} onChangeText={(t) => setF({ ...f, contactPerson: t })} />
          <Select label="Purpose" value={f.purpose} options={optionsOf(PURPOSE_LABELS)} onChange={(v) => setF({ ...f, purpose: v })} />
          <Field label="Purpose note" value={f.purposeNote} onChangeText={(t) => setF({ ...f, purposeNote: t })} />
          <Select label="Category" value={f.propertyClass} options={optionsOf(CLASS_LABELS)} onChange={(v) => setF({ ...f, propertyClass: v })} />
        </>
      )}
      {!feeLocked && (
        <Pair>
          <Select label="Currency" value={f.currency} options={CURRENCY_OPTIONS} onChange={(v) => setF({ ...f, currency: v })} />
          <Field label="Agreed fee" value={f.fee} onChangeText={(t) => setF({ ...f, fee: t })} keyboardType="decimal-pad" />
        </Pair>
      )}
      {!detailsLocked && (
        <>
          <DateField label="Date received" value={f.receivedDate} onChange={(v) => setF({ ...f, receivedDate: v })} />
          <DateField label="Date due" value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} />
        </>
      )}
    </Sheet>
  );
}

function AssignSheet({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const valuers = useQuery(api.worth.jobs.valuers, open ? {} : "skip");
  const assign = useMutation(api.worth.jobs.assign);
  const { run } = useRun();
  const [busyId, setBusyId] = useState<Id<"users"> | null>(null);

  const pick = async (id: Id<"users">) => {
    setBusyId(id);
    const ok = await run(async () => {
      await assign({ jobId: job._id, valuerId: id });
      return true;
    });
    setBusyId(null);
    if (ok) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Assign valuer">
      <Body muted small>
        Open jobs show each valuer&apos;s current workload.
      </Body>
      {valuers === undefined ? (
        <Body muted>Loading...</Body>
      ) : valuers.length === 0 ? (
        <Body muted small>
          Nobody holds the Valuer or Signing valuer role yet. A director can give roles under Users.
        </Body>
      ) : (
        [...valuers]
          .sort((a, b) => a.openJobs - b.openJobs)
          .map((v) => {
            const current = job.assignedValuerId === v.userId;
            return (
              <Row key={v.userId} style={{ justifyContent: "space-between", paddingVertical: space.xs }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{v.name}</Text>
                  <Text style={{ fontSize: font.xs, color: colors.muted }}>
                    {v.openJobs} open job{v.openJobs === 1 ? "" : "s"}
                    {v.isSigning ? " · Signing valuer" : ""}
                  </Text>
                </View>
                <Button
                  small
                  variant={current ? "secondary" : "primary"}
                  title={current ? "Assigned" : "Assign"}
                  disabled={current || busyId !== null}
                  loading={busyId === v.userId}
                  onPress={() => pick(v.userId)}
                />
              </Row>
            );
          })
      )}
    </Sheet>
  );
}
