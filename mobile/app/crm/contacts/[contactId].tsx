/** One contact's profile: details, preferences, leads, enquiries, viewings, activity and follow-ups. */
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Chips, EmptyState, Loading, Row, Screen, Stat, StatGrid } from "../../../components/ui";
import { ContactForm, type EditableContact } from "../../../components/crm/records/contacts/ContactForm";
import {
  ActivityTab,
  EnquiriesTab,
  FollowUpsTab,
  LeadsTab,
  OverviewTab,
  ViewingsTab,
} from "../../../components/crm/records/contacts/ProfileSections";
import { ownerTypeLabel } from "../../../lib/crm/records/contacts";
import { useRefresh } from "../../../lib/crm/leads/useRefresh";
import { confirm, useRun } from "../../../lib/useRun";
import { useSession } from "../../../lib/session";
import { initials } from "../../../lib/format";
import { colors, font, space } from "../../../lib/theme";

type Tab = "overview" | "leads" | "enquiries" | "viewings" | "activity" | "followups";

export default function ContactDetail() {
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const { user } = useSession();
  const profile = useQuery(api.contacts.getProfile, { contactId: contactId as Id<"contacts"> });
  const remove = useMutation(api.contacts.remove);
  const { busy, run } = useRun();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const { refreshing, onRefresh } = useRefresh();

  if (profile === undefined) return <Loading />;
  if (profile === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Contact" }} />
        <EmptyState
          icon="person-outline"
          title="Contact not found"
          message="This contact does not exist or you do not have access to it."
          action={<Button title="Back to contacts" onPress={() => router.navigate("/crm/contacts")} />}
        />
      </Screen>
    );
  }

  const { contact, leadHistory, enquiries, agentHistory } = profile;
  const followUps = profile.activities.filter((a) => a.status === "todo").length;
  const canDelete = user?.role === "admin" || contact.ownerUserIds.includes(user?._id as Id<"users">);
  const editable: EditableContact = {
    ...contact,
    ownerNames: agentHistory.filter((a) => a.isCurrentOwner).map((a) => a.name),
  };

  const del = async () => {
    if (!(await confirm("Delete contact", `Delete "${contact.name}"? This cannot be undone.`, "Delete", true))) return;
    const ok = await run(() => remove({ contactId: contact._id }), { success: "Contact deleted" });
    if (ok !== undefined) router.back();
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: contact.name }} />
      <Card>
        <Row style={{ alignItems: "flex-start", gap: space.md }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: font.lg }}>{initials(contact.name)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: font.xl, fontWeight: "700", color: colors.text }}>{contact.name}</Text>
            {contact.company ? <Body muted small>{contact.company}</Body> : null}
            {contact.ownerType ? (
              <View style={{ marginTop: 4 }}>
                <Badge label={`Owner: ${ownerTypeLabel(contact.ownerType)}`} tone="info" />
              </View>
            ) : null}
          </View>
        </Row>
        <Row style={{ flexWrap: "wrap", marginTop: space.sm }}>
          {contact.phone ? <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${contact.phone}`)} /> : null}
          {contact.email ? <Button small variant="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${contact.email}`)} /> : null}
          <Button small variant="secondary" icon="create-outline" title="Edit" onPress={() => setEditing(true)} />
          <Button small variant="secondary" icon="search-outline" title="Matches" onPress={() => router.push({ pathname: "/crm/contacts/matching", params: { contactId: contact._id } } as Href)} />
          {contact.ownerType ? <Button small variant="secondary" icon="key-outline" title="Owner profile" onPress={() => router.push(`/crm/owners/${contact._id}` as Href)} /> : null}
        </Row>
      </Card>

      <StatGrid>
        <Stat label="Leads" value={String(leadHistory.length)} />
        <Stat label="Enquiries" value={String(enquiries.length)} />
        <Stat label="Follow-ups" value={String(followUps)} tone={followUps ? "warning" : undefined} />
      </StatGrid>

      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "leads", label: "Lead history" },
          { value: "enquiries", label: "Enquiries" },
          { value: "viewings", label: "Viewings" },
          { value: "activity", label: "Activity" },
          { value: "followups", label: "Follow-ups" },
        ]}
      />

      {tab === "overview" && <OverviewTab profile={profile} />}
      {tab === "leads" && <LeadsTab profile={profile} />}
      {tab === "enquiries" && <EnquiriesTab profile={profile} />}
      {tab === "viewings" && <ViewingsTab profile={profile} />}
      {tab === "activity" && <ActivityTab profile={profile} />}
      {tab === "followups" && <FollowUpsTab profile={profile} />}

      {canDelete && tab === "overview" && <Button variant="danger" icon="trash-outline" title="Delete contact" onPress={del} loading={busy} />}

      <ContactForm open={editing} onClose={() => setEditing(false)} contact={editable} />
    </Screen>
  );
}
