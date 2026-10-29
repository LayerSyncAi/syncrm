"use node";

/**
 * Finance documents emailed as PDF attachments (BRD §4). Runs in Node so the
 * same jsPDF layout the app downloads (src/lib/finance/pdf.ts) can draw the
 * file on the server.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendEmail } from "../email";
import { financePdfName, renderFinancePdf } from "../../src/lib/finance/pdf";
import type { FinanceDocument } from "./documents";

/** The logo as a data URL, or null when there is none or it cannot be read. */
async function logoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/png|jpe?g/i.test(type)) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type.split(";")[0]};base64,${b64}`;
  } catch {
    return null;
  }
}

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
    // A FinanceDocument (convex/finance/documents.ts), built by the mutation.
    doc: v.any(),
  },
  handler: async (ctx, args) => {
    const doc = args.doc as FinanceDocument;
    let attachments: Array<{ filename: string; content: string }> | undefined;
    try {
      const logo = await logoData(await ctx.runQuery(internal.finance.emails.logoRef, { orgId: args.orgId }));
      const pdf = await renderFinancePdf(doc, logo);
      attachments = [{ filename: financePdfName(doc), content: Buffer.from(pdf.output("arraybuffer")).toString("base64") }];
    } catch (e) {
      // The email still goes, without the attachment, rather than not at all.
      console.error("Finance PDF failed:", e instanceof Error ? e.message : e);
    }
    await sendEmail({ to: args.to, subject: args.subject, html: args.html, text: args.text, attachments }, ctx, {
      kind: args.kind,
      orgId: args.orgId,
      relatedType: args.relatedType,
      relatedId: args.relatedId,
      triggeredByUserId: args.triggeredByUserId,
    });
  },
});
