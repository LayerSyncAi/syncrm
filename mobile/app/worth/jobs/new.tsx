/**
 * Log a valuation instruction (VW-01..03): the instructing party and the
 * property are picked from the Hub's shared records or created on the spot.
 */
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { WorthPartyType, WorthPropertyClass, WorthPurpose } from "../../../../convex/worth/lib";
import { Body, Button, Card, DateField, Field, Loading, Notice, Row, Screen, SearchBar, Section, Select } from "../../../components/ui";
import { ErrorNote, ModeSwitch, Pair } from "../../../components/worth/bits";
import {
  CLASS_LABELS,
  CURRENCY_OPTIONS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  addDaysIso,
  numOrUndef,
  optionsOf,
  todayIso,
  useDebounced,
} from "../../../lib/worth/util";
import { colors, font, radius, space } from "../../../lib/theme";

type PropType = "house" | "apartment" | "land" | "commercial" | "other";
type Mode = "pick" | "new";

const PROP_TYPES: Array<{ value: PropType; label: string }> = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Flat or apartment" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
];

/** A tappable search result. */
function Pick({ title, meta, onPress }: { title: string; meta?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: space.md, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{title}</Text>
      {meta ? <Text style={{ fontSize: font.xs, color: colors.muted }}>{meta}</Text> : null}
    </Pressable>
  );
}

function Chosen({ label, onChange }: { label: string; onChange: () => void }) {
  return (
    <Row style={{ justifyContent: "space-between", padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandLight }}>
      <Text style={{ flex: 1, fontWeight: "600", color: colors.text }}>{label}</Text>
      <Button small variant="ghost" title="Change" onPress={onChange} />
    </Row>
  );
}

