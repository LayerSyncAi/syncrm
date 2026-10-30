"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FORMAT_PRESETS, getFormat } from "@/lib/syncmedia/formats";
import {
  buildFilename,
  copyPngToClipboard,
  exportPdf,
  exportPng,
  isClipboardImageSupported,
} from "@/lib/syncmedia/export";
import { inlineAssets } from "@/lib/syncmedia/images";
import {
  clearNudges,
  hasNudges,
  setNudge,
  SLOT_LABELS,
  type SlotId,
} from "@/lib/syncmedia/nudges";
import { propertyPhotos, seedFromProperty } from "@/lib/syncmedia/fromProperty";
import { resolveBrandKit } from "@/lib/syncmedia/theme";
import { EMPTY_DOC, type BrandKit, type BrochureDoc } from "@/lib/syncmedia/types";
import { syncMediaToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BrochureRenderer } from "./BrochureRenderer";
import { BrochureStage } from "./BrochureStage";
import { ContentPanel } from "./panels/ContentPanel";
import { DesignPanel } from "./panels/DesignPanel";
import { PhotoPanel } from "./panels/PhotoPanel";
import { PropertyPanel, type PickedProperty } from "./panels/PropertyPanel";

/**
 * Order matters: property, then photos, then layout. Choosing a layout is a
 * visual decision, so the photos have to be in before the layout thumbnails
 * mean anything — an empty layout picker is just six grey rectangles.
 */
