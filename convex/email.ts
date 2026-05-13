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

  return sendEmail(
    {
      to: email,
      subject: "Reset your SynCRM password",
      html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reset Your Password</h2>
        <p>You requested to reset your password for SynCRM.</p>
        <p>Click the button below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="color: #666; word-break: break-all;">${resetUrl}</p>
        <p style="color: #999; font-size: 14px; margin-top: 32px;">
          This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
      text: `Reset your SynCRM password by visiting: ${resetUrl}\n\nThis link will expire in 1 hour.`,
    },
    ctx,
    { kind: "password_reset", ...(log || {}) }
  );
}
