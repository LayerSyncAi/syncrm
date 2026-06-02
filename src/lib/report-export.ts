import { generateCSV, downloadBlob } from "./csv";

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportTable {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

export interface ExportPayload {
  /** File name without extension. */
  filename: string;
  title: string;
  /** Usually the reporting-period label. */
  subtitle?: string;
  summary?: { label: string; value: string }[];
  tables: ExportTable[];
}

function cell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v === null || v === undefined ? "" : String(v);
}

/** Export a report payload as a single CSV file (one block per table). */
export function exportReportCsv(p: ExportPayload): void {
  const blocks: string[] = [];
  blocks.push(p.title + (p.subtitle ? ` (${p.subtitle})` : ""));

  if (p.summary && p.summary.length) {
    blocks.push("");
    blocks.push(
      generateCSV(["Metric", "Value"], p.summary.map((s) => [s.label, s.value]))
    );
  }

  for (const t of p.tables) {
    blocks.push("");
    blocks.push(t.name);
    blocks.push(
      generateCSV(
        t.columns.map((c) => c.label),
        t.rows.map((r) => t.columns.map((c) => cell(r, c.key)))
      )
    );
  }

  const csv = blocks.join("\n");
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    `${p.filename}.csv`
  );
}

function finalY(doc: unknown): number {
  return (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;
}

// Theme colours (RGB) matching the app tokens.
const GREEN: [number, number, number] = [42, 89, 37];

/** Export a report payload as a formatted PDF (jsPDF is loaded on demand). */
export async function exportReportPdf(p: ExportPayload): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const marginX = 40;
  let cursorY = 50;

  doc.setFontSize(16);
  doc.text(p.title, marginX, cursorY);
  cursorY += 16;

  if (p.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(p.subtitle, marginX, cursorY);
    doc.setTextColor(0);
    cursorY += 6;
  }

  if (p.summary && p.summary.length) {
    autoTable(doc, {
      startY: cursorY + 8,
      head: [["Metric", "Value"]],
      body: p.summary.map((s) => [s.label, s.value]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: GREEN },
      margin: { left: marginX, right: marginX },
    });
    cursorY = finalY(doc) + 18;
  }

  for (const t of p.tables) {
    doc.setFontSize(11);
    doc.text(t.name, marginX, cursorY);
    autoTable(doc, {
      startY: cursorY + 6,
      head: [t.columns.map((c) => c.label)],
      body: t.rows.map((r) => t.columns.map((c) => cell(r, c.key))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: GREEN },
      margin: { left: marginX, right: marginX },
    });
    cursorY = finalY(doc) + 24;
  }

  doc.save(`${p.filename}.pdf`);
}
