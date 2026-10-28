"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { Camera, X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { uploadPhoto, type PhotoItem } from "@/lib/stay-ops/photos";
import { cn } from "@/lib/utils";

/**
 * Thumbnails with an add button. Photos are shrunk in the browser and
 * uploaded straight away; `onChange` gets the new list. On a phone the add
 * button opens the camera or the gallery.
 */
export function PhotoStrip({
  photos,
  onChange,
  max = 8,
  disabled,
  className,
}: {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...photos];
      for (const f of Array.from(files)) {
        if (next.length >= max) {
          setError(`Up to ${max} photos`);
          break;
        }
        next.push(await uploadPhoto(f, () => generateUploadUrl()));
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.storageId} className="relative h-20 w-20 overflow-hidden rounded-[10px] border border-border-strong">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            {!disabled && (
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => onChange(photos.filter((x) => x.storageId !== p.storageId))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!disabled && photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border-strong text-xs text-text-muted hover:border-primary/60 disabled:opacity-50"
            )}
          >
            <Camera className="h-5 w-5" />
            {busy ? "Uploading" : "Add"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Read-only thumbnails that open the photo full size. */
export function PhotoGallery({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-[10px] border border-border-strong">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}
