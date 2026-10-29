/**
 * Sync Stay emails to tenants, landlords and staff (BRD Stay §5.8).
 *
 * Mutations build the message (plain string templates, safe in the mutation
 * runtime) and schedule `send` with ctx.scheduler.runAfter(0, ...), so the
 * record and the decision to email commit together. Without RESEND_API_KEY
 * sendEmail only logs, which is how development runs.
 */
import { v } from "convex/values";
import { internalAction, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { sendEmail } from "../email";
import { EMAIL_FONT, escapeHtml } from "../emailLayout";

const ACCENT = "#059669";

export const send = internalAction({
  args: {
    orgId: v.id("organizations"),
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    kind: v.string(),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    triggeredByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await sendEmail({ to: args.to, subject: args.subject, html: args.html, text: args.text }, ctx, {
      kind: args.kind,
      orgId: args.orgId,
      relatedType: args.relatedType,
      relatedId: args.relatedId,
      triggeredByUserId: args.triggeredByUserId,
    });
  },
});

export type StayEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: string;
  relatedType?: string;
  relatedId?: string;
};

/** Queue an email from a mutation. Silently skipped without a usable address. */
export async function queueEmail(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  email: StayEmail,
  triggeredByUserId?: Id<"users">
): Promise<boolean> {
  const to = email.to?.trim();
  if (!to || !to.includes("@")) return false;
  await ctx.scheduler.runAfter(0, internal.stay.emails.send, { orgId, ...email, to, triggeredByUserId });
  return true;
}

// ── Templates ────────────────────────────────────────────────────────

export type Agency = { name: string; address?: string; phone?: string; email?: string };

