/**
 * Shared design system for SynCRM transactional emails.
 *
 * Everything is table-based with inline CSS so it renders consistently across
 * Gmail, Apple Mail, Outlook and mobile clients. No external stylesheets and
 * no JavaScript — email clients support neither.
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Accent palettes — pick one per email type for a consistent, themed look. */
export const ACCENTS = {
  blue: { accent: "#2563eb", tint: "#eff6ff" },
  red: { accent: "#dc2626", tint: "#fef2f2" },
  amber: { accent: "#d97706", tint: "#fffbeb" },
} as const;

export interface EmailShellOptions {
  /** Hex accent colour for the top bar, wordmark and CTA. */
  accentColor: string;
  /** Hidden inbox preview text shown next to the subject line. */
  preheader: string;
  /** Pre-rendered content HTML placed inside the white card. */
  content: string;
}

/** Wrap content in the branded, centered card layout. */
export function renderEmailShell({
  accentColor,
  preheader,
  content,
}: EmailShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;font-size:1px;line-height:1px;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background-color:${accentColor};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:30px 40px 0 40px;font-family:${FONT};">
<span style="font-size:20px;font-weight:700;letter-spacing:-0.4px;color:#0f172a;">Syn<span style="color:${accentColor};">CRM</span></span>
</td></tr>
<tr><td style="padding:22px 40px 38px 40px;font-family:${FONT};">${content}</td></tr>
<tr><td style="padding:24px 40px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:${FONT};">
<p style="margin:0;font-size:12px;line-height:19px;color:#94a3b8;">You're receiving this email because you have an active SynCRM account. Log in any time to manage your activities and preferences.</p>
</td></tr>
</table>
<p style="margin:18px 0 0 0;font-family:${FONT};font-size:11px;color:#cbd5e1;">SynCRM &middot; The real estate CRM that helps you close deals</p>
</td></tr>
</table>
</body>
</html>`;
}

/** Small uppercase pill that labels the email type. */
export function emailEyebrow(
  label: string,
  accentColor: string,
  tintColor: string
): string {
  return `<span style="display:inline-block;padding:5px 12px;background-color:${tintColor};color:${accentColor};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;border-radius:999px;font-family:${FONT};">${label}</span>`;
}

/** Primary heading inside the content area. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:16px 0 0 0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">${text}</h1>`;
}

/** Standard body paragraph. */
export function emailText(html: string): string {
  return `<p style="margin:14px 0 0 0;font-family:${FONT};font-size:15px;line-height:24px;color:#475569;">${html}</p>`;
}

/** Bulletproof CTA button. */
export function emailButton({
  href,
  label,
  accentColor,
}: {
  href: string;
  label: string;
  accentColor: string;
}): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px 0;">
<tr><td style="border-radius:9px;background-color:${accentColor};">
<a href="${href}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${label}</a>
</td></tr>
</table>`;
}

/** Muted secondary text link, shown below a button. */
export function emailSecondaryLink(href: string, label: string): string {
  return `<p style="margin:10px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#94a3b8;">${label} <a href="${href}" style="color:#64748b;text-decoration:underline;">Open SynCRM</a></p>`;
}

/** Labelled detail card — a tinted box of label/value rows. */
export function detailCard(rows: { label: string; value: string }[]): string {
  const body = rows
    .map((row, i) => {
      const border =
        i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : "";
      return `<tr>
<td style="padding:12px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;vertical-align:top;width:120px;${border}">${row.label}</td>
<td style="padding:12px 0;font-family:${FONT};font-size:14px;line-height:21px;color:#0f172a;font-weight:600;${border}">${row.value}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:6px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
</td></tr>
</table>`;
}

/** Escape user-supplied text before interpolating it into email HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Re-export for callers building custom blocks (e.g. the digest table). */
export const EMAIL_FONT = FONT;
