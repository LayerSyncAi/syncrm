/**
 * Phone file helpers for SyncWorth: inspection photos (several at once),
 * images embedded in report PDFs, named PDF files for upload and sharing,
 * and CSV in and out (the website's Excel export and import).
 */
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import { File, Paths } from "expo-file-system";
import { pickPhoto, shareFile, type PickedFile } from "../files";
import { shareXlsx } from "../sheets";
import { stampPdf, type StampOptions } from "../pdfStamp";

/** Resize to at most `maxDim` px wide and re-encode as JPEG, as lib/files does. */
async function compress(uri: string, maxDim = 1600): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxDim } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

/**
 * Take one photo with the camera, or choose several from the library. Every
 * photo is compressed before upload (about 300 KB each). Empty when cancelled.
 */
export function choosePhotos(): Promise<PickedFile[]> {
  const fromLibrary = async (): Promise<PickedFile[]> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access in Settings to add photos.");
      return [];
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 20 });
    if (res.canceled) return [];
    const out: PickedFile[] = [];
    for (const [i, a] of res.assets.entries()) {
      out.push({ uri: await compress(a.uri), name: `photo-${Date.now()}-${i}.jpg`, mimeType: "image/jpeg" });
    }
    return out;
  };
  return new Promise((resolve) => {
    Alert.alert("Add photos", undefined, [
      { text: "Take photo", onPress: () => pickPhoto("camera").then((p) => resolve(p ? [p] : [])) },
      { text: "Choose from library", onPress: () => fromLibrary().then(resolve) },
      { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
    ]);
  });
}

/**
 * Fetch an image and return a data URI the PDF can embed, so the printer
 * never waits on the network. Photos become JPEG; logos and signatures keep
 * PNG transparency. Null on any failure: a missing image never blocks a report.
 */
export async function imageDataUri(url: string | null | undefined, opts: { maxDim?: number; png?: boolean } = {}): Promise<string | null> {
  if (!url) return null;
  try {
    const dest = new File(Paths.cache, `worth-img-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const local = await File.downloadFileAsync(url, dest);
    // Only ever shrink: a small logo stays its own size.
    const max = opts.maxDim ?? 1200;
    const size = await ImageManipulator.manipulateAsync(local.uri, []);
    const actions = Math.max(size.width, size.height) > max ? [{ resize: size.width >= size.height ? { width: max } : { height: max } }] : [];
    const out = await ImageManipulator.manipulateAsync(local.uri, actions, {
      compress: 0.8,
      format: opts.png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    try {
      local.delete();
    } catch {
      // Cache files are cleared by the system anyway.
    }
    return out.base64 ? `data:image/${opts.png ? "png" : "jpeg"};base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

/** Render HTML to an A4 PDF in the cache under a readable file name. */
export async function printPdf(html: string, fileName: string, stamp?: StampOptions): Promise<PickedFile> {
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // Page numbers on every page, plus the report's running header and DRAFT mark.
  await stampPdf(uri, stamp).catch(() => {});
  try {
    const named = new File(Paths.cache, fileName);
    await new File(uri).move(named, { overwrite: true });
    return { uri: named.uri, name: fileName, mimeType: "application/pdf" };
  } catch {
    return { uri, name: fileName, mimeType: "application/pdf" };
  }
}

export async function sharePdfFile(file: PickedFile): Promise<void> {
  await shareFile(file.uri, "application/pdf", file.name);
}

// ── CSV ────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Share rows as an Excel workbook (save, email, WhatsApp), as the website exports. */
export async function shareCsv(fileName: string, headers: string[], rows: unknown[][]): Promise<void> {
  await shareXlsx([headers, ...rows], fileName.replace(/\.csv$/i, ""));
}

/** Parse CSV text (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Read a picked text file (CSV) from the device. */
export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}
