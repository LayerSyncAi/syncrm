/**
 * Brochure data helpers for the studio, shared by the list and the editor.
 * The formats, templates, themes and the property seed come straight from the
 * website's src/lib/syncmedia (pure data, no DOM).
 */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { getFormat } from "@/lib/syncmedia/formats";
import { getTemplate } from "@/lib/syncmedia/templates";
import { resolveBrandKit } from "@/lib/syncmedia/theme";
import { EMPTY_DOC, type BrandKit, type BrochureDoc } from "@/lib/syncmedia/types";

/** The organisation's brand kit, resolved the way the website does. */
export function useBrandKit(): { kit: BrandKit; row: ReturnType<typeof useBrandRow> } {
  const row = useBrandRow();
  const kit = useMemo(() => resolveBrandKit(row), [row]);
  return { kit, row };
}

function useBrandRow() {
  return useQuery(api.branding.get, {});
}

type StoredBrochure = Omit<Doc<"brochures">, "photos"> & { photos: { ref: string; url: string }[] };

/** A stored brochure as an editor document. Unknown ids fall back to defaults. */
export function docFromBrochure(b: StoredBrochure): BrochureDoc {
  return {
    ...EMPTY_DOC,
    formatKey: getFormat(b.formatKey as BrochureDoc["formatKey"]).key,
    templateId: getTemplate(b.templateId as BrochureDoc["templateId"]).id,
    themeId: b.themeId as BrochureDoc["themeId"],
    photos: b.photos,
    eyebrow: b.eyebrow,
    title: b.title,
    location: b.location,
    price: b.price,
    priceLabel: b.priceLabel,
    features: b.features,
    reference: b.reference,
    agentName: b.agentName,
    agentPhone: b.agentPhone,
    agentEmail: b.agentEmail,
    showLogo: b.showLogo,
    whatsappContact: b.whatsappContact,
    nudges: (b.nudges ?? []) as BrochureDoc["nudges"],
  };
}

export const MAX_PHOTOS = 8;
export const MAX_FEATURES = 12;
