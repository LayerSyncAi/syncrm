"use client";

/**
 * Report, review and issue (VW-50..63): download the branded PDF, submit for
 * review, approve and issue or return, correct as a new version, and email
 * the issued report to the client.
 */
import * as React from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Download, FileText, Send } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { VALUE_KEYS, VALUE_LABELS, formatDay, formatInstant, formatMoney } from "@/lib/worth/format";
import { uploadBlob } from "@/lib/worth/image";
import { buildReportPdf, reportFilename } from "@/lib/worth/report-pdf";
import { ReasonModal } from "./reason-modal";
import { ErrorNote, Field, Section, attempt, worthToast } from "./ui";
import type { JobView } from "./job-overview";

export function JobReport({ job }: { job: JobView }) {
  const convex = useConvex();
  const caps = job.caps;
  const reports = useQuery(api.worth.valuation.listReports, caps.seesValues ? { jobId: job._id } : "skip");
  const branding = useQuery(api.branding.get);
  const submit = useMutation(api.worth.valuation.submitForReview);
  const issue = useMutation(api.worth.valuation.issue);
  const returnForChanges = useMutation(api.worth.valuation.returnForChanges);
  const startCorrection = useMutation(api.worth.valuation.startCorrection);
  const attachPdf = useMutation(api.worth.valuation.attachReportPdf);
  const logView = useMutation(api.worth.valuation.logReportView);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [busy, setBusy] = React.useState<string | null>(null);
  const [returning, setReturning] = React.useState(false);
  const [correcting, setCorrecting] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  const current = reports?.find((r) => r._id === job.currentReportId);

  const makePdf = async () => {
    const data = await convex.query(api.worth.valuation.reportData, { jobId: job._id });
    const blob = await buildReportPdf(data, branding?.logoUrl);
    return { blob, filename: reportFilename(data) };
  };

  const download = async () => {
    setBusy("download");
    try {
      const { blob, filename } = await makePdf();
      downloadBlob(blob, filename);
      if (job.status === "issued") void logView({ jobId: job._id }).catch(() => undefined);
    } catch (e) {
      worthToast.failed(e, "Could not build the report");
    } finally {
      setBusy(null);
    }
  };

  /** Generate the issued PDF and store it against its version. */
  const attachCurrent = async (reportId: Id<"worthReports">) => {
    const { blob } = await makePdf();
    const url = await generateUploadUrl();
    const storageId = await uploadBlob(url, blob, "application/pdf");
    await attachPdf({ reportId, storageId: storageId as Id<"_storage"> });
  };

  const approve = async () => {
    setBusy("issue");
    try {
      const { reportId } = await issue({ jobId: job._id });
      try {
        await attachCurrent(reportId);
        worthToast.done("Report issued", "Signed, locked and stored as PDF.");
      } catch (e) {
        worthToast.failed(e, "Issued, but the PDF was not stored. Use Store PDF to retry.");
      }
    } catch (e) {
      worthToast.failed(e);
    } finally {
      setBusy(null);
    }
  };

  const openStored = (version: number, url: string | null) => {
    if (!url) return;
    void logView({ jobId: job._id, version }).catch(() => undefined);
    window.open(url, "_blank", "noopener");
  };

  if (!caps.seesValues) {
    return <p className="text-sm text-text-muted">Reports are visible to the valuation team only.</p>;
  }

  return (
    <div className="space-y-4">
      <Section
        title="Report"
        description={
          job.status === "issued"
            ? `Version ${job.version} issued ${formatDay(job.issuedDate)} and locked.`
            : `Version ${job.version}. The PDF is built from the job record, so figures always match.`
        }
        actions={
          <Button size="sm" variant="secondary" onClick={download} disabled={busy !== null}>
            <Download className="h-4 w-4" />
            {busy === "download" ? "Building..." : job.status === "issued" ? "Download PDF" : "Preview draft PDF"}
          </Button>
        }
      >
        <div className="space-y-4">
          {job.correctionReason && job.version > 1 && (
            <p className="text-sm text-text-muted">
              Correction reason for version {job.version}: {job.correctionReason}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {VALUE_KEYS.filter((k) => job.values[k]).map((k) => (
              <div key={k} className="rounded-[10px] bg-surface-2 p-3">
                <p className="text-xs text-text-muted">{VALUE_LABELS[k]}</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(job.values[k]!.amount, job.values[k]!.currency)}</p>
              </div>
            ))}
            {!VALUE_KEYS.some((k) => job.values[k]) && <p className="text-sm text-text-muted">No values recorded yet.</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {job.canWork && (job.status === "draft" || job.status === "inspected") && (
              <Button onClick={() => attempt(() => submit({ jobId: job._id }), "Submitted for review")}>Submit for review</Button>
            )}
            {job.status === "in_review" && caps.canIssue && (
              <Button onClick={approve} disabled={busy !== null}>
                {busy === "issue" ? "Issuing..." : "Approve and issue"}
              </Button>
            )}
            {job.status === "in_review" && caps.canReview && (
              <Button variant="secondary" onClick={() => setReturning(true)}>
                Return for changes
              </Button>
            )}
            {job.status === "in_review" && !caps.canIssue && (
              <p className="self-center text-sm text-text-muted">Waiting for a signing valuer to review.</p>
            )}
            {job.status === "issued" && caps.canSendReports && (
              <Button onClick={() => setSending(true)} disabled={!current?.pdfUrl}>
                <Send className="h-4 w-4" />
                Email report to client
              </Button>
            )}
            {job.status === "issued" && current && !current.pdfUrl && (caps.canIssue || caps.canSendReports) && (
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("attach");
                  await attempt(() => attachCurrent(current._id), "PDF stored");
                  setBusy(null);
                }}
              >
                {busy === "attach" ? "Storing..." : "Store PDF"}
              </Button>
            )}
            {job.status === "issued" && caps.canReview && (
              <Button variant="ghost" onClick={() => setCorrecting(true)}>
                Correct as new version
              </Button>
            )}
          </div>
          {job.status === "issued" && job.holdReportUntilPaid && !job.paidAt && (
            <p className="text-sm text-[var(--status-warning-fg)]">The report is held until the fee is paid.</p>
          )}
        </div>
      </Section>

      <Section title="Issued versions" description="Every issued version is kept, with who signed it and who it was sent to.">
        {reports === undefined ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-text-muted">Not issued yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r._id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-text-muted" />
                    <span className="text-sm font-medium">Version {r.version}</span>
                    <Badge variant={r.superseded ? "neutral" : "success"}>{r.superseded ? "Superseded" : "Current"}</Badge>
                  </div>
                  {r.pdfUrl && (
                    <Button size="sm" variant="ghost" onClick={() => openStored(r.version, r.pdfUrl)}>
                      Open PDF
                    </Button>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  Issued {formatDay(r.issuedDate)} · signed by {r.signedBy}
                  {r.correctionReason ? ` · correction: ${r.correctionReason}` : ""}
                </p>
                <p className="text-xs text-text-muted">
                  {VALUE_KEYS.filter((k) => r.values[k])
                    .map((k) => `${VALUE_LABELS[k]} ${formatMoney(r.values[k]!.amount, r.values[k]!.currency)}`)
                    .join(" · ")}
                </p>
                {r.sends.map((s, i) => (
                  <p key={i} className="text-xs text-text-dim">
                    Sent to {s.to} by {s.by}, {formatInstant(s.at)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ReasonModal
        open={returning}
        title="Return for changes"
        description="The valuer sees your comments on the job."
        label="Comments"
        confirmLabel="Return"
        onClose={() => setReturning(false)}
        onSubmit={(comment) => returnForChanges({ jobId: job._id, comment })}
      />
      <ReasonModal
        open={correcting}
        title="Correct issued report"
        description={`Version ${job.version} stays on record. The job reopens as version ${job.version + 1} for review and re-issue.`}
        confirmLabel="Start new version"
        onClose={() => setCorrecting(false)}
        onSubmit={(reason) => startCorrection({ jobId: job._id, reason })}
      />
      <SendModal job={job} open={sending} onClose={() => setSending(false)} />
    </div>
  );
}

function SendModal({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const send = useMutation(api.worth.valuation.sendReport);
  const [to, setTo] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTo(job.client?.email ?? "");
      setMessage("");
      setError(null);
    }
  }, [open, job.client?.email]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await send({ jobId: job._id, to, message: message || undefined });
      worthToast.done("Report sent", to);
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
      title="Email report to client"
      description={`Sends a link to the signed PDF for ${job.reference}. The send is recorded on the job.`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Sending..." : "Send"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <ErrorNote message={error} />
        <Field label="To" required>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea rows={3} className="min-h-[80px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
