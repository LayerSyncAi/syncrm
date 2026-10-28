/**
 * The tabs of a contact's profile (port of src/components/contacts/contact-detail):
 * overview, lead history, enquiries, viewings, activity and follow-ups. All of
 * it comes from contacts.getProfile, scoped to the contact rather than to who
 * owns each lead, so the history survives an agent leaving.
 */
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Ionicons, ListItem, Row, Section, type IconName } from "../../../ui";
import { amountLabel, budgetLabel, interestLabel, leadSourceLabel, priceLabel, typeLabel } from "../../../../lib/crm/records/contacts";
import { dateLabel, dateTimeLabel } from "../../../../lib/format";
import { colors, font, space } from "../../../../lib/theme";

export type Profile = NonNullable<FunctionReturnType<typeof api.contacts.getProfile>>;

export function OverviewTab({ profile }: { profile: Profile }) {
  const { contact, agentHistory } = profile;
  const budget = budgetLabel(contact.budgetMin, contact.budgetMax, contact.budgetCurrency);
  const hasPrefs =
    !!contact.interestType ||
    !!budget ||
    (contact.preferredAreas?.length ?? 0) > 0 ||
    (contact.preferredPropertyTypes?.length ?? 0) > 0 ||
    contact.minBedrooms != null ||
    contact.minBathrooms != null;
  return (
    <>
      <Section title="Contact information">
        <Card>
          <Facts
            items={[
              { label: "Name", value: contact.name },
              { label: "Phone", value: contact.phone },
              { label: "Email", value: contact.email },
              { label: "Company", value: contact.company },
            ]}
          />
          {contact.notes ? (
            <View style={{ marginTop: space.sm, gap: 2 }}>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>Notes</Text>
              <Body>{contact.notes}</Body>
            </View>
          ) : null}
        </Card>
      </Section>
      <Section title="Preferences">
        <Card>
          {hasPrefs ? (
            <Facts
              items={[
                { label: "Interest", value: interestLabel(contact.interestType) },
                { label: "Budget", value: budget },
                { label: "Preferred areas", value: contact.preferredAreas?.join(", ") },
                { label: "Property types", value: contact.preferredPropertyTypes?.map(typeLabel).join(", ") },
                { label: "Min bedrooms", value: contact.minBedrooms != null ? String(contact.minBedrooms) : undefined },
                { label: "Min bathrooms", value: contact.minBathrooms != null ? String(contact.minBathrooms) : undefined },
              ]}
            />
          ) : (
            <Body muted small>
              No preferences captured yet. These carry over from the contact&apos;s leads.
            </Body>
          )}
        </Card>
      </Section>
      <Section title="Assigned agents and history">
        <Card>
          {agentHistory.length === 0 ? (
            <Body muted small>No agents recorded.</Body>
          ) : (
            agentHistory.map((a) => (
              <Row key={a._id} style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <Ionicons name="person-outline" size={16} color={colors.muted} />
                  <Text style={{ fontSize: font.md, color: colors.text, flexShrink: 1 }}>{a.name}</Text>
                  {a.isCurrentOwner && <Badge label="Current" tone="success" />}
                </Row>
                <Text style={{ fontSize: font.sm, color: colors.muted }}>
                  {a.leadCount} lead{a.leadCount === 1 ? "" : "s"}
                </Text>
              </Row>
            ))
          )}
        </Card>
      </Section>
    </>
  );
}

export function LeadsTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  if (profile.leadHistory.length === 0) {
    return <EmptyState icon="git-network-outline" title="No leads yet" message="Leads created for this contact appear here, open or closed." />;
  }
  return (
    <View style={{ gap: space.sm }}>
      {profile.leadHistory.map((l) => (
        <Card key={l._id} onPress={() => router.push(`/crm/leads/${l._id}` as Href)}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text, flex: 1 }} numberOfLines={1}>
              {l.fullName}
            </Text>
            {l.dealValue != null && <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.success }}>{amountLabel(l.dealValue, l.dealCurrency)}</Text>}
          </Row>
          <Row style={{ flexWrap: "wrap" }} gap={space.xs}>
            <Badge label={l.stageName} tone="info" />
            {l.isClosed && <Badge label={l.closeReason || "Closed"} />}
            {l.isArchived && <Badge label="Archived" />}
            {l.score != null && <Badge label={`Score ${l.score}`} />}
          </Row>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>
            {leadSourceLabel(l.source)} · {interestLabel(l.interestType)} · {l.ownerName} · {dateLabel(l.createdAt)}
          </Text>
        </Card>
      ))}
    </View>
  );
}

