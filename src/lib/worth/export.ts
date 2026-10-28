/** Excel export for Sync Worth reports and the import template. xlsx loads on demand. */
import { downloadBlob } from "@/lib/csv";

export type Sheet = { name: string; headers: string[]; rows: unknown[][] };

export async function downloadXlsx(filename: string, sheets: Sheet[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
    ws["!cols"] = s.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    // Sheet names are limited to 31 characters.
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}.xlsx`
  );
}

/** First sheet of an uploaded workbook as rows of cells. */
export async function readFirstSheet(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
}
