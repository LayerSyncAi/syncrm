/**
 * One A4 layout for every Sync Finance document: receipts, payment
 * vouchers, remittance advices, invoices and statements. Each screen
 * describes its document as data; this draws it with the agency's
 * letterhead (BRD §8: branded, prints cleanly on A4).
 */
import { letterhead } from "../stay/pdf";
import { datePrefix, fileSafe } from "../stay/format";
import type { FinanceDocument } from "../../../convex/finance/documents";

export type { FinanceDocument };

type JsPDFCtor = (typeof import("jspdf"))["jsPDF"];
type AutoTable = (typeof import("jspdf-autotable"))["default"];

const GREEN: [number, number, number] = [13, 148, 136];
const GREY = 110;

export async function downloadFinancePdf(d: FinanceDocument, logoUrl?: string | null): Promise<void> {
  const doc = await renderFinancePdf(d, logoUrl);
  doc.save(financePdfName(d));
}

/** File name for a document, with the YYMMDD_ prefix. */
export function financePdfName(d: FinanceDocument): string {
  return `${datePrefix()}${fileSafe(d.fileName)}.pdf`;
}

/**
 * Draw the document. Used in the browser (download) and on the server
 * (emailed as an attachment), where `logoUrl` is a data URL.
 */
export async function renderFinancePdf(d: FinanceDocument, logoUrl?: string | null) {
  // The browser build exports named members; the Node build (server PDFs)
  // nests them under `default`.
  const pdfMod = (await import("jspdf")) as unknown as { jsPDF?: JsPDFCtor; default?: { jsPDF?: JsPDFCtor } & JsPDFCtor };
  const jsPDF = (pdfMod.jsPDF ?? pdfMod.default?.jsPDF ?? pdfMod.default) as JsPDFCtor;
  const tableMod = (await import("jspdf-autotable")) as unknown as { default?: AutoTable | { default?: AutoTable }; autoTable?: AutoTable };
  const autoTable = (typeof tableMod.default === "function" ? tableMod.default : (tableMod.default as { default?: AutoTable })?.default ?? tableMod.autoTable) as AutoTable;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const room = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  let y = await letterhead(doc, d.agency, logoUrl);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(d.title, margin, y);
  doc.setFontSize(11);
  if (d.number) doc.text(d.number, pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  if (d.date) {
    doc.setFontSize(10);
    doc.setTextColor(GREY);
    doc.text(d.date, pageW - margin, y + 14, { align: "right" });
    doc.setTextColor(0);
  }
  y += 28;

  if (d.party) {
    doc.setFontSize(9);
    doc.setTextColor(GREY);
    doc.text(d.party.label, margin, y);
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(d.party.name, margin, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    (d.party.lines ?? []).forEach((l, i) => doc.text(l, margin, y + 28 + i * 12));
    y += 30 + (d.party.lines?.length ?? 0) * 12;
  }

  if (d.facts?.length) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { textColor: GREY, cellWidth: 150 } },
      body: d.facts,
      margin: { left: margin, right: margin },
    });
    y = after() + 12;
  }

  if (d.highlight) {
    room(70);
    doc.setFillColor(240, 253, 250);
    doc.roundedRect(margin, y, pageW - margin * 2, 52, 6, 6, "F");
    doc.setFontSize(10);
    doc.setTextColor(GREY);
    doc.text(d.highlight.label, margin + 16, y + 20);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(d.highlight.value, margin + 16, y + 42);
    doc.setFont("helvetica", "normal");
    y += 70;
  }

  for (const t of d.tables ?? []) {
    room(60);
    if (t.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(t.title, margin, y);
      doc.setFont("helvetica", "normal");
      y += 8;
    }
    if (!t.body.length) {
      doc.setFontSize(9);
      doc.setTextColor(GREY);
      doc.text("Nothing in this period.", margin, y + 12);
      doc.setTextColor(0);
      y += 26;
      continue;
    }
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.body,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: GREEN },
      columnStyles: Object.fromEntries((t.alignRight ?? []).map((i) => [i, { halign: "right" as const }])),
      // Headings sit over their figures.
      didParseCell: (h) => {
        if (h.section === "head" && (t.alignRight ?? []).includes(h.column.index)) h.cell.styles.halign = "right";
      },
      margin: { left: margin, right: margin },
    });
    y = after() + 16;
  }

  if (d.totals?.length) {
    room(d.totals.length * 18 + 20);
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: pageW - margin * 2 - 140 }, 1: { halign: "right" } },
      body: d.totals,
      didParseCell: (h) => {
        if (h.row.index === d.totals!.length - 1) h.cell.styles.fontStyle = "bold";
      },
      margin: { left: margin, right: margin },
    });
    y = after() + 12;
  }

  if (d.notes?.length) {
    doc.setFontSize(9);
    doc.setTextColor(GREY);
    for (const n of d.notes) {
      room(14);
      const lines = doc.splitTextToSize(n, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 12;
    }
    doc.setTextColor(0);
  }

  if (d.stamp) {
    doc.setPage(1);
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(48);
    doc.text(d.stamp, pageW / 2, 420, { align: "center", angle: 30 });
    doc.setTextColor(0);
  }

  return doc;
}
