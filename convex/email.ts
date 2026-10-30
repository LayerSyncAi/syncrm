/**
 * Email sender with Resend integration.
 *
 * Required env vars (set in the deployed environment, e.g. Vercel/Convex):
 *   - RESEND_API_KEY: API key from https://resend.com (format: re_...)
 *   - EMAIL_FROM:     Sender address using a domain verified in Resend so
 *                     Gmail accepts the message (SPF/DKIM/DMARC must align).
 *
 * Without a real API key, emails are logged to the console for development.
 *
 * Every call records an entry in the `emailLogs` table (status: sent / failed /
 * dev_logged) so admins can see a full trail of email activity.
 */

import { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  renderEmailShell,
  emailEyebrow,
  emailHeading,
  emailText,
  emailButton,
  ACCENTS,
  EMAIL_FONT,
  detailCard,
  escapeHtml,
} from "./emailLayout";

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** No email provider is configured: the message went to the console only. */
  devLogged?: boolean;
}

export interface EmailLogContext {
  kind: string;
  triggeredByUserId?: Id<"users">;
  triggeredByLabel?: string;
  relatedType?: string;
  relatedId?: string;
  orgId?: Id<"organizations">;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Where replies go, e.g. the agency's own address. */
  replyTo?: string;
  /** Files to attach; content is base64. */
  attachments?: Array<{ filename: string; content: string }>;
}

const DEFAULT_FROM = "Syncrm <admin@accesshealthcare.co.zw>";

function isUsableApiKey(key: string | undefined): key is string {
  // Skip placeholders like `re_[your_key]` that appear in env templates.
  return !!key && !key.startsWith("re_[");
}

/**
 * Send an email and (if a Convex action context is provided) record it to the
 * `emailLogs` table for the admin Logs page.
 */
