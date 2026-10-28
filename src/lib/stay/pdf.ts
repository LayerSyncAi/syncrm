/**
 * Printable A4 receipts and landlord statements, built in the browser with
 * jsPDF (loaded on demand). Both carry the agency's name and logo.
 */
import { dateLabel, datePrefix, fileSafe, money, type StayCurrency } from "./format";

type Agency = { name: string; address?: string; phone?: string; email?: string; vatNumber?: string };

const GREEN: [number, number, number] = [5, 150, 105];
const GREY = 110;

async function loadImage(url?: string | null): Promise<{ data: string; format: "PNG" | "JPEG"; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (!/png|jpe?g/i.test(blob.type)) return null;
    const data: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, format: /png/i.test(blob.type) ? "PNG" : "JPEG", ...dims };
  } catch {
    return null;
  }
}

type Doc = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

/** Logo on the left, agency details on the right. Returns the y below it. */
async function letterhead(doc: Doc, agency: Agency, logoUrl?: string | null): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;
  const logo = await loadImage(logoUrl);
  if (logo) {
    const h = 44;
    const w = Math.min(160, (logo.w / logo.h) * h);
    doc.addImage(logo.data, logo.format, margin, y, w, h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(agency.name, margin, y + 18);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  const lines = [agency.name, agency.address, agency.phone, agency.email, agency.vatNumber ? `VAT ${agency.vatNumber}` : undefined].filter(
    (s): s is string => !!s
  );
  lines.forEach((l, i) => doc.text(l, pageW - margin, y + 8 + i * 12, { align: "right" }));
  doc.setTextColor(0);
  y += Math.max(56, lines.length * 12 + 12);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  return y + 24;
}

export type ReceiptData = {
  agency: Agency;
  receiptNumber: string;
  paidOn: string;
  amount: number;
  currency: StayCurrency;
  method: string;
  reference: string;
  purpose: "rent" | "deposit";
  tenantName: string;
  propertyName: string;
  propertyAddress: string;
  unitLabel: string;
  allocations: Array<{ description: string; amount: number }>;
  creditAdded: number;
  balanceNow: number;
  recordedBy: string;
  reversed: boolean;
  reverseReason: string | null;
};

export async function downloadReceiptPdf(r: ReceiptData, logoUrl?: string | null): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = await letterhead(doc, r.agency, logoUrl);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(r.purpose === "deposit" ? "Deposit receipt" : "Receipt", margin, y);
  doc.setFontSize(11);
  doc.text(r.receiptNumber, pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(GREY);
  doc.text(dateLabel(r.paidOn), pageW - margin, y + 14, { align: "right" });
  doc.setTextColor(0);
  y += 34;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { textColor: GREY, cellWidth: 140 } },
    body: [
      ["Received from", r.tenantName],
      ["Property", `${r.propertyName}, ${r.unitLabel}`],
      ...(r.propertyAddress ? [["Address", r.propertyAddress]] : []),
      ["Method", r.method],
      ...(r.reference ? [["Reference", r.reference]] : []),
    ],
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, y, pageW - margin * 2, 52, 6, 6, "F");
  doc.setFontSize(10);
  doc.setTextColor(GREY);
  doc.text("Amount received", margin + 16, y + 20);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(money(r.amount, r.currency), margin + 16, y + 42);
  doc.setFont("helvetica", "normal");
  y += 72;

  if (r.purpose === "rent") {
    const body = r.allocations.map((a) => [a.description, money(a.amount, r.currency)]);
    if (r.creditAdded > 0) body.push(["Credit carried forward", money(r.creditAdded, r.currency)]);
    if (body.length) {
      autoTable(doc, {
        startY: y,
        head: [["Paid against", "Amount"]],
        body,
        styles: { fontSize: 10 },
        headStyles: { fillColor: GREEN },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    }
    doc.setFontSize(11);
    doc.text(`Balance on account after this payment: ${money(r.balanceNow, r.currency)}`, margin, y);
    y += 18;
  } else {
    doc.setFontSize(10);
    doc.text("Held as a deposit against the lease. It is not rent.", margin, y);
    y += 18;
  }

  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(`Received by ${r.recordedBy}`, margin, y + 10);
  doc.text("Thank you.", margin, y + 24);
  doc.setTextColor(0);

  if (r.reversed) {
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(48);
    doc.text("REVERSED", pageW / 2, 420, { align: "center", angle: 30 });
    doc.setFontSize(10);
    doc.text(`Reversed: ${r.reverseReason ?? ""}`, margin, y + 44);
    doc.setTextColor(0);
  }

  doc.save(`${datePrefix()}Receipt_${fileSafe(r.receiptNumber)}_${fileSafe(r.tenantName)}.pdf`);
}

export type LandlordStatementData = {
  agency: Agency;
  landlord: { name: string; email: string; phone: string; bankDetails: { bankName?: string; accountName?: string; accountNumber?: string; branch?: string } };
  month: string;
  monthLabel: string;
  properties: Array<{ name: string; feePct: number }>;
  sections: Array<{
    currency: StayCurrency;
    collected: number;
    depositApplied: number;
    fee: number;
    expenses: number;
    net: number;
    collections: Array<{ date: string; receiptNumber: string; propertyName: string; unitLabel: string; tenantName: string; amount: number; feePct: number; fee: number }>;
    depositLines: Array<{ date: string; propertyName: string; unitLabel: string; tenantName: string; amount: number }>;
    expenseLines: Array<{ date: string; propertyName: string; description: string; supplier: string; amount: number }>;
  }>;
};

export async function downloadLandlordStatementPdf(st: LandlordStatementData, logoUrl?: string | null): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = await letterhead(doc, st.agency, logoUrl);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Landlord statement", margin, y);
  doc.setFontSize(11);
  doc.text(st.monthLabel, pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 22;
  doc.setFontSize(10);
  doc.text(st.landlord.name, margin, y);
  const b = st.landlord.bankDetails;
  const bank = [b.bankName, b.branch, b.accountName, b.accountNumber].filter(Boolean).join(", ");
  if (bank) {
    doc.setTextColor(GREY);
    doc.text(`Pay to: ${bank}`, margin, y + 14);
    doc.setTextColor(0);
    y += 14;
  }
  doc.setTextColor(GREY);
  doc.text(`Properties: ${st.properties.map((p) => `${p.name} (fee ${p.feePct}%)`).join("; ")}`, margin, y + 14, { maxWidth: pageW - margin * 2 });
  doc.setTextColor(0);
  y += 34;

  if (!st.sections.length) {
    doc.text("No rent was collected and no expenses were recorded in this month.", margin, y);
  }

  for (const s of st.sections) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(s.currency, margin, y);
    doc.setFont("helvetica", "normal");
    y += 8;
    if (s.collections.length) {
      autoTable(doc, {
        startY: y,
        head: [["Date", "Receipt", "Property", "Tenant", "Collected", "Fee"]],
        body: s.collections.map((c) => [
          dateLabel(c.date),
          c.receiptNumber,
          `${c.propertyName} ${c.unitLabel}`,
          c.tenantName,
          money(c.amount, s.currency),
          `${money(c.fee, s.currency)} (${c.feePct}%)`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: GREEN },
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = after() + 12;
    }
    if (s.depositLines.length) {
      autoTable(doc, {
        startY: y,
        head: [["Date", "Deposit applied to amounts owed", "Amount"]],
        body: s.depositLines.map((d) => [dateLabel(d.date), `${d.propertyName} ${d.unitLabel}, ${d.tenantName}`, money(d.amount, s.currency)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: GREEN },
        columnStyles: { 2: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = after() + 12;
    }
    if (s.expenseLines.length) {
      autoTable(doc, {
        startY: y,
        head: [["Date", "Property", "Expense", "Supplier", "Amount"]],
        body: s.expenseLines.map((e) => [dateLabel(e.date), e.propertyName, e.description, e.supplier, money(e.amount, s.currency)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: GREEN },
        columnStyles: { 4: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = after() + 12;
    }
    autoTable(doc, {
      startY: y,
      theme: "plain",
      body: [
        ["Rent collected", money(s.collected, s.currency)],
        ...(s.depositApplied ? [["Deposit applied", money(s.depositApplied, s.currency)]] : []),
        ["Less management fee", `-${money(s.fee, s.currency)}`],
        ["Less expenses", `-${money(s.expenses, s.currency)}`],
        ["Net due to landlord", money(s.net, s.currency)],
      ],
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: pageW / 2, right: margin },
    });
    y = after() + 24;
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
  }

  doc.save(`${datePrefix()}Statement_${fileSafe(st.landlord.name)}_${st.month}.pdf`);
}
