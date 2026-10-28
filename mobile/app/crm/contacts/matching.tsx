/** Property matching (port of /app/contacts/matching): properties that fit a contact's stored preferences. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Loading, Notice, Row, Screen } from "../../../components/ui";
import { ContactPicker } from "../../../components/crm/records/contacts/ContactPicker";
import { budgetLabel, interestLabel, listingLabel, priceLabel, STATUS_LABELS, typeLabel } from "../../../lib/crm/records/contacts";
import { colors, font, space } from "../../../lib/theme";

export default function ContactMatching() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const [contactId, setContactId] = useState<Id<"contacts"> | null>((params.contactId as Id<"contacts">) || null);
  const contact = useQuery(api.contacts.getById, contactId ? { contactId } : "skip");
  const matches = useQuery(api.contacts.matchProperties, contactId ? { contactId } : "skip");

  const budget = contact ? budgetLabel(contact.budgetMin, contact.budgetMax, contact.budgetCurrency) : "";
  const hasPrefs = !!contact && !!(contact.interestType || contact.preferredAreas?.length || contact.preferredPropertyTypes?.length || budget);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Property matching" }} />
      <Body muted small>Choose a contact to find properties that match their stored preferences.</Body>
      <ContactPicker label="Contact" name={contact?.name} onPick={setContactId} />

      {contact && (
        <Card>
          <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text }}>Preferences</Text>
          {hasPrefs ? (
            <Facts
              items={[
                { label: "Interest", value: interestLabel(contact.interestType) },
                { label: "Areas", value: contact.preferredAreas?.join(", ") },
                { label: "Property types", value: contact.preferredPropertyTypes?.map(typeLabel).join(", ") },
                { label: "Budget", value: budget },
                { label: "Min bedrooms", value: contact.minBedrooms ? String(contact.minBedrooms) : undefined },
                { label: "Min bathrooms", value: contact.minBathrooms ? String(contact.minBathrooms) : undefined },
              ]}
            />
          ) : (
            <Notice tone="warning">No preferences set. Edit the contact to add preferences.</Notice>
          )}
          <Button small variant="ghost" title="Open contact" onPress={() => router.push(`/crm/contacts/${contact._id}` as Href)} style={{ alignSelf: "flex-start" }} />
        </Card>
      )}

      {contactId && matches === undefined && <Loading />}
      {contactId && matches !== undefined &&
        (matches.length === 0 ? (
          <EmptyState icon="home-outline" title="No matching properties" message="Update the contact's preferences or add more properties." />
        ) : (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>
              {matches.length} matching {matches.length === 1 ? "property" : "properties"}
            </Text>
            {matches.map((p) => (
              <Card key={p._id} onPress={() => router.push(`/crm/properties/${p._id}` as Href)}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <Badge label={STATUS_LABELS[p.status] ?? p.status} tone={p.status === "available" ? "success" : "warning"} />
                </Row>
                <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{priceLabel(p.price, p.currency)}</Text>
                <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
                  <Badge label={typeLabel(p.type)} />
                  <Badge label={listingLabel(p.listingType)} />
                </Row>
                <Text style={{ fontSize: font.sm, color: colors.muted }}>
                  {p.location} · {p.bedrooms ?? "-"} bd · {p.bathrooms ?? "-"} ba
                </Text>
              </Card>
            ))}
          </View>
        ))}
    </Screen>
  );
}
