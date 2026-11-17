"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One logo upload slot with a preview on the background it will sit on.
 * Shared by the Brand kit page and the Platform onboarding wizard; the
 * caller owns the hidden file input and the upload itself.
 */
export function LogoSlot({
  label,
  hint,
  url,
  busy,
  background,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  url?: string;
  busy: boolean;
  background: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      <div
        className="flex h-24 items-center justify-center rounded-[10px] border border-border"
        style={{ backgroundColor: background }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-16 max-w-[80%] object-contain" />
        ) : (
          <span className="text-xs text-text-muted">Nothing uploaded</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onPick} disabled={busy}>
          <ImagePlus className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
