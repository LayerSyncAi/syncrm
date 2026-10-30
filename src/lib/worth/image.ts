/**
 * Browser image helpers for SyncWorth: compress inspection photos before
 * upload (VW-21, weak connections) and load images for the PDF report.
 */

function loadBitmap(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the image"));
    img.src = src;
  });
}

function draw(img: HTMLImageElement, maxDim: number, background?: string) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * Resize a photo so its longest side is at most `maxDim` px and re-encode as
 * JPEG. A 12 MP phone photo of 4 MB typically becomes 250 to 400 KB.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.75): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadBitmap(url);
    const canvas = draw(img, maxDim, "#ffffff");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Could not compress the image");
    // Keep the original if it was already smaller.
    return blob.size < file.size || !file.type.startsWith("image/jpeg") ? blob : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type LoadedImage = { dataUrl: string; width: number; height: number; format: "JPEG" | "PNG" };

/**
 * Fetch an image (storage URL, logo) and return a data URL jsPDF can embed.
 * Photos become JPEG; logos and signatures stay PNG for transparency.
 * Returns null on any failure, so a missing image never blocks a report.
 */
export async function loadImageForPdf(
  url: string | null | undefined,
  opts: { maxDim?: number; png?: boolean } = {}
): Promise<LoadedImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blobUrl = URL.createObjectURL(await res.blob());
    try {
      const img = await loadBitmap(blobUrl);
      const canvas = draw(img, opts.maxDim ?? 1200, opts.png ? undefined : "#ffffff");
      return {
        dataUrl: opts.png ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.8),
        width: canvas.width,
        height: canvas.height,
        format: opts.png ? "PNG" : "JPEG",
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
}

/** Upload a blob through a Convex upload URL and return its storage id. */
export async function uploadBlob(uploadUrl: string, blob: Blob, contentType: string): Promise<string> {
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: blob });
  if (!res.ok) throw new Error("Upload failed");
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}
