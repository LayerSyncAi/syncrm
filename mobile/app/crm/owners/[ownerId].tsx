/** One owner: contact details, assigned agents, notes and the properties they hold. */
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Loading, Row, Screen, Section } from "../../../components/ui";
import { OwnerForm } from "../../../components/crm/records/owners/OwnerForm";
import { ownerTypeLabel, priceLabel, STATUS_LABELS } from "../../../lib/crm/records/contacts";
import { useRefresh } from "../../../lib/crm/leads/useRefresh";
import { confirm, useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";

export default function OwnerDetail() {
  const router = useRouter();
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const owner = useQuery(api.owners.getById, { ownerId: ownerId as Id<"contacts"> });
  const remove = useMutation(api.owners.remove);
  const { busy, run } = useRun();
  const [editing, setEditing] = useState(false);
  const { refreshing, onRefresh } = useRefresh();

  if (owner === undefined) return <Loading />;
  if (owner === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Owner" }} />
        <EmptyState
          icon="key-outline"
          title="Owner not found"
          message="This owner may have been removed, or you may not have access to it."
          action={<Button title="Back to owners" onPress={() => router.navigate("/crm/owners")} />}
        />
      </Screen>
    );
  }

  const del = async () => {
    const message = owner.alsoBuyerTenant
      ? `"${owner.name}" is also a buyer or tenant, so their contact record and lead history are kept. Only the owner role and property links are removed.`
      : `Delete "${owner.name}"? Their property links will be removed.`;
    if (!(await confirm("Remove owner", message, "Remove", true))) return;
    const res = await run(() => remove({ ownerId: owner._id }), { success: "Owner removed" });
    if (res) router.back();
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: owner.name }} />
      <Card>
        <Text style={{ fontSize: font.xl, fontWeight: "700", color: colors.text }}>{owner.name}</Text>
        <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
          <Badge label={ownerTypeLabel(owner.ownerType)} tone="info" />
          {owner.alsoBuyerTenant && <Badge label="Also a buyer or tenant" />}
        </Row>
        <Facts
          items={[
            { label: "Phone", value: owner.phone },
            { label: "Email", value: owner.email },
            { label: "Company", value: owner.company },
            { label: "Assigned agents", value: owner.agents.map((a) => a.name).join(", ") || "Unassigned" },
          ]}
        />
        <Row style={{ flexWrap: "wrap", marginTop: space.sm }}>
          {owner.phone ? <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${owner.phone}`)} /> : null}
          {owner.email ? <Button small variant="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${owner.email}`)} /> : null}
          <Button small variant="secondary" icon="create-outline" title="Edit" onPress={() => setEditing(true)} />
          {owner.alsoBuyerTenant && (
            <Button small variant="secondary" icon="person-outline" title="View contact" onPress={() => router.push(`/crm/contacts/${owner._id}` as Href)} />
          )}
        </Row>
      </Card>

      {owner.notes ? (
        <Section title="Notes">
          <Card>
            <Body>{owner.notes}</Body>
          </Card>
        </Section>
      ) : null}

      <Section title="Properties">
        {owner.properties.length === 0 ? (
          <EmptyState icon="home-outline" title="No properties linked" message="Link this owner from a property's Owner tab to see their portfolio here." />
        ) : (
          <View style={{ gap: space.sm }}>
            {owner.properties.map((p) => (
              <Card key={p._id} onPress={() => router.push(`/crm/properties/${p._id}` as Href)}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={{ fontSize: font.sm, color: colors.muted }}>{p.location}</Text>
                <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
                  <Badge label={p.role === "landlord" ? "Landlord" : "Seller"} tone="info" />
                  <Badge label={STATUS_LABELS[p.status] ?? p.status} />
                  <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{priceLabel(p.price, p.currency)}</Text>
                </Row>
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Button variant="danger" icon="trash-outline" title="Remove owner" onPress={del} loading={busy} />

      <OwnerForm open={editing} onClose={() => setEditing(false)} owner={owner} />
    </Screen>
  );
}
