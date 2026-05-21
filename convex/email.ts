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
} from "./emailLayout";

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
    console.log("============================================");
    result = { success: true, messageId: `dev-${Date.now()}` };
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