export async function sendEmail(
  options: EmailOptions,
  ctx?: ActionCtx,
  log?: EmailLogContext
): Promise<EmailSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || DEFAULT_FROM;

  let result: EmailSendResult;
  let status: "sent" | "failed" | "dev_logged";

  if (!isUsableApiKey(resendApiKey)) {
    console.log("=== EMAIL (no RESEND_API_KEY configured) ===");
    console.log("To:", options.to);
    console.log("Subject:", options.subject);
    console.log("Text:", options.text || "(html only)");
    if (options.attachments?.length) console.log("Attachments:", options.attachments.map((a) => a.filename).join(", "));
    console.log("============================================");
    result = { success: true, messageId: `dev-${Date.now()}`, devLogged: true };
    status = "dev_logged";
  } else {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send({
        from: emailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      });

      if (error) {
        console.error("Resend email error:", error);
        result = { success: false, error: error.message };
        status = "failed";
      } else {
        result = { success: true, messageId: data?.id };
        status = "sent";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown email error";
      console.error("Email send failed:", message);
      result = { success: false, error: message };
      status = "failed";
    }
  }

  // Persist the email log entry. Swallow logging errors so they never break
  // the underlying send flow.
  if (ctx && log) {
    try {
      await ctx.runMutation(internal.logs.recordEmailInternal, {
        to: options.to,
        from: emailFrom,
        subject: options.subject,
        kind: log.kind,
        status,
        messageId: result.messageId,
        error: result.error,
        triggeredByUserId: log.triggeredByUserId,
        triggeredByLabel: log.triggeredByLabel,
        relatedType: log.relatedType,
        relatedId: log.relatedId,
        orgId: log.orgId,
      });
    } catch (logErr) {
      console.error("Failed to record email log entry:", logErr);
    }
  }

  return result;
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string,
  ctx?: ActionCtx,
  log?: Omit<EmailLogContext, "kind">
): Promise<EmailSendResult> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const { accent, tint } = ACCENTS.blue;

  const content =
    emailEyebrow("Account Security", accent, tint) +
    emailHeading("Reset your password") +
    emailText(
      "We received a request to reset the password for your SynCRM account. Choose a new password using the button below."
    ) +
    emailButton({
      href: resetUrl,
      label: "Reset password",
      accentColor: accent,
    }) +
    emailText(
      `<span style="color:#94a3b8;">Or paste this link into your browser:</span><br><a href="${resetUrl}" style="color:#64748b;word-break:break-all;">${resetUrl}</a>`
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">` +
    `<tr><td style="padding:16px 20px;font-family:${EMAIL_FONT};font-size:13px;line-height:20px;color:#64748b;">` +
    `This link expires in <strong style="color:#0f172a;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.` +
    `</td></tr></table>`;

  return sendEmail(
    {
      to: email,
      subject: "Reset your SynCRM password",
      html: renderEmailShell({
        accentColor: accent,
        preheader: "Reset your SynCRM password — this link expires in 1 hour.",
        content,
      }),
      text: `Reset your SynCRM password by visiting: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    },
    ctx,
    { kind: "password_reset", ...(log || {}) }
  );
}

/**
 * Email a staff member their SyncEstate sign-in: a new invite, or a
 * temporary password an admin issued. The password is single-use in effect,
 * because the account is flagged to change it on first sign-in.
 *
 * Returns true only when the email actually went out, so the caller can fall
 * back to showing the password to the admin once.
 */
export async function sendStaffSignInEmail(
  ctx: ActionCtx,
  args: {
    to: string;
    fullName: string;
    orgName: string;
    password: string;
    reason: "invite" | "reset";
  },
  log: Omit<EmailLogContext, "kind">
): Promise<boolean> {
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";
  const loginUrl = `${siteUrl}/login`;
  const { accent, tint } = ACCENTS.blue;
  const invite = args.reason === "invite";
  const intro = invite
    ? `${escapeHtml(args.orgName)} has set up a SyncEstate login for you.`
    : `${escapeHtml(args.orgName)} has reset your SyncEstate password.`;
  const content =
    emailEyebrow(escapeHtml(args.orgName), accent, tint) +
    emailHeading(`Hello ${escapeHtml(args.fullName)}`) +
    emailText(intro) +
    detailCard([
      { label: "Email", value: escapeHtml(args.to) },
      { label: "Temporary password", value: escapeHtml(args.password) },
    ]) +
    emailButton({ href: loginUrl, label: "Sign in", accentColor: accent }) +
    emailText("You will be asked to choose your own password when you first sign in.");
  const subject = invite
    ? `Your ${args.orgName} SyncEstate login`
    : `Your ${args.orgName} SyncEstate password was reset`;
  const sent = await sendEmail(
    {
      to: args.to,
      subject,
      html: renderEmailShell({ accentColor: accent, preheader: subject, content }),
      text: `${invite ? `${args.orgName} has set up a SyncEstate login for you.` : `${args.orgName} has reset your SyncEstate password.`}\n\nSign in at ${loginUrl}\nEmail: ${args.to}\nTemporary password: ${args.password}\n\nYou will be asked to choose your own password when you first sign in.`,
    },
    ctx,
    { kind: invite ? "staff_invite" : "staff_password_reset", ...log }
  );
  return sent.success && !sent.devLogged;
}

/**
 * HB-61: a notification-centre alert, copied by email to a user who chose
 * this module's alerts. The button opens the record the alert is about.
 */
export async function sendAlertEmail(
  args: {
    to: string;
    orgName: string;
    moduleLabel: string;
    title: string;
    body?: string;
    href?: string;
  },
  ctx: ActionCtx,
  log: EmailLogContext
): Promise<EmailSendResult> {
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";
  const url = `${siteUrl}${args.href ?? "/app/hub"}`;
  const { accent, tint } = ACCENTS.blue;
  const content =
    emailEyebrow(`${escapeHtml(args.orgName)} · ${escapeHtml(args.moduleLabel)}`, accent, tint) +
    emailHeading(escapeHtml(args.title)) +
    (args.body ? emailText(escapeHtml(args.body)) : "") +
    emailButton({ href: url, label: "Open", accentColor: accent }) +
    emailText(
      `<span style="color:#94a3b8;">You chose to receive ${escapeHtml(args.moduleLabel)} alerts by email. Change this under Email alerts in the app.</span>`
    );
  return sendEmail(
    {
      to: args.to,
      subject: args.title,
      html: renderEmailShell({ accentColor: accent, preheader: escapeHtml(args.body ?? args.title), content }),
      text: `${args.title}\n\n${args.body ? `${args.body}\n\n` : ""}Open: ${url}\n\nYou chose to receive ${args.moduleLabel} alerts by email. Change this under Email alerts in the app.`,
    },
    ctx,
    log
  );
}
