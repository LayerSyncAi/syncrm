/**
 * Simple valuation fee invoice (VW-71) as HTML for expo-print, matching the
 * website's PDF. The job reference doubles as the invoice number.
 */
import type { WorthCurrency, WorthPurpose } from "../../../convex/worth/lib";
import { esc } from "../files";
import { imageDataUri } from "./files";
import { PURPOSE_LABELS, formatDay, formatMoney } from "./util";

export type InvoiceInput = {
  org: { name: string; address: string; phone: string; email: string; vatNumber: string };
  logoUrl?: string | null;
  reference: string;
  invoiceDate: string;
  client: { name: string; company?: string; email?: string; phone?: string };
  propertyAddress: string;
  purpose: WorthPurpose;
  fee: number;
  currency: WorthCurrency;
  paid: boolean;
};

export async function buildInvoiceHtml(inv: InvoiceInput): Promise<string> {
  const logo = await imageDataUri(inv.logoUrl, { maxDim: 600, png: true });
  const orgLines = [inv.org.name, inv.org.address, inv.org.phone, inv.org.email, inv.org.vatNumber ? `VAT ${inv.org.vatNumber}` : ""].filter(Boolean);
  const billTo = [inv.client.company || inv.client.name, inv.client.company ? `Attn: ${inv.client.name}` : "", inv.client.email, inv.client.phone].filter(Boolean);
  const amount = formatMoney(inv.fee, inv.currency);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 60px; }
  .logo { max-width: 160px; max-height: 60px; } .org { font-size: 18px; font-weight: 700; }
  .lines { text-align: right; color: #64748b; font-size: 9px; line-height: 1.4; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 36px; }
  h1 { font-size: 24px; margin: 0 0 10px; } .label { font-weight: 700; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #b45309; color: #fff; text-align: left; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .r { text-align: right; width: 130px; } tfoot td { background: #f8fafc; font-weight: 700; }
  .paid { color: #166534; font-weight: 700; margin-top: 24px; } .note { color: #64748b; margin-top: 24px; }
  </style></head><body>
  <div class="head"><div>${logo ? `<img class="logo" src="${logo}"/>` : `<div class="org">${esc(inv.org.name)}</div>`}</div>
  <div class="lines">${orgLines.map((l) => `<div>${esc(l)}</div>`).join("")}</div></div>
  <div class="meta">
    <div><h1>Tax invoice</h1><div>Invoice no. ${esc(inv.reference)}</div><div>Date ${esc(formatDay(inv.invoiceDate))}</div></div>
    <div style="width:50%"><div class="label">Bill to</div>${billTo.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
  </div>
  <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
  <tbody><tr><td>Valuation of ${esc(inv.propertyAddress)} (${esc(PURPOSE_LABELS[inv.purpose].toLowerCase())}), reference ${esc(inv.reference)}</td><td class="r">${esc(amount)}</td></tr></tbody>
  <tfoot><tr><td>Total due</td><td class="r">${esc(amount)}</td></tr></tfoot></table>
  ${inv.paid ? `<div class="paid">PAID. Thank you.</div>` : `<div class="note">Please quote ${esc(inv.reference)} with your payment.</div>`}
  </body></html>`;
}
