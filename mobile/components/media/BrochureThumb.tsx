import { View } from "react-native";
import { getFormat } from "@/lib/syncmedia/formats";
import type { BrandKit, BrochureDoc } from "@/lib/syncmedia/types";
import { BrochureCanvas } from "./BrochureCanvas";

/** A small, non-interactive render of a brochure for lists. */
export function BrochureThumb({ doc, brand, width }: { doc: BrochureDoc; brand: BrandKit; width: number }) {
  const preset = getFormat(doc.formatKey);
  return (
    <View pointerEvents="none" style={{ width, height: Math.round((preset.height * width) / preset.width), borderRadius: 4, overflow: "hidden" }}>
      <BrochureCanvas doc={doc} brand={brand} width={width} />
    </View>
  );
}
