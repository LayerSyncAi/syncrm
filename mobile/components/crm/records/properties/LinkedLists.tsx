/** Viewing forms and matched leads for one property, linking to their screens. */
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge, Body, Button, EmptyState, ListItem, Loading, Section } from "../../../ui";
import { dateLabel } from "../../../../lib/format";
import { space } from "../../../../lib/theme";

export function ViewingsList({ propertyId, address }: { propertyId: Id<"properties">; address: string }) {
  const router = useRouter();
  const forms = useQuery(api.viewingForms.listByProperty, { propertyId });
  return (
    <View style={{ gap: space.md }}>
      <Button
        variant="secondary"
        icon="create-outline"
        title="New viewing form"
        onPress={() => router.push(`/crm/viewings/new?propertyId=${propertyId}&propertyAddress=${encodeURIComponent(address)}` as Href)}
      />
      <Section title="Viewing forms">
        {forms === undefined ? (
          <Loading />
        ) : forms.length === 0 ? (
          <EmptyState icon="create-outline" title="No viewings yet" message="Record a signed viewing form when you show this property." />
        ) : (
          forms.map((f) => (
            <ListItem
              key={f._id}
              icon="document-text-outline"
              title={f.clientName}
              subtitle={`${f.propertyAddress} · ${dateLabel(f.viewingDate)}`}
              right={<Badge label={f.status === "completed" ? "Completed" : "Draft"} tone={f.status === "completed" ? "success" : "warning"} />}
              onPress={() => router.push(`/crm/viewings/${f._id}` as Href)}
            />
          ))
        )}
      </Section>
    </View>
  );
}

/** Leads this property has been matched to (suggested, requested or shown). */
export function MatchedLeads({ propertyId, listingType }: { propertyId: Id<"properties">; listingType: "rent" | "sale" }) {
  const router = useRouter();
  const leads = useQuery(api.leads.list, { propertyId, pageSize: 50 });
  return (
    <View style={{ gap: space.md }}>
      <Button
        variant="secondary"
        icon="person-add-outline"
        title="Add a lead for this property"
        onPress={() => router.push(`/crm/leads/new?propertyId=${propertyId}&interestType=${listingType === "sale" ? "buy" : "rent"}` as Href)}
      />
      <Section title="Matched leads">
        {leads === undefined ? (
          <Loading />
        ) : leads.items.length === 0 ? (
          <Body small muted>No leads have been matched to this property yet. Match from a lead's suggested properties.</Body>
        ) : (
          leads.items.map((l) => (
            <ListItem
              key={l._id}
              icon="person-outline"
              title={l.fullName}
              subtitle={`${l.interestType === "buy" ? "Buying" : "Renting"} · ${l.stageName}`}
              meta={l.ownerName}
              onPress={() => router.push(`/crm/leads/${l._id}` as Href)}
            />
          ))
        )}
      </Section>
    </View>
  );
}
