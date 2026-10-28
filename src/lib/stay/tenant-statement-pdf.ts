/**
 * Printable A4 tenant statement: one section per lease account, with the
 * running balance. Same letterhead style as the receipt in pdf.ts.
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

export type TenantStatementData = {
  agency: Agency;
  tenant: { name: string; phone: string; email: string; idNumber: string };
  accounts: Array<{
    label: string;
    status: string;
    startDate: string;
    endDate: string;
    currency: StayCurrency;
    balance: number;
    lines: Array<{ date: string; description: string; debit: number; credit: number; balance: number }>;
  }>;
  asOf: string;
};

export async function downloadTenantStatementPdf(st: TenantStatementData, logoUrl?: string | null): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Letterhead
  let y = 40;
  const logo = await loadImage(logoUrl);
  if (logo) {
    const h = 44;
    const w = Math.min(160, (logo.w / logo.h) * h);
    doc.addImage(logo.data, logo.format, margin, y, w, h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(st.agency.name, margin, y + 18);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  const head = [st.agency.name, st.agency.address, st.agency.phone, st.agency.email, st.agency.vatNumber ? `VAT ${st.agency.vatNumber}` : undefined].filter(
    (s): s is string => !!s
  );
  head.forEach((l, i) => doc.text(l, pageW - margin, y + 8 + i * 12, { align: "right" }));
  doc.setTextColor(0);
  y += Math.max(56, head.length * 12 + 12);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Tenant statement", margin, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`As at ${dateLabel(st.asOf)}`, pageW - margin, y, { align: "right" });
  y += 20;
  doc.setFontSize(10);
  doc.text(st.tenant.name, margin, y);
  const contact = [st.tenant.phone, st.tenant.email, st.tenant.idNumber ? `ID ${st.tenant.idNumber}` : ""].filter(Boolean).join(", ");
  if (contact) {
    doc.setTextColor(GREY);
    doc.text(contact, margin, y + 14);
    doc.setTextColor(0);
    y += 14;
  }
  y += 26;

  if (!st.accounts.length) doc.text("No leases on record.", margin, y);

  for (const a of st.accounts) {
    if (y > 740) {
      doc.addPage();
      y = 50;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${a.label} (${a.currency})`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GREY);
    doc.text(`${dateLabel(a.startDate)} to ${dateLabel(a.endDate)}, ${a.status}`, margin, y + 13);
    doc.setTextColor(0);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [["Date", "Details", "Charged", "Paid", "Balance"]],
      body: a.lines.length
        ? a.lines.map((l) => [
            dateLabel(l.date),
            l.description,
            l.debit ? money(l.debit, a.currency) : "",
            l.credit ? money(l.credit, a.currency) : "",
            money(l.balance, a.currency),
          ])
        : [["", "No charges or payments yet", "", "", ""]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: GREEN },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = after() + 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${a.balance < 0 ? "In credit" : "Balance due"}: ${money(Math.abs(a.balance), a.currency)}`, pageW - margin, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 28;
  }

  doc.save(`${datePrefix()}Statement_${fileSafe(st.tenant.name)}.pdf`);
}
