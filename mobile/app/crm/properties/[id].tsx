/**
 * One property (the website's property modal as a screen). Tabs mirror the
 * web: Details, Gallery, Owner, Marketing, Sharing, Viewings, Matches and
 * Documents. Owner and Documents need private access (owners, collaborators,
 * admins), the same rule the backend applies.
 */
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Chips, EmptyState, Loading, Notice, Row, Screen } from "../../../components/ui";
import { DetailsTab, GalleryTab } from "../../../components/crm/records/properties/DetailsTab";
import { OwnersTab } from "../../../components/crm/records/properties/OwnersTab";
import { MarketingTab } from "../../../components/crm/records/properties/MarketingTab";
import { SharingTab } from "../../../components/crm/records/properties/SharingTab";
import { MatchedLeads, ViewingsList } from "../../../components/crm/records/properties/LinkedLists";
import { AccessPanel } from "../../../components/crm/records/properties/AccessPanel";
import { DocumentsPanel } from "../../../components/crm/records/properties/DocumentsPanel";
import { STATUS_TONE, listingLabel, priceLabel, statusLabel, typeLabel } from "../../../lib/crm/records/properties/labels";
import { useSession } from "../../../lib/session";
import { confirm, useRun } from "../../../lib/useRun";
import { colors, font, radius, space } from "../../../lib/theme";

type Tab = "details" | "gallery" | "owner" | "marketing" | "sharing" | "viewings" | "matches" | "documents";

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const propertyId = id as Id<"properties">;
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const property = useQuery(api.properties.getById, { propertyId });
  const remove = useMutation(api.properties.remove);
  const { busy, run } = useRun();
  const [tab, setTab] = useState<Tab>("details");

  if (property === undefined) return <Loading />;
  if (property === null)
    return (
      <>
        <Stack.Screen options={{ title: "Property" }} />
        <EmptyState icon="business-outline" title="Property not found" message="It may have been deleted." />
      </>
    );

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "details", label: "Details" },
    { value: "gallery", label: `Gallery (${property.images?.length ?? 0})` },
    ...(property.canAccessPrivate ? [{ value: "owner" as const, label: "Owner" }] : []),
    { value: "marketing", label: "Marketing" },
    { value: "sharing", label: "Sharing" },
    { value: "viewings", label: "Viewings" },
    { value: "matches", label: "Matches" },
    ...(property.canAccessPrivate ? [{ value: "documents" as const, label: "Documents" }] : []),
  ];

  const del = async () => {
    if (!(await confirm("Delete property", `Delete "${property.title}"? This cannot be undone.`, "Delete", true))) return;
    const ok = await run(async () => {
      await remove({ propertyId });
      return true;
    });
    if (ok) router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: property.title }} />
      <Screen>
        {property.images?.[0] ? (
          <Image source={{ uri: property.images[0] }} style={{ width: "100%", aspectRatio: 16 / 10, borderRadius: radius.lg, backgroundColor: colors.surface }} />
        ) : null}
        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: font.xl, fontWeight: "700", color: colors.text }}>{property.title}</Text>
          <Text style={{ fontSize: font.sm, color: colors.muted }}>{property.location}</Text>
          <Row style={{ flexWrap: "wrap" }}>
            <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.brand }}>{priceLabel(property.price, property.currency)}</Text>
            <Badge label={statusLabel(property.status)} tone={STATUS_TONE[property.status]} />
            <Badge label={`${typeLabel(property.type)} · ${listingLabel(property.listingType)}`} />
          </Row>
        </View>

        <Row style={{ flexWrap: "wrap" }}>
          {property.canManage && (
            <Button small variant="secondary" icon="create-outline" title="Edit" onPress={() => router.push(`/crm/properties/edit/${propertyId}` as Href)} />
          )}
          <Button small variant="secondary" icon="megaphone-outline" title="Open in SyncMedia" onPress={() => router.push(`/media/new?propertyId=${propertyId}` as Href)} />
          {property.canManage && <Button small variant="danger" icon="trash-outline" title="Delete" onPress={del} loading={busy} />}
        </Row>

        <Chips options={tabs} value={tab} onChange={setTab} />

        {tab === "details" && <DetailsTab property={property} />}
        {tab === "gallery" && <GalleryTab property={property} />}
        {tab === "owner" && <OwnersTab propertyId={propertyId} listingType={property.listingType} canManage={property.canManage} />}
        {tab === "marketing" && (
          <MarketingTab propertyId={propertyId} listedOnMarketAt={property.listedOnMarketAt} canEdit={property.canManage} isAdmin={isAdmin} />
        )}
        {tab === "sharing" && user && <SharingTab propertyId={propertyId} currentUserId={user._id} />}
        {tab === "viewings" && <ViewingsList propertyId={propertyId} address={property.location} />}
        {tab === "matches" && <MatchedLeads propertyId={propertyId} listingType={property.listingType} />}
        {tab === "documents" &&
          (property.canAccessPrivate ? (
            <View style={{ gap: space.xl }}>
              <AccessPanel
                propertyId={propertyId}
                canManage={property.canManage}
                isAdmin={isAdmin}
                ownershipType={property.ownershipType}
                ownerUserIds={property.ownerUserIds}
                ownerNames={property.ownerNames}
              />
              <DocumentsPanel propertyId={propertyId} />
            </View>
          ) : (
            <Notice>You do not have access to this property's documents or mandate.</Notice>
          ))}
      </Screen>
    </>
  );
}
