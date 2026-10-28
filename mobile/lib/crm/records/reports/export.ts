/**
 * Report export, the CSV half of the website's src/lib/report-export.ts.
 * The file is written to the cache folder and handed to the share sheet.
 */
import { csvRows, shareXlsx } from "../../../sheets";
import { moneyMap } from "../../../format";

export type ExportTable = { name: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> };
export type ExportPayload = { filename: string; title: string; subtitle?: string; summary?: Array<{ label: string; value: string }>; tables: ExportTable[] };

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLines(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function reportCsv(p: ExportPayload): string {
  const blocks: string[] = [p.title + (p.subtitle ? ` (${p.subtitle})` : "")];
  if (p.summary?.length) {
    blocks.push("", csvLines(["Metric", "Value"], p.summary.map((s) => [s.label, s.value])));
  }
  for (const t of p.tables) {
    blocks.push("", t.name, csvLines(t.columns.map((c) => c.label), t.rows.map((r) => t.columns.map((c) => r[c.key]))));
  }
  return blocks.join("\n");
}

/** Write the report as an Excel workbook and open the share sheet. */
export async function shareReportCsv(p: ExportPayload): Promise<void> {
  await shareXlsx(csvRows(reportCsv(p)), p.filename.replace(/[^\w.-]+/g, "-"), p.title);
}

/** A per-currency map as text, never summed across currencies. */
export function currencyText(m: Record<string, number> | undefined): string {
  return moneyMap(m);
}
