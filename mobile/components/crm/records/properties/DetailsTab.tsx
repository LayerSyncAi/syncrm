/**
 * The Details and Gallery tabs of a property: deal banner, key facts, quick
 * status change, the agent and client owners, description and photos.
 */
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Body, Button, Card, Facts, Notice, Section, Select } from "../../../ui";
import { useRun } from "../../../../lib/useRun";
import { dateLabel } from "../../../../lib/format";
import { space } from "../../../../lib/theme";
import {
  STATUS_OPTIONS,
  agentOwnerSummary,
  commercialLabel,
  isResidential,
  listingLabel,
  priceLabel,
  typeLabel,
  type PropertyStatus,
} from "../../../../lib/crm/records/properties/labels";
import { PhotoEditor, PhotoGallery } from "./PhotoEditor";

type Detail = Doc<"properties"> & { createdByName: string; ownerNames: string[]; canAccessPrivate: boolean; canManage: boolean };

function DealBanner({ propertyId }: { propertyId: Id<"properties"> }) {
  const router = useRouter();
  const deal = useQuery(api.properties.getPropertyDealInfo, { propertyId });
  if (!deal) return null;
  const head = deal.status === "sold" ? "This property has been sold" : deal.status === "under_offer" ? "This property is under contract" : "This property has been let";
  const tone = deal.status === "sold" ? "danger" : deal.status === "under_offer" ? "warning" : "info";
  const extra = deal as { contactName?: string; dealValue?: number; dealCurrency?: string; leadId?: Id<"leads"> };
  const lead = extra.contactName
    ? `${deal.status === "sold" ? "Sold to" : deal.status === "under_offer" ? "Under contract with" : "Let to"} ${extra.contactName}${
        extra.dealValue && extra.dealCurrency ? ` (${priceLabel(extra.dealValue, extra.dealCurrency)})` : ""
      }`
    : "";
  return (
    <View style={{ gap: space.xs }}>
      <Notice tone={tone}>
        {head}
        {lead ? `. ${lead}` : ""}
      </Notice>
      {extra.leadId && <Button small variant="ghost" icon="open-outline" title="View lead" onPress={() => router.push(`/crm/leads/${extra.leadId}` as Href)} />}
    </View>
  );
}

export function DetailsTab({ property }: { property: Detail }) {
  const owners = useQuery(api.owners.listForProperty, property.canAccessPrivate ? { propertyId: property._id } : "skip");
  const update = useMutation(api.properties.update);
  const { run } = useRun();
  const home = isResidential(property.type);
  const commercial = property.type === "commercial";
  const clients = (owners ?? []).filter((o): o is NonNullable<typeof o> => !!o);

  return (
    <View style={{ gap: space.lg }}>
      <DealBanner propertyId={property._id} />

      {property.canManage && (
        <Select
          label="Status"
          value={property.status}
          options={STATUS_OPTIONS}
          onChange={(status: PropertyStatus) => {
            if (status !== property.status) run(() => update({ propertyId: property._id, status }), { success: "Status updated" });
          }}
        />
      )}

      <Card>
        <Facts
          items={[
            { label: "Price", value: priceLabel(property.price, property.currency) },
            { label: "Type", value: typeLabel(property.type) },
            { label: "Listing", value: listingLabel(property.listingType) },
            { label: "Location", value: property.location },
            { label: commercial ? "Floor area" : "Area", value: property.area ? `${property.area} m²` : "" },
            { label: "Bedrooms", value: home && property.bedrooms != null ? String(property.bedrooms) : "" },
            { label: "Bathrooms", value: home && property.bathrooms != null ? String(property.bathrooms) : "" },
            { label: "Commercial type", value: commercial && property.commercialType ? commercialLabel(property.commercialType) : "" },
            { label: "Zoning", value: commercial ? property.zoning ?? "" : "" },
            { label: "Usage", value: commercial ? property.usageType ?? "" : "" },
            { label: "Listed on market", value: property.listedOnMarketAt ? dateLabel(property.listedOnMarketAt) : "" },
            { label: "Added", value: `${dateLabel(property.createdAt)} by ${property.createdByName}` },
            { label: "Assigned agent", value: agentOwnerSummary(property.ownershipType, property.ownerNames) },
            {
              label: "Property owner",
              value: property.canAccessPrivate
                ? owners === undefined
                  ? "Loading"
                  : clients.length === 0
                    ? "None linked"
                    : clients.map((o) => `${o.name} (${o.role === "landlord" ? "Landlord" : "Seller"})`).join(", ")
                : "",
            },
            { label: "PropertyBook ref", value: property.pbRefCode ?? "" },
          ]}
        />
        {property.pbSourceUrl ? <Button small variant="ghost" icon="open-outline" title="View on PropertyBook" onPress={() => Linking.openURL(property.pbSourceUrl!)} /> : null}
      </Card>

      {property.description ? (
        <Section title="Description">
          <Card>
            <Body>{property.description}</Body>
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

/** Photos. People who can edit the property can add, remove or reorder them here. */
export function GalleryTab({ property }: { property: Detail }) {
  const update = useMutation(api.properties.update);
  const { busy, run } = useRun();
  const [images, setImages] = useState<string[]>(property.images ?? []);
  const key = (property.images ?? []).join("|");
  useEffect(() => setImages(property.images ?? []), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = images.join("|") !== key;

  if (!property.canManage) return <PhotoGallery images={property.images ?? []} />;
  return (
    <View style={{ gap: space.md }}>
      <PhotoEditor images={images} onChange={setImages} error={images.length < 2 ? "Add at least 2 photos" : undefined} />
      {changed && (
        <Button
          title="Save photos"
          icon="checkmark"
          loading={busy}
          disabled={images.length < 2}
          onPress={() => run(() => update({ propertyId: property._id, images }), { success: "Photos saved" })}
        />
      )}
    </View>
  );
}