const TABS = [
  { id: "property", label: "Property" },
  { id: "photos", label: "Photos" },
  { id: "layout", label: "Layout" },
  { id: "details", label: "Details" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface BrochureStudioProps {
  /**
   * Where the studio starts: the agent's saved draft if they have one, else
   * values pulled off the property they came from.
   */
  initialDoc: Partial<BrochureDoc>;
  /** The id of the draft `initialDoc` came from, when it came from one. */
  savedBrochureId?: Id<"brochures">;
  propertyId?: Id<"properties">;
  backHref: string;
}

export function BrochureStudio({
  initialDoc,
  savedBrochureId,
  propertyId,
  backHref,
}: BrochureStudioProps) {
  const [doc, setDoc] = React.useState<BrochureDoc>({ ...EMPTY_DOC, ...initialDoc });
  // Arriving from a property, the first decision is already made, so open on
  // photos. Starting blank, the property picker is the first step.
  const [tab, setTab] = React.useState<TabId>(propertyId ? "photos" : "property");
  const [property, setProperty] = React.useState<Id<"properties"> | undefined>(propertyId);

  const brandingRow = useQuery(api.branding.get, {});
  const brand: BrandKit = React.useMemo(() => resolveBrandKit(brandingRow), [brandingRow]);

  // The photo tray follows whichever property is currently selected, so
  // switching property in the panel re-stocks it without a page navigation.
  const selectedProperty = useQuery(
    api.properties.getById,
    property ? { propertyId: property } : "skip"
  );
  const trayPhotos = React.useMemo(
    () => (selectedProperty ? propertyPhotos(selectedProperty) : []),
    [selectedProperty]
  );

  /**
   * Nudging is opt-in. The preview is something agents click around in all
   * day, and a canvas where every block moves the moment you touch it would
   * mean accidentally dragging the price off-centre while trying to check it.
   */
  const [adjusting, setAdjusting] = React.useState(false);
  const [selectedSlot, setSelectedSlot] = React.useState<SlotId | null>(null);
  const [busy, setBusy] = React.useState<null | "download" | "copy">(null);
  /** Collapses the preview on a phone so the controls get the whole screen. */
  const [previewOpen, setPreviewOpen] = React.useState(true);

  const saveBrochure = useMutation(api.syncmedia.save);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  // Held in a ref, not state: the first autosave creates the row and every
  // later one has to update it, but learning the id must not itself re-run the
  // autosave effect.
  const brochureId = React.useRef<Id<"brochures"> | undefined>(savedBrochureId);

  /**
   * A second, off-screen copy of the brochure with every image inlined as a
   * data URL. Export rasterises this rather than the on-screen preview, so the
   * preview never has to be full size and remote images can't taint the canvas.
   */
  const exportRef = React.useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = React.useState<{
    doc: BrochureDoc;
    brand: BrandKit;
  } | null>(null);

  const patch = React.useCallback(
    (changes: Partial<BrochureDoc>) => setDoc((prev) => ({ ...prev, ...changes })),
    []
  );

  /**
   * Adjustments are stored against the format on show when the drag happened,
   * so `doc.formatKey` is read from the previous state rather than closed over
   * — mid-drag it is always current, and a stale value would write the offset
   * onto whichever format was selected when the handler was created.
   */
  const nudgeSlot = React.useCallback(
    (slot: SlotId, offset: { x: number; y: number }) =>
      setDoc((prev) => ({
        ...prev,
        nudges: setNudge(prev.nudges, prev.formatKey, slot, offset),
      })),
    []
  );

  const adjustState = React.useMemo(
    () =>
      adjusting
        ? { selected: selectedSlot, onSelect: setSelectedSlot, onChange: nudgeSlot }
        : null,
    [adjusting, selectedSlot, nudgeSlot]
  );

  const formatAdjusted = hasNudges(doc.nudges, doc.formatKey);

  /**
   * Switching property pulls the new property's photos and copy across and
   * starts a *fresh* draft: re-pointing the current row would quietly rewrite
   * the brochure the agent already built for the previous property.
   *
   * Contact details are kept — the agent putting their number on it hasn't
   * changed just because the property has.
   */
  function pickProperty(picked: PickedProperty) {
    if (picked._id === property) return;
    brochureId.current = undefined;
    setProperty(picked._id);
    patch(seedFromProperty(picked));
    setSaveState("idle");
    setTab("photos");
  }

  /**
   * Detach from the property to build a brochure for one that isn't on the
   * system yet. Whatever has been typed or uploaded stays — only the link to
   * the property goes, so nothing the agent did is thrown away.
   */
  function detachProperty() {
    if (property === undefined) return;
    brochureId.current = undefined;
    setProperty(undefined);
    setSaveState("idle");
    setTab("photos");
  }

  /**
   * Autosave, debounced so a burst of typing is one write.
   *
   * Only `ref` is persisted for each photo — the `url` beside it is an object
   * URL for freshly uploaded files, so writing that back would save a link
   * that dies with the tab.
   */
  React.useEffect(() => {
    // Nothing worth a row yet, and this keeps merely opening the studio from
    // littering the table with empty drafts.
    if (!doc.title.trim() && doc.photos.length === 0) return;

    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        const id = await saveBrochure({
          id: brochureId.current,
          propertyId: property,
          formatKey: doc.formatKey,
          templateId: doc.templateId,
          themeId: doc.themeId,
          photos: doc.photos.map((p) => p.ref),
          eyebrow: doc.eyebrow,
          title: doc.title,
          location: doc.location,
          price: doc.price,
          priceLabel: doc.priceLabel,
          features: doc.features,
          reference: doc.reference,
          agentName: doc.agentName,
          agentPhone: doc.agentPhone,
          agentEmail: doc.agentEmail,
          showLogo: doc.showLogo,
          whatsappContact: doc.whatsappContact,
          nudges: doc.nudges,
        });
        brochureId.current = id;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [doc, property, saveBrochure]);

  /**
   * @returns how many images could not be made readable, and so will come out
   *          blank in the raster.
   */
  async function withExportNode(run: (node: HTMLElement) => Promise<void>) {
    const { photos, logoUrl, logoOnDarkUrl, failed } = await inlineAssets(
      doc.photos,
      brand.logoUrl,
      brand.logoOnDarkUrl
    );

    // flushSync guarantees the node exists before we read the ref; a plain
    // setState would still be pending at this point in the async function.
    flushSync(() =>
      setExportState({
        doc: { ...doc, photos },
        brand: { ...brand, logoUrl, logoOnDarkUrl },
      })
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const node = exportRef.current;
    if (!node) throw new Error("Could not prepare the brochure for export.");
    try {
      await run(node);
    } finally {
      setExportState(null);
    }
    return failed;
  }

  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const preset = getFormat(doc.formatKey);
      const name = buildFilename(doc.title, doc.formatKey);
      const failed = await withExportNode(async (node) => {
        if (preset.kind === "print") {
          await exportPdf(node, preset, `${name}.pdf`);
        } else {
          await exportPng(node, preset, `${name}.png`);
        }
      });
      if (failed > 0) {
        syncMediaToasts.downloadedWithGaps(failed);
      } else {
        syncMediaToasts.downloaded(preset.kind === "print" ? "PDF" : "PNG");
      }
    } catch (error) {
      console.error("Brochure export failed", error);
      syncMediaToasts.downloadFailed();
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    if (busy) return;
    setBusy("copy");
    try {
      const preset = getFormat(doc.formatKey);
      await withExportNode((node) => copyPngToClipboard(node, preset));
      syncMediaToasts.copied();
    } catch (error) {
      console.error("Brochure copy failed", error);
      syncMediaToasts.copyFailed();
    } finally {
      setBusy(null);
    }
  }

  const ready = doc.photos.length > 0 && doc.title.trim().length > 0;
  const canCopy = isClipboardImageSupported();

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Draft saved"
        : saveState === "error"
          ? "Couldn't save your draft"
          : "Changes appear in the preview as you make them.";

  return (
    <div className="flex h-full flex-col bg-content-bg">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border-strong bg-card-bg px-3 py-2.5 sm:px-5">
        <Link
          href={backHref}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted transition hover:bg-row-hover hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text sm:text-base">
            Brochure studio
          </h1>
          <p className="truncate text-xs text-text-muted">{saveLabel}</p>
        </div>

        {/* On a phone there is only room for the primary action; Copy moves
            into the panel footer below. */}
        {canCopy ? (
          <span className="hidden sm:block">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={!ready || busy !== null}
            >
              {busy === "copy" ? "Copying…" : "Copy image"}
            </Button>
          </span>
        ) : null}
        <Button size="sm" onClick={handleDownload} disabled={!ready || busy !== null}>
          {busy === "download" ? "Preparing…" : "Download"}
        </Button>
      </header>

      {/* Canvas comes first in the DOM so it sits on top on a phone and, with
          row-reverse, on the right on a desktop. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row-reverse">
        <div
          className={cn(
            "flex flex-shrink-0 flex-col gap-2 bg-bg p-3 lg:flex-1 lg:p-8",
            // Phones are short: a fixed preview would leave the form in a
            // letterbox, so it collapses to a strip and hands back the screen.
            previewOpen ? "h-[40dvh]" : "h-auto",
            "lg:h-auto"
          )}
        >
          <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto lg:flex-wrap lg:justify-center lg:overflow-visible">
            {FORMAT_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => patch({ formatKey: preset.key })}
                className={cn(
                  "flex-shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition",
                  doc.formatKey === preset.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card-bg text-text-muted hover:text-text"
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreviewOpen((open) => !open)}
              aria-expanded={previewOpen}
              className="ml-auto flex-shrink-0 cursor-pointer rounded-full bg-card-bg px-3 py-1.5 text-xs font-medium text-text-muted lg:hidden"
            >
              {previewOpen ? "Hide preview" : "Show preview"}
            </button>
          </div>

          {/* Adjust bar. Sits under the format chips because an adjustment
              belongs to the format above it — moving the price on the portrait
              post leaves the banner alone. */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAdjusting((on) => !on);
                setSelectedSlot(null);
              }}
              aria-pressed={adjusting}
              className={cn(
                "flex-shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition",
                adjusting
                  ? "bg-primary text-primary-foreground"
                  : "bg-card-bg text-text-muted hover:text-text"
              )}
            >
              {adjusting ? "Done adjusting" : "Adjust positions"}
            </button>

            {adjusting ? (
              <p className="min-w-0 text-xs text-text-muted">
                {selectedSlot
                  ? `${SLOT_LABELS[selectedSlot]} — drag it, or use the arrow keys. Delete puts it back.`
                  : "Drag any block to move it. Only this format is affected."}
              </p>
            ) : null}

            {formatAdjusted ? (
              <button
                type="button"
                onClick={() => {
                  patch({ nudges: clearNudges(doc.nudges, doc.formatKey) });
                  setSelectedSlot(null);
                }}
                className="ml-auto flex-shrink-0 cursor-pointer rounded-full bg-card-bg px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text"
              >
                Reset {getFormat(doc.formatKey).label.toLowerCase()}
              </button>
            ) : null}
          </div>

          {/* Wrapped rather than hidden directly: BrochureStage sets
              `display: flex` inline, which a utility class cannot override. */}
          <div className={cn("min-h-0 flex-1", previewOpen ? "flex" : "hidden lg:flex")}>
            <BrochureStage
              doc={doc}
              brand={brand}
              className="min-h-0 flex-1"
              adjust={adjustState}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-border-strong bg-card-bg lg:w-[400px] lg:flex-none lg:border-r lg:border-t-0">
          <div
            role="tablist"
            className="flex flex-shrink-0 border-b border-border-strong px-2"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 cursor-pointer border-b-2 px-2 py-2.5 text-sm font-medium transition",
                  tab === t.id
                    ? "border-primary text-primary-ink"
                    : "border-transparent text-text-muted hover:text-text"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            {tab === "property" ? (
              <PropertyPanel
                selectedPropertyId={property}
                onPick={pickProperty}
                onClear={detachProperty}
              />
            ) : null}
            {tab === "photos" ? (
              <PhotoPanel doc={doc} patch={patch} propertyPhotos={trayPhotos} />
            ) : null}
            {tab === "layout" ? (
              <DesignPanel doc={doc} patch={patch} brand={brand} />
            ) : null}
            {tab === "details" ? <ContentPanel doc={doc} patch={patch} /> : null}

            {!ready ? (
              <p className="mt-6 rounded-lg bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--status-warning-fg)]">
                Add {doc.photos.length === 0 ? "a photo" : ""}
                {doc.photos.length === 0 && !doc.title.trim() ? " and " : ""}
                {!doc.title.trim() ? "a title" : ""} to enable downloading.
              </p>
            ) : null}

            {/* Copy doesn't fit the phone header, so it lives here instead of
                being unavailable on the device most likely to want it. */}
            {canCopy ? (
              <span className="mt-6 block sm:hidden">
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  disabled={!ready || busy !== null}
                  className="w-full"
                >
                  {busy === "copy" ? "Copying…" : "Copy image for WhatsApp"}
                </Button>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Off-screen full-resolution copy, mounted only while exporting. */}
      {exportState ? (
        <div
          data-brochure-export
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            opacity: 0,
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          <BrochureRenderer
            ref={exportRef}
            doc={exportState.doc}
            brand={exportState.brand}
          />
        </div>
      ) : null}
    </div>
  );
}
