/**
 * Excel export for Stay reports, the counterpart of exportReportPdf in
 * src/lib/report-export.ts. One sheet per table plus a Summary sheet.
 */
import type { ExportPayload } from "../report-export";

/** Excel limits sheet names to 31 characters and bans a few symbols. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let n = base;
  let i = 2;
  while (used.has(n)) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n);
  return n;
}

export async function exportReportXlsx(p: ExportPayload): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const summary: unknown[][] = [[p.title], ...(p.subtitle ? [[p.subtitle]] : []), []];
  for (const s of p.summary ?? []) summary.push([s.label, s.value]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), sheetName("Summary", used));

  for (const t of p.tables) {
    const rows = [
      t.columns.map((c) => c.label),
      ...t.rows.map((r) => t.columns.map((c) => (r[c.key] === null || r[c.key] === undefined ? "" : r[c.key]))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = t.columns.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(t.name, used));
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