export default function NewInstruction() {
  const router = useRouter();
  const settings = useQuery(api.worth.settings.get);
  const create = useMutation(api.worth.jobs.create);
  const valuers = useQuery(api.worth.jobs.valuers);

  const [clientMode, setClientMode] = useState<Mode>("pick");
  const [clientQ, setClientQ] = useState("");
  const [client, setClient] = useState<{ id: Id<"contacts">; label: string } | null>(null);
  const [newClient, setNewClient] = useState({ name: "", entityKind: "company" as "individual" | "company", company: "", phone: "", email: "" });

  const [propMode, setPropMode] = useState<Mode>("pick");
  const [propQ, setPropQ] = useState("");
  const [property, setProperty] = useState<{ id: Id<"properties">; label: string } | null>(null);
  const [newProp, setNewProp] = useState({ address: "", suburb: "", type: "house" as PropType, landSizeM2: "", bedrooms: "", bathrooms: "" });

  const [form, setForm] = useState({
    partyType: "bank" as WorthPartyType,
    contactPerson: "",
    purpose: "bank_lending" as WorthPurpose,
    purposeNote: "",
    propertyClass: "residential" as WorthPropertyClass,
    fee: "",
    currency: "USD" as "USD" | "ZiG",
    receivedDate: todayIso(),
    dueDate: addDaysIso(todayIso(), 7),
    valuerId: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dq = useDebounced(clientQ, 250);
  const clients = useQuery(api.worth.jobs.searchClients, clientMode === "pick" && !client ? { q: dq } : "skip");
  const pq = useDebounced(propQ, 250);
  const props = useQuery(api.worth.jobs.searchProperties, propMode === "pick" && !property ? { q: pq } : "skip");
  const dupPhone = useDebounced(newClient.phone, 400);
  const dupEmail = useDebounced(newClient.email, 400);
  const dups = useQuery(
    api.worth.jobs.findDuplicateClients,
    clientMode === "new" && (dupPhone || dupEmail) ? { phone: dupPhone || undefined, email: dupEmail || undefined } : "skip"
  );

  if (settings === undefined) return <Loading />;
  if (!settings.caps.canManageJobs) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Log instruction" }} />
        <Notice tone="warning">Your role cannot log instructions. A director, signing valuer or valuations admin can.</Notice>
      </Screen>
    );
  }

  const submit = async () => {
    setError(null);
    if (clientMode === "pick" && !client) return setError("Choose the instructing party, or add a new one.");
    if (clientMode === "new" && !newClient.name.trim()) return setError("Enter the client's name.");
    if (clientMode === "new" && !newClient.phone.trim() && !newClient.email.trim()) return setError("Add a phone number or email for the client.");
    if (propMode === "pick" && !property) return setError("Choose the property, or add a new one.");
    if (propMode === "new" && (!newProp.address.trim() || !newProp.suburb.trim())) return setError("Enter the property address and suburb.");
    const fee = numOrUndef(form.fee);
    if (fee === undefined || fee < 0) return setError("Enter the agreed fee.");
    setSaving(true);
    try {
      const res = await create({
        clientContactId: clientMode === "pick" ? client?.id : undefined,
        newClient:
          clientMode === "new"
            ? {
                name: newClient.name.trim(),
                entityKind: newClient.entityKind,
                company: newClient.company.trim() || undefined,
                phone: newClient.phone.trim() || undefined,
                email: newClient.email.trim() || undefined,
              }
            : undefined,
        partyType: form.partyType,
        contactPerson: form.contactPerson.trim() || undefined,
        purpose: form.purpose,
        purposeNote: form.purposeNote.trim() || undefined,
        propertyId: propMode === "pick" ? property?.id : undefined,
        newProperty:
          propMode === "new"
            ? {
                address: newProp.address.trim(),
                suburb: newProp.suburb.trim(),
                type: newProp.type,
                landSizeM2: numOrUndef(newProp.landSizeM2),
                bedrooms: numOrUndef(newProp.bedrooms),
                bathrooms: numOrUndef(newProp.bathrooms),
              }
            : undefined,
        propertyClass: form.propertyClass,
        fee,
        currency: form.currency,
        receivedDate: form.receivedDate,
        dueDate: form.dueDate,
        assignedValuerId: (form.valuerId as Id<"users">) || undefined,
        note: form.note.trim() || undefined,
      });
      Alert.alert("Instruction logged", res.reference);
      router.replace(`/worth/jobs/${res.jobId}` as Href);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: "Log instruction" }} />
      <Body muted small>
        Record who instructed, the property, the purpose, the fee and when the report is due.
      </Body>

      <Section title="Instructing party">
        <ModeSwitch value={clientMode} onChange={setClientMode} options={[{ value: "pick", label: "Choose existing" }, { value: "new", label: "New client" }]} />
        <Select label="Type" value={form.partyType} options={optionsOf(PARTY_LABELS)} onChange={(v) => setForm({ ...form, partyType: v })} />
        <Field label="Contact person" value={form.contactPerson} onChangeText={(t) => setForm({ ...form, contactPerson: t })} placeholder="Credit officer, lawyer" />
        {clientMode === "pick" ? (
          client ? (
            <Chosen label={client.label} onChange={() => setClient(null)} />
          ) : (
            <View style={{ gap: space.sm }}>
              <SearchBar value={clientQ} onChangeText={setClientQ} placeholder="Name, company, phone or email" />
              <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {clients === undefined ? (
                  <Body muted small style={{ padding: space.md }}>
                    Searching...
                  </Body>
                ) : clients.length === 0 ? (
                  <Body muted small style={{ padding: space.md }}>
                    No contacts match. Add a new client instead.
                  </Body>
                ) : (
                  clients.map((c) => (
                    <Pick
                      key={c._id}
                      title={c.company ? `${c.name} · ${c.company}` : c.name}
                      meta={c.isValuationClient ? "Valuation client" : c.phone || c.email}
                      onPress={() => setClient({ id: c._id, label: c.company && c.entityKind === "company" ? `${c.company} (${c.name})` : c.name })}
                    />
                  ))
                )}
              </Card>
            </View>
          )
        ) : (
          <View style={{ gap: space.md }}>
            <Field label="Name" value={newClient.name} onChangeText={(t) => setNewClient({ ...newClient, name: t })} placeholder="Person or organisation" />
            <Select
              label="Kind"
              value={newClient.entityKind}
              options={[
                { value: "company", label: "Company or bank" },
                { value: "individual", label: "Individual" },
              ]}
              onChange={(v) => setNewClient({ ...newClient, entityKind: v })}
            />
            {newClient.entityKind === "company" && (
              <Field label="Company name" value={newClient.company} onChangeText={(t) => setNewClient({ ...newClient, company: t })} placeholder="e.g. CBZ Bank, Harare branch" />
            )}
            <Field label="Phone" value={newClient.phone} onChangeText={(t) => setNewClient({ ...newClient, phone: t })} keyboardType="phone-pad" />
            <Field label="Email" value={newClient.email} onChangeText={(t) => setNewClient({ ...newClient, email: t })} keyboardType="email-address" autoCapitalize="none" />
            {dups && dups.length > 0 && (
              <Card style={{ backgroundColor: colors.warningBg, borderColor: colors.warning + "33" }}>
                <Text style={{ color: colors.warning, fontWeight: "600" }}>This phone or email already belongs to a contact.</Text>
                {dups.map((d) => (
                  <Row key={d._id} style={{ justifyContent: "space-between" }}>
                    <Text style={{ flex: 1, color: colors.text, fontSize: font.sm }}>
                      {d.name}
                      {d.company ? ` · ${d.company}` : ""} ({d.phone || d.email})
                    </Text>
                    <Button
                      small
                      variant="secondary"
                      title="Use this contact"
                      onPress={() => {
                        setClientMode("pick");
                        setClient({ id: d._id, label: d.company ? `${d.company} (${d.name})` : d.name });
                      }}
                    />
                  </Row>
                ))}
              </Card>
            )}
          </View>
        )}
      </Section>

      <Section title="Property">
        <ModeSwitch value={propMode} onChange={setPropMode} options={[{ value: "pick", label: "Choose existing" }, { value: "new", label: "New property" }]} />
        {propMode === "pick" ? (
          property ? (
            <Chosen label={property.label} onChange={() => setProperty(null)} />
          ) : (
            <View style={{ gap: space.sm }}>
              <SearchBar value={propQ} onChangeText={setPropQ} placeholder="Address or suburb" />
              <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {props === undefined ? (
                  <Body muted small style={{ padding: space.md }}>
                    Searching...
                  </Body>
                ) : props.length === 0 ? (
                  <Body muted small style={{ padding: space.md }}>
                    No properties match. Add a new property instead.
                  </Body>
                ) : (
                  props.map((p) => (
                    <Pick
                      key={p._id}
                      title={p.title}
                      meta={p.location}
                      onPress={() => {
                        setProperty({ id: p._id, label: `${p.title}, ${p.location}` });
                        if (p.type === "commercial") setForm((f) => ({ ...f, propertyClass: "commercial" }));
                        if (p.type === "land") setForm((f) => ({ ...f, propertyClass: "vacant_land" }));
                      }}
                    />
                  ))
                )}
              </Card>
            </View>
          )
        ) : (
          <View style={{ gap: space.md }}>
            <Field label="Address" value={newProp.address} onChangeText={(t) => setNewProp({ ...newProp, address: t })} placeholder="Stand number and street" />
            <Field label="Suburb" value={newProp.suburb} onChangeText={(t) => setNewProp({ ...newProp, suburb: t })} />
            <Select label="Type" value={newProp.type} options={PROP_TYPES} onChange={(v) => setNewProp({ ...newProp, type: v })} />
            <Field label="Land size (m²)" value={newProp.landSizeM2} onChangeText={(t) => setNewProp({ ...newProp, landSizeM2: t })} keyboardType="decimal-pad" />
            <Pair>
              <Field label="Bedrooms" value={newProp.bedrooms} onChangeText={(t) => setNewProp({ ...newProp, bedrooms: t })} keyboardType="number-pad" />
              <Field label="Bathrooms" value={newProp.bathrooms} onChangeText={(t) => setNewProp({ ...newProp, bathrooms: t })} keyboardType="number-pad" />
            </Pair>
          </View>
        )}
        <Select label="Category" value={form.propertyClass} options={optionsOf(CLASS_LABELS)} onChange={(v) => setForm({ ...form, propertyClass: v })} />
      </Section>

      <Section title="Purpose, fee and dates">
        <Select label="Purpose" value={form.purpose} options={optionsOf(PURPOSE_LABELS)} onChange={(v) => setForm({ ...form, purpose: v })} />
        <Field
          label={form.purpose === "other" ? "Describe the purpose" : "Purpose note"}
          value={form.purposeNote}
          onChangeText={(t) => setForm({ ...form, purposeNote: t })}
          placeholder="Optional"
        />
        <Pair>
          <Select label="Currency" value={form.currency} options={CURRENCY_OPTIONS} onChange={(v) => setForm({ ...form, currency: v })} />
          <Field label="Agreed fee" value={form.fee} onChangeText={(t) => setForm({ ...form, fee: t })} keyboardType="decimal-pad" placeholder="0" />
        </Pair>
        <Select
          label="Assign to"
          hint="Open jobs in brackets. You can assign later."
          value={form.valuerId}
          placeholder="Not yet assigned"
          options={[
            { value: "", label: "Not yet assigned" },
            ...[...(valuers ?? [])].sort((a, b) => a.openJobs - b.openJobs).map((v) => ({
              value: v.userId as string,
              label: `${v.name} (${v.openJobs} open)${v.isSigning ? ", signing valuer" : ""}`,
            })),
          ]}
          onChange={(v) => setForm({ ...form, valuerId: v })}
        />
        <DateField label="Date received" value={form.receivedDate} onChange={(v) => setForm({ ...form, receivedDate: v })} />
        <DateField label="Date due" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
        <Field label="Note" value={form.note} onChangeText={(t) => setForm({ ...form, note: t })} multiline placeholder="Access arrangements, keys, who to call on site" />
      </Section>

      <ErrorNote message={error} />
      <Button title={saving ? "Saving..." : "Log instruction"} onPress={submit} loading={saving} />
    </Screen>
  );
}
