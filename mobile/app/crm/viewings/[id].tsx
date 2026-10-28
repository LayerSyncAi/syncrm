/** One viewing form: details, signatures, edit while a draft, delete, and share as a PDF. */
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Facts, ListItem, Loading, Row, Screen, Section, Title } from "../../../components/ui";
import { ViewingForm } from "../../../components/crm/records/viewings/ViewingForm";
import { viewingFormHtml } from "../../../lib/crm/records/viewings/pdf";
import { sharePdf } from "../../../lib/files";
import { confirm, useRun } from "../../../lib/useRun";
import { dateLabel } from "../../../lib/format";
import { colors, font, radius, space } from "../../../lib/theme";

function SignatureBlock({ role, name, url }: { role: string; name?: string; url: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 84, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: space.xs }}>
        {url ? <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="contain" /> : <Text style={{ color: colors.faint, fontSize: font.sm }}>No signature</Text>}
      </View>
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text, textAlign: "center" }}>{name || "-"}</Text>
      <Text style={{ fontSize: font.xs, color: colors.muted, textAlign: "center", textTransform: "uppercase" }}>{role}</Text>
    </View>
  );
}

export default function ViewingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const formId = id as Id<"viewingForms">;
  const router = useRouter();
  const form = useQuery(api.viewingForms.getById, { formId });
  const org = useQuery(api.organizations.getMyOrg);
  const remove = useMutation(api.viewingForms.remove);
  const { busy, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (form === undefined) return <Loading />;
  if (form === null) return <EmptyState icon="create-outline" title="Viewing form not found" message="It may have been deleted, or you cannot see it." />;

  const negotiator = form.negotiatorName || form.agentName;
  const completed = form.status === "completed";

  if (editing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Edit viewing form" }} />
        <ViewingForm formId={formId} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Screen>
    );
  }

  const share = async () => {
    setSharing(true);
    await run(async () => {
      const html = await viewingFormHtml(form, org);
      await sharePdf(html, `Viewing form ${form.clientName} ${form.viewingDate}`);
    });
    setSharing(false);
  };

  const del = async () => {
    if (!(await confirm("Delete viewing form?", `The viewing form for "${form.clientName}" will be permanently removed.`, "Delete", true))) return;
    const ok = await run(() => remove({ formId }).then(() => true));
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Viewing form" }} />
      <View style={{ gap: space.xs }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Title style={{ flex: 1 }}>{form.clientName}</Title>
          <Badge label={completed ? "Completed" : "Draft"} tone={completed ? "success" : "warning"} />
        </Row>
        <Text style={{ color: colors.muted, fontSize: font.sm }}>
          {dateLabel(form.viewingDate)}
          {form.viewingTime ? ` at ${form.viewingTime}` : ""}
        </Text>
      </View>

      <Card>
        <Facts
          items={[
            { label: "Property address", value: form.propertyAddress },
            { label: "Client's company", value: form.clientCompany },
            { label: "Client's ID no.", value: form.clientIdNumber },
            { label: "Client's spouse", value: form.clientSpouseName },
            { label: "Telephone", value: form.clientPhone },
            { label: "Email", value: form.clientEmail },
            { label: "Property negotiator", value: negotiator },
            { label: "Agent", value: form.agentName },
            { label: "Completed", value: form.completedAt ? dateLabel(form.completedAt) : undefined },
          ]}
        />
      </Card>

      {(form.leadId || form.propertyId || form.contactId) && (
        <Section title="Linked records">
          {form.leadId && <ListItem icon="git-network-outline" title={form.leadName ?? "Lead"} subtitle="Lead" onPress={() => router.push(`/crm/leads/${form.leadId}`)} />}
          {form.propertyId && <ListItem icon="business-outline" title={form.propertyTitle ?? "Property"} subtitle="Property" onPress={() => router.push(`/crm/properties/${form.propertyId}`)} />}
          {form.contactId && <ListItem icon="person-outline" title={form.contactName ?? "Contact"} subtitle="Contact" onPress={() => router.push(`/crm/contacts/${form.contactId}`)} />}
        </Section>
      )}

      <Section title="Signatures">
        <Card style={{ gap: space.lg }}>
          <SignatureBlock role="Client signature" name={form.clientName} url={form.clientSignatureUrl} />
          <SignatureBlock role="Property negotiator" name={negotiator} url={form.negotiatorSignatureUrl} />
          <SignatureBlock role="Seller / caretaker" name={form.sellerName} url={form.sellerSignatureUrl} />
        </Card>
      </Section>

      <View style={{ gap: space.sm }}>
        <Button title="Share as PDF" icon="share-outline" onPress={share} loading={sharing} />
        {form.canEdit && !completed && <Button variant="secondary" icon="create-outline" title="Edit and sign" onPress={() => setEditing(true)} />}
        {form.canEdit && <Button variant="danger" icon="trash-outline" title="Delete" onPress={del} disabled={busy} />}
      </View>
    </Screen>
  );
}