export function shell(agency: Agency, preheader: string, content: string): string {
  const contact = [agency.address, agency.phone, agency.email].filter(Boolean).map((s) => escapeHtml(s!)).join(" &middot; ");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
<tr><td style="height:5px;background-color:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 0 28px;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(agency.name)}</td></tr>
<tr><td style="padding:12px 28px 28px 28px;font-family:${EMAIL_FONT};font-size:15px;line-height:23px;color:#334155;">${content}</td></tr>
${contact ? `<tr><td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:${EMAIL_FONT};font-size:12px;color:#64748b;">${contact}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

export function p(html: string) {
  return `<p style="margin:12px 0 0 0;">${html}</p>`;
}

export function rows(items: Array<[string, string]>): string {
  const tr = items
    .map(
      ([k, val]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#0f172a;">${escapeHtml(val)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;border:1px solid #e2e8f0;border-radius:8px;font-family:${EMAIL_FONT};font-size:14px;">${tr}</table>`;
}

export function table(head: string[], body: string[][]): string {
  const th = head
    .map((h, i) => `<th style="padding:8px;background:#f1f5f9;font-size:12px;text-align:${i === 0 ? "left" : "right"};color:#475569;">${escapeHtml(h)}</th>`)
    .join("");
  const tb = body
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:${i === 0 ? "left" : "right"};">${escapeHtml(c)}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;border:1px solid #e2e8f0;font-family:${EMAIL_FONT};">${th ? `<tr>${th}</tr>` : ""}${tb}</table>`;
}

export function receiptEmail(a: {
  agency: Agency;
  to: string;
  tenantName: string;
  receiptNumber: string;
  paidOn: string;
  amount: string;
  method: string;
  reference?: string;
  property: string;
  purpose: "rent" | "deposit";
  balance: string;
  paymentId: string;
}): StayEmail {
  const subject = `Receipt ${a.receiptNumber} from ${a.agency.name}`;
  const items: Array<[string, string]> = [
    ["Receipt number", a.receiptNumber],
    ["Date", a.paidOn],
    ["Amount received", a.amount],
    ["Payment for", a.purpose === "deposit" ? "Deposit" : "Rent and charges"],
    ["Method", a.method],
    ...(a.reference ? ([["Reference", a.reference]] as Array<[string, string]>) : []),
    ["Property", a.property],
    ...(a.purpose === "rent" ? ([["Balance now", a.balance]] as Array<[string, string]>) : []),
  ];
  const html = shell(
    a.agency,
    `We received ${a.amount}. Receipt ${a.receiptNumber}.`,
    p(`Dear ${escapeHtml(a.tenantName)},`) + p(`Thank you. We have received your payment.`) + rows(items) +
      p(`Please keep this email as your receipt.`)
  );
  const text = `Dear ${a.tenantName},\n\nThank you. We have received your payment.\n\n${items.map(([k, v2]) => `${k}: ${v2}`).join("\n")}\n\n${a.agency.name}`;
  return { to: a.to, subject, html, text, kind: "stay_receipt", relatedType: "stayPayment", relatedId: a.paymentId };
}

export function invoiceEmail(a: {
  agency: Agency;
  to: string;
  tenantName: string;
  period: string;
  dueDate: string;
  amount: string;
  property: string;
  balance: string;
  chargeId: string;
}): StayEmail {
  const subject = `Rent for ${a.period} due ${a.dueDate}`;
  const items: Array<[string, string]> = [
    ["Rent for", a.period],
    ["Amount", a.amount],
    ["Due date", a.dueDate],
    ["Property", a.property],
    ["Total balance", a.balance],
  ];
  const html = shell(
    a.agency,
    `${a.amount} due on ${a.dueDate}.`,
    p(`Dear ${escapeHtml(a.tenantName)},`) + p(`This is your rent invoice.`) + rows(items) +
      p(`Please pay by the due date and quote your name and unit as the reference.`)
  );
  const text = `Dear ${a.tenantName},\n\nThis is your rent invoice.\n\n${items.map(([k, v2]) => `${k}: ${v2}`).join("\n")}\n\n${a.agency.name}`;
  return { to: a.to, subject, html, text, kind: "stay_rent_invoice", relatedType: "stayCharge", relatedId: a.chargeId };
}

export function reminderEmail(a: {
  agency: Agency;
  to: string;
  tenantName: string;
  overdue: string;
  daysOverdue: number;
  property: string;
  leaseId: string;
}): StayEmail {
  const subject = `Rent overdue: ${a.overdue}`;
  const html = shell(
    a.agency,
    `${a.overdue} is overdue.`,
    p(`Dear ${escapeHtml(a.tenantName)},`) +
      p(`Our records show <strong>${escapeHtml(a.overdue)}</strong> overdue on ${escapeHtml(a.property)}, the oldest item ${a.daysOverdue} day${a.daysOverdue === 1 ? "" : "s"} past its due date.`) +
      p(`Please pay as soon as possible, or contact us to arrange a payment date. If you have already paid, please send us the proof of payment.`)
  );
  const text = `Dear ${a.tenantName},\n\nOur records show ${a.overdue} overdue on ${a.property}, the oldest item ${a.daysOverdue} days past its due date.\n\nPlease pay as soon as possible, or contact us to arrange a payment date. If you have already paid, please send us the proof of payment.\n\n${a.agency.name}`;
  return { to: a.to, subject, html, text, kind: "stay_rent_reminder", relatedType: "stayLease", relatedId: a.leaseId };
}

export function expiryEmail(a: {
  agency: Agency;
  to: string;
  managerName: string;
  tenantName: string;
  property: string;
  endDate: string;
  daysLeft: number;
  link: string;
  leaseId: string;
}): StayEmail {
  const subject = `Lease ending in ${a.daysLeft} days: ${a.tenantName}, ${a.property}`;
  const html = shell(
    a.agency,
    `Lease ends ${a.endDate}.`,
    p(`Hello ${escapeHtml(a.managerName)},`) +
      p(`The lease for <strong>${escapeHtml(a.tenantName)}</strong> at ${escapeHtml(a.property)} ends on <strong>${escapeHtml(a.endDate)}</strong> (${a.daysLeft} days).`) +
      p(`Renew it or plan the move-out in Sync Stay: <a href="${escapeHtml(a.link)}" style="color:${ACCENT};">open the lease</a>.`)
  );
  const text = `Hello ${a.managerName},\n\nThe lease for ${a.tenantName} at ${a.property} ends on ${a.endDate} (${a.daysLeft} days).\n\nOpen the lease: ${a.link}`;
  return { to: a.to, subject, html, text, kind: "stay_lease_expiry", relatedType: "stayLease", relatedId: a.leaseId };
}

export function statementEmail(a: {
  agency: Agency;
  to: string;
  landlordName: string;
  month: string;
  sections: Array<{
    currency: string;
    lines: string[][];
    totals: Array<[string, string]>;
  }>;
  landlordId: string;
}): StayEmail {
  const subject = `Your statement for ${a.month} from ${a.agency.name}`;
  const body = a.sections
    .map((s) => `<p style="margin:20px 0 0 0;font-weight:700;">${escapeHtml(s.currency)}</p>` + (s.lines.length ? table(["Property / tenant", "Receipt", "Amount"], s.lines) : "") + rows(s.totals))
    .join("");
  const html = shell(
    a.agency,
    `Statement for ${a.month}.`,
    p(`Dear ${escapeHtml(a.landlordName)},`) + p(`Here is your statement for ${escapeHtml(a.month)}.`) +
      (a.sections.length ? body : p("There was no rent collected and no expenses in this month.")) +
      p(`Please contact us with any questions.`)
  );
  const text = `Dear ${a.landlordName},\n\nHere is your statement for ${a.month}.\n\n${a.sections
    .map((s) => `${s.currency}\n${s.lines.map((l) => l.join("  ")).join("\n")}\n${s.totals.map(([k, v2]) => `${k}: ${v2}`).join("\n")}`)
    .join("\n\n")}\n\n${a.agency.name}`;
  return { to: a.to, subject, html, text, kind: "stay_landlord_statement", relatedType: "contact", relatedId: a.landlordId };
}
