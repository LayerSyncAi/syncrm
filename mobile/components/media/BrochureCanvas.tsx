import { forwardRef } from "react";
import { View, type HostInstance } from "react-native";
import { getFormat } from "@/lib/syncmedia/formats";
import { getTheme } from "@/lib/syncmedia/theme";
import type { TemplateId } from "@/lib/syncmedia/templates";
import type { BrandKit, BrochureDoc } from "@/lib/syncmedia/types";
import { AdjustProvider, makeScale, nudgedDoc, type AdjustState, type TemplateProps } from "./parts";
import { Classic, Editorial, Overlay, Spotlight, Split } from "./templates";

const REGISTRY: Record<TemplateId, (props: TemplateProps) => React.ReactElement> = {
  housestyle: Classic,
  editorial: Editorial,
  overlay: Overlay,
  mosaic: Editorial,
  split: Split,
  spotlight: Spotlight,
};

/**
 * A brochure drawn `width` pixels wide at the format's aspect ratio. Layout is
 * driven by design units, so the same view captured with the format's pixel
 * size (view-shot's width and height) gives the full-resolution export.
 */
export const BrochureCanvas = forwardRef<HostInstance, { doc: BrochureDoc; brand: BrandKit; width: number; adjust?: Omit<AdjustState, "k" | "preset"> | null }>(function BrochureCanvas(
  { doc, brand, width, adjust = null },
  ref
) {
  const preset = getFormat(doc.formatKey);
  const theme = getTheme(doc.themeId, brand);
  const k = width / preset.width;
  const s = makeScale(preset, k);
  const Template = REGISTRY[doc.templateId] ?? Classic;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width, height: Math.round(preset.height * k), backgroundColor: theme.page, overflow: "hidden" }}
    >
      <AdjustProvider value={adjust ? { ...adjust, k, preset } : null}>
        <Template doc={nudgedDoc(doc, k)} theme={theme} preset={preset} brand={brand} s={s} />
      </AdjustProvider>
    </View>
  );
});
