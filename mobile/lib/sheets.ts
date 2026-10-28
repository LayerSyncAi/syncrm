/**
 * Excel workbooks on a phone, with SheetJS (the same library the website
 * uses). Imports accept .xlsx/.xls as well as CSV; exports can be written as
 * .xlsx so a file made on the phone opens the same as one from the website.
 */
import * as XLSX from "xlsx";
import * as LegacyFS from "expo-file-system/legacy";
import { File, Paths } from "expo-file-system";
import type { PickedFile } from "./files";
import { shareFile } from "./files";

export function isWorkbook(name: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(name);
}

async function readWorkbook(uri: string): Promise<XLSX.WorkBook> {
  const b64 = await LegacyFS.readAsStringAsync(uri, { encoding: LegacyFS.EncodingType.Base64 });
  return XLSX.read(b64, { type: "base64", cellDates: true });
}

function firstSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  const name = wb.SheetNames[0];
  if (!name) throw new Error("The workbook has no sheets.");
  return wb.Sheets[name]!;
}

/** A picked CSV or workbook as CSV text (first sheet of a workbook). */
export async function readAsCsv(file: PickedFile): Promise<string> {
  if (!isWorkbook(file.name)) return new File(file.uri).text();
  return XLSX.utils.sheet_to_csv(firstSheet(await readWorkbook(file.uri)), { blankrows: false });
}

/** A picked CSV or workbook as row objects keyed by the header row. */
export async function readAsObjects(file: PickedFile): Promise<Record<string, unknown>[]> {
  const wb = isWorkbook(file.name)
    ? await readWorkbook(file.uri)
    : XLSX.read(await new File(file.uri).text(), { type: "string", cellDates: true });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet(wb), { defval: "" });
}

/** Write rows (first row = headers) to an .xlsx file and open the share sheet. */
export async function shareXlsx(rows: unknown[][], fileName: string, sheetName = "Sheet1"): Promise<void> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31));
  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  const name = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  const file = new File(Paths.cache, name.replace(/[\\/:*?"<>|]+/g, "-"));
  await LegacyFS.writeAsStringAsync(file.uri, b64, { encoding: LegacyFS.EncodingType.Base64 });
  await shareFile(file.uri, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name);
}

/** Convert CSV text to rows, for exports that already build CSV. */
export function csvRows(csv: string): unknown[][] {
  const wb = XLSX.read(csv, { type: "string", raw: true });
  return XLSX.utils.sheet_to_json<unknown[]>(firstSheet(wb), { header: 1, raw: true, defval: "" });
}
