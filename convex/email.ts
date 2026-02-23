/**
 * Email sending abstraction for SynCRM.
 *
 * Provider selection (checked at runtime):
 *   1. Resend — set RESEND_API_KEY in your Convex environment variables.
 *      Optionally set EMAIL_FROM to customise the sender address/name
 *      (default: "SynCRM <noreply@syncrm.app>").
 *   2. Fallback — if RESEND_API_KEY is absent the email is logged to the
 *      console so development/testing works without real credentials.
 *
 * Adding a new provider: implement the same EmailSendResult shape and
 * replace the Resend block below.
 */

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email via Resend (when RESEND_API_KEY is set) or falls back to a
 * console-log stub for local development.
 *
 * Required env vars:
 *   RESEND_API_KEY  — Resend API key (https://resend.com)
 *
 * Optional env vars:
 *   EMAIL_FROM      — "From" address, e.g. "SynCRM <noreply@yourdomain.com>"
 *                     Defaults to "SynCRM <noreply@syncrm.app>"
 */
export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    // ── Resend via REST API (no SDK dependency required) ──────────────────
    const from = process.env.EMAIL_FROM ?? "SynCRM <noreply@syncrm.app>";
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          ...(options.text ? { text: options.text } : {}),
        }),
      });
    } catch (err) {
      // Network-level failure
      return { success: false, error: `Network error: ${String(err)}` };
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string; name?: string };
        message = body.message ?? body.name ?? message;
      } catch {
        // ignore JSON parse errors
      }
      return { success: false, error: message };
    }

    const data = (await response.json()) as { id?: string };
    return { success: true, messageId: data.id };
  }

  // ── Development placeholder ───────────────────────────────────────────────
  // RESEND_API_KEY is not set; log to console so you can inspect emails
  // without a real provider during local development.
  console.log("=== EMAIL (placeholder — set RESEND_API_KEY to send for real) ===");
  console.log("To:", options.to);
  console.log("Subject:", options.subject);
  console.log("Body preview:", options.text?.slice(0, 200) ?? options.html.slice(0, 200));
  console.log("=================================================================");

  return {
    success: true,
    messageId: `placeholder-${Date.now()}`,
  };
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): Promise<EmailSendResult> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  return sendEmail({
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
  });
}
