/**
 * Simple valuation fee invoice (VW-71), for agencies without Sync Finance.
 * The job reference doubles as the invoice number.
 */
import { formatDay, formatMoney, PURPOSE_LABELS } from "./format";
import { loadImageForPdf } from "./image";
import type { WorthCurrency, WorthPurpose } from "../../../convex/worth/lib";

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

export async function buildInvoicePdf(inv: InvoiceInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;
  const W = 595.28;
  const logo = await loadImageForPdf(inv.logoUrl, { maxDim: 600, png: true });

  if (logo) {
    const s = Math.min(160 / logo.width, 60 / logo.height);
    doc.addImage(logo.dataUrl, logo.format, M, 48, logo.width * s, logo.height * s);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(inv.org.name, M, 72);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  [inv.org.name, inv.org.address, inv.org.phone, inv.org.email, inv.org.vatNumber ? `VAT ${inv.org.vatNumber}` : ""]
    .filter(Boolean)
    .forEach((l, i) => doc.text(l, W - M, 58 + i * 12, { align: "right" }));

  doc.setTextColor(15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Tax invoice", M, 170);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice no. ${inv.reference}`, M, 192);
  doc.text(`Date ${formatDay(inv.invoiceDate)}`, M, 206);

  doc.setFont("helvetica", "bold");
  doc.text("Bill to", W / 2, 170);
  doc.setFont("helvetica", "normal");
  [inv.client.company || inv.client.name, inv.client.company ? `Attn: ${inv.client.name}` : "", inv.client.email, inv.client.phone]
    .filter(Boolean)
    .forEach((l, i) => doc.text(l as string, W / 2, 186 + i * 13));

  autoTable(doc, {
    startY: 260,
    head: [["Description", "Amount"]],
    body: [
      [
        `Valuation of ${inv.propertyAddress} (${PURPOSE_LABELS[inv.purpose].toLowerCase()}), reference ${inv.reference}`,
        formatMoney(inv.fee, inv.currency),
      ],
    ],
    foot: [["Total due", formatMoney(inv.fee, inv.currency)]],
    margin: { left: M, right: M },
    styles: { fontSize: 10, cellPadding: 8 },
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [248, 250, 252], textColor: 15, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 130 } },
  });
  const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 320) + 30;
  doc.setFontSize(10);
  if (inv.paid) {
    doc.setTextColor(22, 101, 52);
    doc.setFont("helvetica", "bold");
    doc.text("PAID. Thank you.", M, y);
  } else {
    doc.setTextColor(100);
    doc.text(`Please quote ${inv.reference} with your payment.`, M, y);
  }
  doc.save(`${inv.reference}-invoice.pdf`);
  return doc.output("blob");
}
