/** Client-side photo handling: shrink before upload so phone photos stay small. */

export type PhotoItem = { storageId: string; url: string };

const MAX_SIDE = 1600;
const QUALITY = 0.7;

/** Resize to at most `maxSide` pixels on the long edge and re-encode as JPEG. */
export async function compressImage(
  file: Blob,
  maxSide = MAX_SIDE,
  quality = QUALITY
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Could not process the photo");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process the photo"))),
      "image/jpeg",
      quality
    )
  );
}

/** Compress a picked image and upload it. `getUploadUrl` is a generateUploadUrl mutation. */
export async function uploadPhoto(
  file: File,
  getUploadUrl: () => Promise<string>
): Promise<PhotoItem> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  const blob = await compressImage(file);
  const res = await fetch(await getUploadUrl(), {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!res.ok) throw new Error("Photo upload failed");
  const { storageId } = (await res.json()) as { storageId: string };
  return { storageId, url: URL.createObjectURL(blob) };
}

/** Fetch a stored photo and shrink it for a PDF. Returns a JPEG data URL, or null on failure. */
export async function fetchForPdf(url: string, maxSide = 800): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const small = await compressImage(await res.blob(), maxSide, 0.7);
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(small);
    });
  } catch {
    return null;
  }
}