export function EnquiriesTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  if (profile.enquiries.length === 0) {
    return <EmptyState icon="home-outline" title="No property enquiries" message="Properties this contact has enquired about, across all their leads, show here." />;
  }
  return (
    <View style={{ gap: space.sm }}>
      {profile.enquiries.map((e) => (
        <ListItem
          key={e._id}
          icon="home-outline"
          title={e.property?.title ?? "Unknown property"}
          subtitle={`${e.matchType.charAt(0).toUpperCase() + e.matchType.slice(1)}${e.property ? ` · ${e.property.location}` : ""} · ${dateLabel(e.createdAt)}`}
          right={e.property ? priceLabel(e.property.price, e.property.currency) : undefined}
          onPress={e.property ? () => router.push(`/crm/properties/${e.property!._id}` as Href) : undefined}
        />
      ))}
    </View>
  );
}

export function ViewingsTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { contact } = profile;
  const forms = useQuery(api.viewingForms.listByContact, { contactId: contact._id as Id<"contacts"> });
  const params: Record<string, string> = { contactId: contact._id, clientName: contact.name };
  if (contact.phone) params.clientPhone = contact.phone;
  if (contact.email) params.clientEmail = contact.email;
  return (
    <View style={{ gap: space.sm }}>
      <Button variant="secondary" icon="add" title="New viewing form" onPress={() => router.push({ pathname: "/crm/viewings/new", params } as Href)} />
      {forms === undefined ? (
        <Body muted small>Loading viewings</Body>
      ) : forms.length === 0 ? (
        <EmptyState icon="create-outline" title="No viewing forms" message="Signed viewing forms for this contact show here." />
      ) : (
        forms.map((f) => (
          <ListItem
            key={f._id}
            icon="create-outline"
            title={f.propertyAddress}
            subtitle={`${dateLabel(f.viewingDate)}${f.viewingTime ? ` ${f.viewingTime}` : ""} · ${f.agentName}`}
            right={<Badge label={f.status === "completed" ? "Completed" : "Draft"} tone={f.status === "completed" ? "success" : "warning"} />}
            onPress={() => router.push(`/crm/viewings/${f._id}` as Href)}
          />
        ))
      )}
    </View>
  );
}

const ACTIVITY_ICON: Record<string, IconName> = {
  call: "call-outline",
  whatsapp: "logo-whatsapp",
  email: "mail-outline",
  meeting: "people-outline",
  viewing: "create-outline",
  follow_up: "call-outline",
  paperwork: "document-text-outline",
  note: "time-outline",
};

export function ActivityTab({ profile }: { profile: Profile }) {
  const notes = profile.activities.filter((a) => a.type === "note" || a.status === "completed");
  if (notes.length === 0) {
    return <EmptyState icon="time-outline" title="No activity yet" message="Notes and completed activities across this contact's leads are kept here." />;
  }
  return (
    <View style={{ gap: space.sm }}>
      {notes.map((a) => (
        <Card key={a._id}>
          <Row style={{ alignItems: "flex-start" }}>
            <Ionicons name={ACTIVITY_ICON[a.type] ?? "time-outline"} size={18} color={colors.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{a.title}</Text>
              <Text style={{ fontSize: font.xs, color: colors.faint }}>{dateTimeLabel(a.createdAt)}</Text>
              {a.description ? <Body muted small>{a.description}</Body> : null}
              {a.completionNotes ? (
                <Text style={{ fontSize: font.sm, color: colors.muted, backgroundColor: colors.surface, padding: space.sm, borderRadius: 6 }}>{a.completionNotes}</Text>
              ) : null}
              <Text style={{ fontSize: font.xs, color: colors.faint }}>
                {a.leadName} · {a.assignedToName}
              </Text>
            </View>
          </Row>
        </Card>
      ))}
    </View>
  );
}

export function FollowUpsTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const open = profile.activities.filter((a) => a.status === "todo");
  if (open.length === 0) {
    return <EmptyState icon="checkbox-outline" title="No open follow-ups" message="Outstanding tasks across this contact's leads appear here." />;
  }
  return (
    <View style={{ gap: space.sm }}>
      {open.map((a) => (
        <ListItem
          key={a._id}
          icon={ACTIVITY_ICON[a.type] ?? "checkbox-outline"}
          title={a.title}
          subtitle={`${a.leadName} · ${a.assignedToName}`}
          meta={a.scheduledAt ? `Due ${dateTimeLabel(a.scheduledAt)}` : undefined}
          onPress={a.leadId ? () => router.push(`/crm/leads/${a.leadId}` as Href) : undefined}
        />
      ))}
    </View>
  );
}
