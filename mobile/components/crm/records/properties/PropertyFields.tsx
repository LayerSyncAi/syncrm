/** The property form fields, shared by the new and edit screens. */
import { View } from "react-native";
import { Field, Notice, Row, Section, Select } from "../../../ui";
import { LocationField } from "../../../LocationField";
import { space } from "../../../../lib/theme";
import {
  COMMERCIAL_OPTIONS,
  CURRENCY_OPTIONS,
  LISTING_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  isResidential,
} from "../../../../lib/crm/records/properties/labels";
import type { PropertyFormErrors, PropertyFormValues } from "../../../../lib/crm/records/properties/form";
import { PhotoEditor } from "./PhotoEditor";

export function PropertyFields({
  values,
  set,
  errors,
  canEditPrice = true,
}: {
  values: PropertyFormValues;
  set: <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) => void;
  errors: PropertyFormErrors;
  /** The web edit form only lets admins change the price and currency. */
  canEditPrice?: boolean;
}) {
  const commercial = values.type === "commercial";
  const failed = Object.values(errors).filter(Boolean).length;
  return (
    <View style={{ gap: space.lg }}>
      {failed > 0 && <Notice tone="danger">Check the {failed === 1 ? "field" : `${failed} fields`} marked below.</Notice>}

      <Section title="Listing">
        <Field label="Title *" value={values.title} onChangeText={(s) => set("title", s)} error={errors.title} placeholder="3 bed house in Borrowdale" />
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Select label="Type" value={values.type} options={TYPE_OPTIONS} onChange={(v) => set("type", v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Select label="Listing" value={values.listingType} options={LISTING_OPTIONS} onChange={(v) => set("listingType", v)} />
          </View>
        </Row>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Select label="Currency" value={values.currency} options={CURRENCY_OPTIONS} onChange={(v) => canEditPrice && set("currency", v)} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Field
              label="Price *"
              value={values.price}
              onChangeText={(s) => set("price", s)}
              keyboardType="decimal-pad"
              editable={canEditPrice}
              error={errors.price}
              placeholder="0"
            />
          </View>
        </Row>
        <Select label="Status" value={values.status} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} />
      </Section>

      <Section title="Location and size">
        <LocationField label="Location *" value={values.location} onChange={(s) => set("location", s)} error={errors.location} placeholder="Suburb, city" />
        <Field
          label={commercial ? "Floor area (m²) *" : "Area (m²) *"}
          value={values.area}
          onChangeText={(s) => set("area", s)}
          keyboardType="decimal-pad"
          error={errors.area}
        />
        {isResidential(values.type) && (
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Field label="Bedrooms" value={values.bedrooms} onChangeText={(s) => set("bedrooms", s)} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Bathrooms" value={values.bathrooms} onChangeText={(s) => set("bathrooms", s)} keyboardType="number-pad" />
            </View>
          </Row>
        )}
        {commercial && (
          <>
            <Select label="Commercial type" value={values.commercialType} options={COMMERCIAL_OPTIONS} onChange={(v) => set("commercialType", v)} />
            <Field label="Zoning" value={values.zoning} onChangeText={(s) => set("zoning", s)} placeholder="e.g. Commercial B2" />
            <Field label="Usage type" value={values.usageType} onChangeText={(s) => set("usageType", s)} placeholder="e.g. Retail, office, storage" />
          </>
        )}
      </Section>

      <Section title="Description">
        <Field label="Description" value={values.description} onChangeText={(s) => set("description", s)} multiline placeholder="What makes this property stand out" />
      </Section>

      <Section title="Photos *">
        <PhotoEditor images={values.images} onChange={(imgs) => set("images", imgs)} error={errors.images} />
      </Section>
    </View>
  );
}
