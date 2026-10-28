/**
 * Report, review and issue (VW-50..63): share the branded PDF, submit for
 * review, approve and issue or return, correct as a new version, and email
 * the issued report to the client.
 */
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useConvex, useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Field, Loading, Notice, Row, Sheet } from "../ui";
import { uploadFile } from "../../lib/files";
import { confirm, useRun } from "../../lib/useRun";
import { colors, font, radius, space } from "../../lib/theme";
import { printPdf, sharePdfFile } from "../../lib/worth/files";
import { buildReportHtml, reportFilename } from "../../lib/worth/report-html";
import { VALUE_KEYS, VALUE_LABELS, formatDay, formatInstant, formatMoney, type JobView } from "../../lib/worth/util";
import { Actions, ErrorNote, Panel, ReasonSheet } from "./bits";

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
  const { run } = useRun();

  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [sending, setSending] = useState(false);

  const current = reports?.find((r) => r._id === job.currentReportId);

  /** Build the PDF from the job record, like the website. */
  const makePdf = async () => {
    const data = await convex.query(api.worth.valuation.reportData, { jobId: job._id });
    const html = await buildReportHtml(data, branding?.logoUrl);
    return printPdf(html, reportFilename(data));
  };

  const withBusy = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    await run(fn, { success });
    setBusy(null);
  };

  const share = () =>
    withBusy("share", async () => {
      await sharePdfFile(await makePdf());
      if (job.status === "issued") void logView({ jobId: job._id }).catch(() => undefined);
    });

  /** Generate the issued PDF and store it against its version. */
  const attachCurrent = async (reportId: Id<"worthReports">) => {
    const file = await makePdf();
    const storageId = await uploadFile(() => generateUploadUrl({}), file);
    await attachPdf({ reportId, storageId: storageId as Id<"_storage"> });
  };

  const approve = async () => {
    if (!(await confirm("Approve and issue", `Sign and issue version ${job.version}. The job locks and the PDF is stored.`, "Issue"))) return;
    setBusy("issue");
    const res = await run(() => issue({ jobId: job._id }));
    if (res) {
      try {
        await attachCurrent(res.reportId);
        Alert.alert("Report issued", "Signed, locked and stored as PDF.");
      } catch (e) {
        Alert.alert("Issued, but the PDF was not stored", `Use Store PDF to retry. ${getErrorMessage(e)}`);
      }
    }
    setBusy(null);
  };

  const openStored = async (version: number, url: string | null) => {
    if (!url) return;
    void logView({ jobId: job._id, version }).catch(() => undefined);
    await WebBrowser.openBrowserAsync(url);
  };

  if (!caps.seesValues) return <Body muted>Reports are visible to the valuation team only.</Body>;

  const anyValue = VALUE_KEYS.some((k) => job.values[k]);

  return (
    <View style={{ gap: space.lg }}>
      <Panel
        title="Report"
        description={
          job.status === "issued"
            ? `Version ${job.version} issued ${formatDay(job.issuedDate)} and locked.`
            : `Version ${job.version}. The PDF is built from the job record, so figures always match.`
        }
      >
        {job.correctionReason && job.version > 1 ? (
          <Body muted small>
            Correction reason for version {job.version}: {job.correctionReason}
          </Body>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {VALUE_KEYS.filter((k) => job.values[k]).map((k) => (
            <View key={k} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md }}>
              <Text style={{ fontSize: font.xs, color: colors.muted }}>{VALUE_LABELS[k]}</Text>
              <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{formatMoney(job.values[k]!.amount, job.values[k]!.currency)}</Text>
            </View>
          ))}
          {!anyValue && <Body muted small>No values recorded yet.</Body>}
        </View>

        <Button
          variant="secondary"
          icon="share-outline"
          title={job.status === "issued" ? "Share PDF" : "Preview draft PDF"}
          loading={busy === "share"}
          disabled={busy !== null}
          onPress={share}
        />
        <Actions>
          {job.canWork && (job.status === "draft" || job.status === "inspected") && (
            <Button title="Submit for review" onPress={() => run(() => submit({ jobId: job._id }), { success: "Submitted for review" })} />
          )}
          {job.status === "in_review" && caps.canIssue && <Button title="Approve and issue" loading={busy === "issue"} disabled={busy !== null} onPress={approve} />}
          {job.status === "in_review" && caps.canReview && <Button variant="secondary" title="Return for changes" onPress={() => setReturning(true)} />}
          {job.status === "issued" && caps.canSendReports && (
            <Button icon="mail-outline" title="Email report to client" disabled={!current?.pdfUrl} onPress={() => setSending(true)} />
          )}
          {job.status === "issued" && current && !current.pdfUrl && (caps.canIssue || caps.canSendReports) && (
            <Button
              variant="secondary"
              title="Store PDF"
              loading={busy === "attach"}
              disabled={busy !== null}
              onPress={() => withBusy("attach", () => attachCurrent(current._id), "PDF stored")}
            />
          )}
          {job.status === "issued" && caps.canReview && <Button variant="ghost" title="Correct as new version" onPress={() => setCorrecting(true)} />}
        </Actions>
        {job.status === "in_review" && !caps.canIssue ? <Body muted small>Waiting for a signing valuer to review.</Body> : null}
        {job.status === "issued" && job.holdReportUntilPaid && !job.paidAt ? <Notice tone="warning">The report is held until the fee is paid.</Notice> : null}
      </Panel>

      <Panel title="Issued versions" description="Every issued version is kept, with who signed it and who it was sent to.">
        {reports === undefined ? (
          <Loading />
        ) : reports.length === 0 ? (
          <Body muted small>
            Not issued yet.
          </Body>
        ) : (
          reports.map((r) => (
            <Card key={r._id} style={{ backgroundColor: colors.surface, gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Version {r.version}</Text>
                  <Badge tone={r.superseded ? "neutral" : "success"} label={r.superseded ? "Superseded" : "Current"} />
                </Row>
                {r.pdfUrl && <Button small variant="ghost" title="Open PDF" onPress={() => openStored(r.version, r.pdfUrl)} />}
              </Row>
              <Body muted small>
                Issued {formatDay(r.issuedDate)} · signed by {r.signedBy}
                {r.correctionReason ? ` · correction: ${r.correctionReason}` : ""}
              </Body>
              <Body muted small>
                {VALUE_KEYS.filter((k) => r.values[k])
                  .map((k) => `${VALUE_LABELS[k]} ${formatMoney(r.values[k]!.amount, r.values[k]!.currency)}`)
                  .join(" · ")}
              </Body>
              {r.sends.map((s, i) => (
                <Text key={i} style={{ fontSize: font.xs, color: colors.faint }}>
                  Sent to {s.to} by {s.by}, {formatInstant(s.at)}
                </Text>
              ))}
            </Card>
          ))
        )}
      </Panel>

      <ReasonSheet
        open={returning}
        title="Return for changes"
        description="The valuer sees your comments on the job."
        label="Comments"
        confirmLabel="Return"
        onClose={() => setReturning(false)}
        onSubmit={(comment) => returnForChanges({ jobId: job._id, comment })}
      />
      <ReasonSheet
        open={correcting}
        title="Correct issued report"
        description={`Version ${job.version} stays on record. The job reopens as version ${job.version + 1} for review and re-issue.`}
        confirmLabel="Start new version"
        onClose={() => setCorrecting(false)}
        onSubmit={(reason) => startCorrection({ jobId: job._id, reason })}
      />
      <SendSheet job={job} open={sending} onClose={() => setSending(false)} />
    </View>
  );
}

function SendSheet({ job, open, onClose }: { job: JobView; open: boolean; onClose: () => void }) {
  const send = useMutation(api.worth.valuation.sendReport);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Email report to client" footer={<Button title="Send" icon="send-outline" loading={busy} onPress={submit} />}>
      <Body muted small>
        Sends a link to the signed PDF for {job.reference}. The send is recorded on the job.
      </Body>
      <ErrorNote message={error} />
      <Field label="To" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Field label="Message" value={message} onChangeText={setMessage} multiline placeholder="Optional" />
    </Sheet>
  );
}
