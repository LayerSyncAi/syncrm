/**
 * Email sender interface - placeholder implementation
 * Swap this out for Resend, SendGrid, or any other provider
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
 * Placeholder email sender - logs to console in development
 * Replace this implementation with your actual email provider:
 *
 * For Resend:
 * ```
 * import { Resend } from 'resend';
 * const resend = new Resend(process.env.RESEND_API_KEY);
 * ```
 *
 * For SendGrid:
 * ```
 * import sgMail from '@sendgrid/mail';
 * sgMail.setApiKey(process.env.SENDGRID_API_KEY);
 * ```
 */
export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  // Log the email in development (placeholder)
  console.log("=== EMAIL SENT (placeholder) ===");
  console.log("To:", options.to);
  console.log("Subject:", options.subject);
  console.log("HTML:", options.html);
  console.log("================================");

  // In production, replace with actual email sending logic:
  // Example with Resend:
  // const { data, error } = await resend.emails.send({
  //   from: 'SynCRM <noreply@yourdomain.com>',
  //   to: options.to,
  //   subject: options.subject,
  //   html: options.html,
  // });
  // return error ? { success: false, error: error.message } : { success: true, messageId: data.id };

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
