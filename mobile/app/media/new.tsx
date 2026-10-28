/**
 * The brochure studio. Loads what the website's studio page loads (the
 * property, the agent's saved draft, their previous brochure and the brand
 * kit) and mounts the editor only once all of it has landed, so seeding never
 * overwrites what the agent has typed.
 */
import { useMemo } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loading } from "../../components/ui";
import { Studio } from "../../components/media/Studio";
import { docFromBrochure, useBrandKit } from "../../lib/media/doc";
import { useSession } from "../../lib/session";
import { seedFromProperty } from "@/lib/syncmedia/fromProperty";
import { EMPTY_DOC, type BrochureDoc } from "@/lib/syncmedia/types";

export default function BrochureStudioScreen() {
  const { propertyId: propertyParam, id: idParam } = useLocalSearchParams<{ propertyId?: string; id?: string }>();
  const propertyId = propertyParam as Id<"properties"> | undefined;
  const { user } = useSession();
  const { kit, row } = useBrandKit();

  const property = useQuery(api.properties.getById, propertyId ? { propertyId } : "skip");
  const previous = useQuery(api.syncmedia.listMine, {});
  // The draft for this property (or the scratch draft when there is none),
  // unless a specific brochure was opened from the list.
  const forProperty = useQuery(api.syncmedia.getMineForProperty, { propertyId });
  const saved = useMemo(() => {
    if (idParam) return previous?.find((b) => b._id === idParam) ?? null;
    return forProperty;
  }, [idParam, previous, forProperty]);

  const initialDoc = useMemo<BrochureDoc | null>(() => {
    if (saved) return docFromBrochure(saved);
    const last = previous?.[0];
    // Carry the last brochure's layout, format, colour and contact forward.
    const carried: Partial<BrochureDoc> = last
      ? {
          formatKey: last.formatKey as BrochureDoc["formatKey"],
          templateId: last.templateId as BrochureDoc["templateId"],
          themeId: last.themeId as BrochureDoc["themeId"],
          showLogo: last.showLogo,
          whatsappContact: last.whatsappContact,
          agentName: last.agentName,
          agentPhone: last.agentPhone,
          agentEmail: last.agentEmail,
        }
      : {};
    return {
      ...EMPTY_DOC,
      ...carried,
      agentName: carried.agentName || user?.fullName || user?.name || "",
      agentPhone: carried.agentPhone || row?.contactPhone || "",
      agentEmail: carried.agentEmail || user?.email || "",
      ...(property ? seedFromProperty(property) : {}),
    };
  }, [saved, previous, user, row, property]);

  const waiting =
    !user || row === undefined || previous === undefined || forProperty === undefined || (!!propertyId && property === undefined);

  return (
    <>
      <Stack.Screen options={{ title: "Brochure" }} />
      {waiting || !initialDoc ? (
        <Loading />
      ) : (
        <Studio
          // Remounts when the brochure or property changes.
          key={`${idParam ?? ""}-${propertyId ?? "blank"}`}
          initialDoc={initialDoc}
          savedBrochureId={saved?._id}
          propertyId={saved?.propertyId ?? propertyId}
          brand={kit}
        />
      )}
    </>
  );
}
