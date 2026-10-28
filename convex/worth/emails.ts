/**
 * Sync Worth emails: the issued report to the client (VW-63) and due-date
 * reminders to the assigned valuer (VW-12). Scheduled from mutations; without
 * RESEND_API_KEY they are only logged.
 */
import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendEmail } from "../email";
import {
  ACCENTS,
  detailCard,
  emailButton,
  emailEyebrow,
  emailHeading,
  emailText,
  escapeHtml,
  renderEmailShell,
} from "../emailLayout";

export const reportEmailDetails = internalQuery({
  args: { reportId: v.id("worthReports"), byUserId: v.id("users") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    const job = await ctx.db.get(report.jobId);
    const org = await ctx.db.get(report.orgId);
    const by = await ctx.db.get(args.byUserId);
    if (!job || !org) return null;
    return {
      orgId: report.orgId,
      orgName: org.name,
      orgEmail: org.email ?? "",
      reference: job.reference,
      version: report.version,
      issuedDate: report.issuedDate,
      propertyAddress: job.propertyAddress,
      clientName: job.clientName,
      pdfUrl: report.pdfStorageId ? await ctx.storage.getUrl(report.pdfStorageId) : null,
      byName: by?.fullName || by?.name || by?.email || org.name,
      jobId: job._id,
    };
  },
});

export const sendReportEmail = internalAction({
  args: {
    reportId: v.id("worthReports"),
    to: v.string(),
    byUserId: v.id("users"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const d = await ctx.runQuery(internal.worth.emails.reportEmailDetails, {
      reportId: args.reportId,
      byUserId: args.byUserId,
    });
    if (!d || !d.pdfUrl) return;
    const { accent, tint } = ACCENTS.amber;
    const content =
      emailEyebrow("Valuation report", accent, tint) +
      emailHeading(`Valuation report ${escapeHtml(d.reference)}`) +
      emailText(
        `${escapeHtml(d.orgName)} has issued the valuation report for ${escapeHtml(d.propertyAddress)}.`
      ) +
      (args.message ? emailText(escapeHtml(args.message).replace(/\n/g, "<br>")) : "") +
      detailCard([
        { label: "Reference", value: escapeHtml(d.reference) },
        { label: "Version", value: String(d.version) },
        { label: "Issued", value: escapeHtml(d.issuedDate) },
        { label: "Property", value: escapeHtml(d.propertyAddress) },
      ]) +
      emailButton({ href: d.pdfUrl, label: "Download report (PDF)", accentColor: accent }) +
      emailText(
        `<span style="color:#94a3b8;">Sent by ${escapeHtml(d.byName)}${d.orgEmail ? `. Reply to ${escapeHtml(d.orgEmail)} with any questions.` : "."}</span>`
      );
    await sendEmail(
      {
        to: args.to,
        subject: `Valuation report ${d.reference}: ${d.propertyAddress}`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `Valuation report ${d.reference} for ${d.propertyAddress}`,
          content,
        }),
        text: `${d.orgName} has issued valuation report ${d.reference} (version ${d.version}) for ${d.propertyAddress}.\n\n${args.message ? args.message + "\n\n" : ""}Download: ${d.pdfUrl}`,
      },
      ctx,
      {
        kind: "worth_report",
        triggeredByUserId: args.byUserId,
        triggeredByLabel: d.byName,
        relatedType: "worthJob",
        relatedId: d.jobId,
        orgId: d.orgId,
      }
    );
  },
});

export const sendDueAlert = internalAction({
  args: {
    to: v.string(),
    userId: v.id("users"),
    orgId: v.id("organizations"),
    jobId: v.id("worthJobs"),
    reference: v.string(),
    propertyAddress: v.string(),
    dueDate: v.string(),
    state: v.union(v.literal("due_soon"), v.literal("overdue")),
  },
  handler: async (ctx, args) => {
    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const url = `${siteUrl}/app/worth/jobs/${args.jobId}`;
    const overdue = args.state === "overdue";
    const { accent, tint } = overdue ? ACCENTS.red : ACCENTS.amber;
    const heading = overdue ? `${args.reference} is overdue` : `${args.reference} is due soon`;
    const content =
      emailEyebrow("Sync Worth", accent, tint) +
      emailHeading(escapeHtml(heading)) +
      emailText(
        overdue
          ? `The valuation of ${escapeHtml(args.propertyAddress)} was due on ${escapeHtml(args.dueDate)}.`
          : `The valuation of ${escapeHtml(args.propertyAddress)} is due on ${escapeHtml(args.dueDate)}.`
      ) +
      emailButton({ href: url, label: "Open the job", accentColor: accent });
    await sendEmail(
      {
        to: args.to,
        subject: heading,
        html: renderEmailShell({ accentColor: accent, preheader: heading, content }),
        text: `${heading}. ${args.propertyAddress}, due ${args.dueDate}. ${url}`,
      },
      ctx,
      {
        kind: overdue ? "worth_overdue" : "worth_due_soon",
        triggeredByUserId: args.userId,
        relatedType: "worthJob",
        relatedId: args.jobId,
        orgId: args.orgId,
      }
    );
  },
});
