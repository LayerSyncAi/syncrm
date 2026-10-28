/**
 * Photos, uploads and documents on a phone.
 *
 * Uploads go to Convex storage the same way as on the website: ask the
 * backend for an upload URL, POST the file, keep the returned storage id.
 * PDFs are built from HTML with expo-print and handed to the share sheet,
 * which is how a phone saves, prints or emails a file.
 */
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { stampPdf, type StampOptions } from "./pdfStamp";
import { Alert } from "react-native";

export type PickedFile = { uri: string; name: string; mimeType: string; size?: number };

/** Resize to at most 1600 px and re-encode as JPEG, for weak connections. */
async function compress(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

/** Take a photo or choose from the library, compressed. Null when cancelled. */
export async function pickPhoto(source: "camera" | "library" = "library"): Promise<PickedFile | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo"} access in Settings to add photos.`);
    return null;
  }
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (res.canceled || !res.assets[0]) return null;
  const uri = await compress(res.assets[0].uri);
  return { uri, name: `photo-${Date.now()}.jpg`, mimeType: "image/jpeg" };
}

/** Ask whether to use the camera or the library, then pick. */
export function choosePhoto(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    Alert.alert("Add photo", undefined, [
      { text: "Take photo", onPress: () => pickPhoto("camera").then(resolve) },
      { text: "Choose from library", onPress: () => pickPhoto("library").then(resolve) },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/** Pick any document (PDF, Word, image). Null when cancelled. */
export async function pickDocument(types: string[] = ["*/*"]): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", size: a.size ?? undefined };
}

/**
 * Upload a picked file to Convex storage. `getUploadUrl` is the module's
 * generateUploadUrl mutation (e.g. api.storage.generateUploadUrl).
 */
export async function uploadFile(getUploadUrl: () => Promise<string>, file: PickedFile): Promise<string> {
  const url = await getUploadUrl();
  const blob = await (await fetch(file.uri)).blob();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.mimeType }, body: blob });
  if (!res.ok) throw new Error("Upload failed. Check your connection and try again.");
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}

/** Render HTML to an A4 PDF, number its pages, and open the share sheet (save, print, email). */
export async function sharePdf(html: string, fileName: string, stamp?: StampOptions): Promise<void> {
  const printed = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // Page numbers (and any header or watermark) on every page; the PDF is
  // still shared unstamped if this fails.
  await stampPdf(printed.uri, stamp).catch(() => {});
  // expo-print names the file at random; give it the caller's name so the
  // saved or emailed PDF reads e.g. "261028_Receipt_RC-00012.pdf".
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, "-");
  const named = new File(Paths.cache, safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`);
  let uri = printed.uri;
  try {
    await new File(printed.uri).move(named, { overwrite: true });
    uri = named.uri;
  } catch {
    // Keep expo-print's own file if the rename fails; sharing still works.
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: fileName, UTI: "com.adobe.pdf" });
  } else {
    await Print.printAsync({ uri });
  }
}

/** Share a file already on the device (e.g. an exported spreadsheet). */
export async function shareFile(uri: string, mimeType: string, title: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
}

/** Minimal HTML escaping for PDF templates. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A4 document shell shared by every PDF, with the agency header. */
export function pdfShell(opts: { title: string; agencyName: string; agencyLines?: string[]; logoUrl?: string | null; body: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1f2a44; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 18px 0 6px; color: #2a5925; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #dfe3ee; vertical-align: top; }
  th { background: #f1f4f9; font-weight: 600; } .r { text-align: right; } .muted { color: #5b647f; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2a5925; padding-bottom: 10px; margin-bottom: 14px; }
  .total td { font-weight: 700; border-top: 2px solid #1f2a44; } img.logo { max-height: 48px; }
  .photos { display: flex; flex-wrap: wrap; gap: 6px; } .photos img { width: 160px; height: 120px; object-fit: cover; border-radius: 4px; }
  </style></head><body>
  <div class="head"><div><h1>${esc(opts.title)}</h1><div class="muted">${esc(opts.agencyName)}</div>${(opts.agencyLines ?? [])
    .filter(Boolean)
    .map((l) => `<div class="muted">${esc(l)}</div>`)
    .join("")}</div>${opts.logoUrl ? `<img class="logo" src="${esc(opts.logoUrl)}"/>` : ""}</div>
  ${opts.body}
  </body></html>`;
}
