/**
 * Sync Finance emails: receipts, remittance advices, invoices, statements and
 * instalment reminders. Built with Sync Stay's layout and queued the same
 * way, so the record and the email commit together.
 */
import { v } from "convex/values";
import { internalQuery, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { Agency, StayEmail, p, rows, shell, table } from "../stay/emails";
import { escapeHtml } from "../emailLayout";
import type { FinanceDocument } from "./documents";

export type { Agency };

const kv = (items: Array<[string, string]>) => items.map(([k, v]) => `${k}: ${v}`).join("\n");

export function documentEmail(a: {
  agency: Agency;
  to: string;
  name: string;
  subject: string;
  intro: string;
  items: Array<[string, string]>;
  lines?: { head: string[]; body: string[][] };
  outro?: string;
  kind: string;
  relatedType: string;
  relatedId: string;
}): StayEmail {
  const html = shell(
    a.agency,
    a.subject,
    p(`Dear ${escapeHtml(a.name)},`) +
      p(escapeHtml(a.intro)) +
      (a.lines && a.lines.body.length ? table(a.lines.head, a.lines.body) : "") +
      rows(a.items) +
      (a.outro ? p(escapeHtml(a.outro)) : "")
  );
  const lineText = a.lines?.body.map((r) => r.join("  ")).join("\n") ?? "";
  const text = `Dear ${a.name},\n\n${a.intro}\n\n${lineText ? lineText + "\n\n" : ""}${kv(a.items)}\n\n${a.outro ? a.outro + "\n\n" : ""}${a.agency.name}`;
  return { to: a.to, subject: a.subject, html, text, kind: a.kind, relatedType: a.relatedType, relatedId: a.relatedId };
}

/**
 * Queue an email with the document attached as a PDF. The PDF is drawn in a
 * Node action (finance/pdfMail.ts) with the agency's logo. Skipped without a
 * usable address.
 */
export async function queueDocumentEmail(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  email: StayEmail,
  doc: FinanceDocument,
  triggeredByUserId?: Id<"users">
): Promise<boolean> {
  const to = email.to?.trim();
  if (!to || !to.includes("@")) return false;
  await ctx.scheduler.runAfter(0, internal.finance.pdfMail.send, { orgId, ...email, to, doc, triggeredByUserId });
  return true;
}

/** The agency's logo reference (storage id or URL), for the PDF letterhead. */
export const logoRef = internalQuery({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!row?.logoRef) return null;
    if (/^https?:\/\//.test(row.logoRef)) return row.logoRef;
    return await ctx.storage.getUrl(row.logoRef as Id<"_storage">);
  },
});
