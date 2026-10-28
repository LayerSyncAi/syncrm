/**
 * The brochure studio on a phone: live preview on top, edit tabs below,
 * autosave to the same api.syncmedia.save the website uses, and export to a
 * PNG (or an A4 PDF for the print format) through the share sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image } from "expo-image";
import { Alert, Pressable, Text, View, useWindowDimensions, type HostInstance } from "react-native";
import { captureRef } from "react-native-view-shot";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, Chips, Field, Ionicons, Notice, Screen, SearchBar, Section, Toggle } from "../ui";
import { BrochureCanvas } from "./BrochureCanvas";
import { FORMAT_PRESETS, getFormat } from "@/lib/syncmedia/formats";
import { clearNudges, getNudge, hasNudges, SLOT_LABELS, setNudge, type SlotId } from "@/lib/syncmedia/nudges";
import { TEMPLATES } from "@/lib/syncmedia/templates";
import { themesFor } from "@/lib/syncmedia/theme";
import { propertyPhotos, seedFromProperty, type BrochureProperty } from "@/lib/syncmedia/fromProperty";
import type { BrandKit, BrochureDoc, Photo } from "@/lib/syncmedia/types";
import { MAX_FEATURES, MAX_PHOTOS } from "../../lib/media/doc";
import { choosePhoto, sharePdf, shareFile, uploadFile } from "../../lib/files";
import { useRun } from "../../lib/useRun";
import { colors, font, radius, space } from "../../lib/theme";

type Tab = "property" | "photos" | "content" | "design";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "property", label: "Property" },
  { value: "photos", label: "Photos" },
  { value: "content", label: "Text" },
  { value: "design", label: "Design" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function Studio({
  initialDoc,
  savedBrochureId,
  propertyId,
  brand,
}: {
  initialDoc: BrochureDoc;
  savedBrochureId?: Id<"brochures">;
  propertyId?: Id<"properties">;
  brand: BrandKit;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [doc, setDoc] = useState<BrochureDoc>(initialDoc);
  const [tab, setTab] = useState<Tab>(propertyId ? "photos" : "property");
  const [property, setProperty] = useState<Id<"properties"> | undefined>(propertyId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [exporting, setExporting] = useState(false);
  // Adjust mode: tap a block to select it, drag to move it.
  const [adjusting, setAdjusting] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HostInstance>(null);
  // A ref, not state: the first save creates the row and later saves update it.
  const brochureId = useRef<Id<"brochures"> | undefined>(savedBrochureId);
  const saveBrochure = useMutation(api.syncmedia.save);

  const patch = (changes: Partial<BrochureDoc>) => setDoc((prev) => ({ ...prev, ...changes }));

  // Autosave, debounced so a burst of typing is one write. Only the ref of
  // each photo is stored; the url beside it is display-only.
  useEffect(() => {
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

  const preset = getFormat(doc.formatKey);
  // Stored against the format on show; read from prev so mid-drag is current.
  const nudgeSlot = useCallback(
    (slot: SlotId, offset: { x: number; y: number }) =>
      setDoc((prev) => ({ ...prev, nudges: setNudge(prev.nudges, prev.formatKey, slot, offset) })),
    []
  );
  const adjustState = useMemo(
    () => (adjusting && !exporting ? { selected: selectedSlot, onSelect: setSelectedSlot, onChange: nudgeSlot, onDrag: setDragging } : null),
    [adjusting, exporting, selectedSlot, nudgeSlot]
  );
  const selectedOffset = selectedSlot ? getNudge(doc.nudges, doc.formatKey, selectedSlot) : null;
  // Fit the preview to the screen: full width, but no taller than 60% of it.
  const maxW = winW - space.lg * 2;
  const previewW = Math.floor(Math.min(maxW, (winH * 0.6 * preset.width) / preset.height));

  async function exportBrochure() {
    if (exporting || !canvasRef.current) return;
    setExporting(true);
    try {
      // Let the editing outlines drop out of the view before it is captured.
      await new Promise((r) => setTimeout(r, 120));
      const name = (doc.title.trim() || "brochure").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      if (preset.kind === "print") {
        // The A4 flyer goes out as a PDF: the PNG capture placed on one page.
        const data = await captureRef(canvasRef, { format: "png", result: "data-uri", width: preset.width, height: preset.height });
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;height:100%}</style></head><body><img src="${data}"/></body></html>`;
        await sharePdf(html, `${name}.pdf`);
      } else {
        const uri = await captureRef(canvasRef, { format: "png", quality: 1, result: "tmpfile", width: preset.width, height: preset.height });
        await shareFile(uri, "image/png", `${name}.png`);
      }
    } catch {
      Alert.alert("Could not export", "The brochure could not be made into an image. Wait for the photos to load and try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen contentStyle={{ gap: space.md }} scrollEnabled={!dragging}>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <View style={{ borderWidth: 1, borderColor: colors.borderStrong }}>
          <BrochureCanvas ref={canvasRef} doc={doc} brand={brand} width={previewW} adjust={adjustState} />
        </View>
        <Body small muted>
          {preset.width} x {preset.height} px · {saveLabel(saveState)}
        </Body>
      </View>
      <Button
        title={preset.kind === "print" ? "Export A4 PDF" : "Export image"}
        icon="share-outline"
        variant="brand"
        onPress={exportBrochure}
        loading={exporting}
      />

      <Button
        title={adjusting ? "Done adjusting" : "Adjust layout"}
        icon={adjusting ? "checkmark" : "move-outline"}
        variant="secondary"
        onPress={() => {
          setAdjusting((a) => !a);
          setSelectedSlot(null);
        }}
      />
      {adjusting ? (
        <Card>
          <Body small muted>
            {selectedSlot ? `Drag the ${SLOT_LABELS[selectedSlot].toLowerCase()} on the preview. Offset ${selectedOffset?.x ?? 0}, ${selectedOffset?.y ?? 0} px.` : "Tap a dashed block on the preview, then drag it. Moves are saved for this format only."}
          </Body>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Reset this block" variant="secondary" small disabled={!selectedSlot} onPress={() => selectedSlot && nudgeSlot(selectedSlot, { x: 0, y: 0 })} />
            <Button
              title="Reset all"
              variant="secondary"
              small
              disabled={!hasNudges(doc.nudges, doc.formatKey)}
              onPress={() => patch({ nudges: clearNudges(doc.nudges, doc.formatKey) })}
            />
          </View>
        </Card>
      ) : null}

      <Chips options={TABS} value={tab} onChange={setTab} />

      {tab === "property" && (
        <PropertyTab
          selected={property}
          onClear={() => {
            if (property === undefined) return;
            brochureId.current = undefined;
            setProperty(undefined);
            setSaveState("idle");
            setTab("photos");
          }}
          onPick={(picked) => {
            if (picked._id === property) return;
            brochureId.current = undefined;
            setProperty(picked._id);
            patch(seedFromProperty(picked));
            setSaveState("idle");
            setTab("photos");
          }}
        />
      )}
      {tab === "photos" && <PhotosTab doc={doc} property={property} patch={patch} />}
      {tab === "content" && <ContentTab doc={doc} patch={patch} />}
      {tab === "design" && <DesignTab doc={doc} brand={brand} patch={patch} />}
    </Screen>
  );
}

function saveLabel(s: SaveState) {
  return s === "saving" ? "Saving" : s === "saved" ? "Saved" : s === "error" ? "Not saved" : "Draft";
}

// ── Property ───────────────────────────────────────────────────────────

type PickedProperty = BrochureProperty & { _id: Id<"properties"> };

function PropertyTab({ selected, onPick, onClear }: { selected?: Id<"properties">; onPick: (p: PickedProperty) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  // `list` rather than `search`: search drops the images a brochure needs.
  const result = useQuery(api.properties.list, { q: debounced || undefined, pageSize: 20, sortBy: "created_desc" });

  return (
    <View style={{ gap: space.sm }}>
      <Card onPress={onClear} style={!selected ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
        <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Not on the system yet</Text>
        <Body small muted>
          Type the brochure out by hand.
        </Body>
      </Card>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search your properties" />
      {result === undefined ? <Body muted>Loading properties</Body> : null}
      {result?.items.length === 0 ? <Body muted>No properties found.</Body> : null}
      {result?.items.map((p) => (
        <Card key={p._id} onPress={() => onPick(p as unknown as PickedProperty)} style={selected === p._id ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            {p.images[0] ? <Image source={{ uri: p.images[0] }} contentFit="cover" style={{ width: 56, height: 56, borderRadius: radius.md }} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
                {p.title}
              </Text>
              <Body small muted numberOfLines={1}>
                {p.location}
              </Body>
            </View>
            {selected === p._id ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

// ── Photos ─────────────────────────────────────────────────────────────

function PhotosTab({ doc, property, patch }: { doc: BrochureDoc; property?: Id<"properties">; patch: (c: Partial<BrochureDoc>) => void }) {
  const selectedProperty = useQuery(api.properties.getById, property ? { propertyId: property } : "skip");
  const tray = useMemo(() => (selectedProperty ? propertyPhotos(selectedProperty) : []), [selectedProperty]);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { busy, run } = useRun();
  const used = new Set(doc.photos.map((p) => p.ref));
  const full = doc.photos.length >= MAX_PHOTOS;

  const add = (photo: Photo) => patch({ photos: [...doc.photos, photo].slice(0, MAX_PHOTOS) });
  const remove = (i: number) => patch({ photos: doc.photos.filter((_, j) => j !== i) });
  const toFront = (i: number) => {
    const next = [...doc.photos];
    const [p] = next.splice(i, 1);
    patch({ photos: [p, ...next] });
  };

  async function upload() {
    const file = await choosePhoto();
    if (!file) return;
    const storageId = await run(() => uploadFile(() => generateUploadUrl({}), file));
    // The local file shows at once; the stored ref is the storage id.
    if (storageId) add({ ref: storageId, url: file.uri });
  }

  return (
    <View style={{ gap: space.md }}>
      <Section title={`On the brochure (${doc.photos.length} of ${MAX_PHOTOS})`}>
        {doc.photos.length === 0 ? <Body muted>No photos yet. The first photo is the main one.</Body> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {doc.photos.map((p, i) => (
            <View key={`${p.ref}-${i}`} style={{ width: "31%", gap: 4 }}>
              <Image source={{ uri: p.url }} contentFit="cover" style={{ width: "100%", aspectRatio: 1, borderRadius: radius.md }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Pressable onPress={() => toFront(i)} disabled={i === 0} hitSlop={8} accessibilityLabel="Make main photo">
                  <Ionicons name={i === 0 ? "star" : "star-outline"} size={20} color={colors.primaryDark} />
                </Pressable>
                <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityLabel="Remove photo">
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </Section>
      <Button title="Add a photo" icon="camera-outline" variant="secondary" onPress={upload} loading={busy} disabled={full} />
      {full ? <Notice tone="info">You can use up to {MAX_PHOTOS} photos.</Notice> : null}

      {tray.length > 0 ? (
        <Section title="From the property">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {tray.map((p, i) => {
              const on = used.has(p.ref);
              return (
                <Pressable
                  key={`${p.ref}-${i}`}
                  style={{ width: "31%" }}
                  disabled={on || full}
                  onPress={() => add(p)}
                  accessibilityLabel="Add property photo"
                >
                  <Image source={{ uri: p.url }} contentFit="cover" style={{ width: "100%", aspectRatio: 1, borderRadius: radius.md, opacity: on ? 0.4 : 1 }} />
                  {on ? (
                    <View style={{ position: "absolute", right: 4, top: 4 }}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

// ── Text ───────────────────────────────────────────────────────────────

function ContentTab({ doc, patch }: { doc: BrochureDoc; patch: (c: Partial<BrochureDoc>) => void }) {
  // Held as typed so a trailing newline is not swallowed while editing.
  const [featureText, setFeatureText] = useState(doc.features.join("\n"));
  return (
    <View style={{ gap: space.md }}>
      <Field label="Kicker" value={doc.eyebrow} onChangeText={(eyebrow) => patch({ eyebrow })} placeholder="FOR SALE" maxLength={200} autoCapitalize="characters" />
      <Field label="Title" value={doc.title} onChangeText={(title) => patch({ title })} placeholder="Four bedroom cluster" maxLength={200} />
      <Field label="Location" value={doc.location} onChangeText={(location) => patch({ location })} placeholder="Borrowdale, Harare" maxLength={200} />
      <Field label="Price" value={doc.price} onChangeText={(price) => patch({ price })} placeholder="$285,000" maxLength={200} />
      <Field label="Price label" value={doc.priceLabel} onChangeText={(priceLabel) => patch({ priceLabel })} placeholder="Asking price" maxLength={200} />
      <Field
        label="Features"
        hint={`One per line, up to ${MAX_FEATURES}. Layouts show the first few.`}
        value={featureText}
        multiline
        onChangeText={(text) => {
          setFeatureText(text);
          patch({ features: text.split("\n").map((f) => f.trim()).filter(Boolean).slice(0, MAX_FEATURES) });
        }}
        placeholder={"4 Bedrooms\n3 Bathrooms"}
      />
      <Field label="Reference" value={doc.reference} onChangeText={(reference) => patch({ reference })} maxLength={200} autoCapitalize="characters" />
      <Section title="Agent">
        <Field label="Name" value={doc.agentName} onChangeText={(agentName) => patch({ agentName })} maxLength={200} />
        <Field label="Phone" value={doc.agentPhone} onChangeText={(agentPhone) => patch({ agentPhone })} keyboardType="phone-pad" maxLength={200} />
        <Field label="Email" value={doc.agentEmail} onChangeText={(agentEmail) => patch({ agentEmail })} keyboardType="email-address" autoCapitalize="none" maxLength={200} />
      </Section>
      <Toggle label="Show logo" value={doc.showLogo} onChange={(showLogo) => patch({ showLogo })} />
      <Toggle label="Phone is on WhatsApp" hint="Adds the WhatsApp mark beside the number." value={doc.whatsappContact} onChange={(whatsappContact) => patch({ whatsappContact })} />
    </View>
  );
}

// ── Design ─────────────────────────────────────────────────────────────

function DesignTab({ doc, brand, patch }: { doc: BrochureDoc; brand: BrandKit; patch: (c: Partial<BrochureDoc>) => void }) {
  const themes = themesFor(brand);
  const preset = getFormat(doc.formatKey);
  return (
    <View style={{ gap: space.lg }}>
      <Section title="Format">
        {FORMAT_PRESETS.map((f) => {
          const on = f.key === doc.formatKey;
          return (
            <Card key={f.key} onPress={() => patch({ formatKey: f.key })} style={on ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
              <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
                {f.label} <Text style={{ color: colors.muted, fontWeight: "400" }}>{f.width} x {f.height}</Text>
              </Text>
              <Body small muted>
                {f.platforms.join(", ")}. {f.blurb}
              </Body>
            </Card>
          );
        })}
        {preset.kind === "print" ? <Notice tone="info">The A4 flyer exports as a PDF.</Notice> : null}
      </Section>

      <Section title="Layout">
        {TEMPLATES.map((t) => {
          const on = t.id === doc.templateId;
          return (
            <Card key={t.id} onPress={() => patch({ templateId: t.id })} style={on ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
              <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{t.name}</Text>
              <Body small muted>
                {t.description}
              </Body>
            </Card>
          );
        })}
      </Section>

      <Section title="Colours">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {themes.map((t) => {
            const on = t.id === doc.themeId;
            return (
              <Pressable
                key={t.id}
                onPress={() => patch({ themeId: t.id })}
                style={{ width: "47%", borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? colors.brand : colors.border, backgroundColor: colors.card, padding: space.sm, gap: 6 }}
              >
                <View style={{ flexDirection: "row", height: 28, borderRadius: radius.sm, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flex: 1, backgroundColor: t.page }} />
                  <View style={{ flex: 1, backgroundColor: t.accent }} />
                  <View style={{ flex: 1, backgroundColor: t.accentSoft }} />
                </View>
                <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{t.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </View>
  );
}
