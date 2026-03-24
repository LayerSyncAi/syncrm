/**
 * Email sender with Resend integration.
 * Set the RESEND_API_KEY environment variable to enable real email delivery.
 * Set EMAIL_FROM to customize the sender address (default: "SynCRM <noreply@syncrm.app>").
 * Without an API key, emails are logged to the console for development.
 */

import { Resend } from "resend";

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

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || "SynCRM <noreply@syncrm.app>";

export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  if (!resendApiKey) {
    // Development fallback: log to console
    console.log("=== EMAIL (no RESEND_API_KEY configured) ===");
    console.log("To:", options.to);
    console.log("Subject:", options.subject);
    console.log("Text:", options.text || "(html only)");
    console.log("============================================");
    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }

  try {
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
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("Email send failed:", message);
    return { success: false, error: message };
  }
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
