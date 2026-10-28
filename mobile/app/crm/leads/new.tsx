/**
 * Create a lead (leads.createWithProperties): contact, interest, source,
 * budget, stage, owner (admins), areas, notes and optional properties. Opened
 * from a property it arrives with ?propertyId= and ?interestType=.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, Field, Notice, Screen, Section, Select } from "../../../components/ui";
import { AreaPicker, MoneyField } from "../../../components/crm/leads/bits";
import { DuplicateWarning } from "../../../components/crm/leads/DuplicateWarning";
import { ContactPicker, PropertyPicker, type PickedContact } from "../../../components/crm/leads/NewLeadParts";
import { getErrorMessage } from "@/lib/errors";
import { INTEREST_OPTIONS, LEAD_SOURCE_OPTIONS, parseMoney, type InterestType, type LeadSource } from "../../../lib/crm/leads/helpers";
import { isEffectiveAdmin } from "../../../lib/crm/leads/useRefresh";
import { useSession } from "../../../lib/session";
import { space } from "../../../lib/theme";

export default function NewLead() {
  const router = useRouter();
  const params = useLocalSearchParams<{ propertyId?: string; interestType?: string; contactId?: string }>();
  const { user } = useSession();
  const isAdmin = isEffectiveAdmin(user);

  const stages = useQuery(api.stages.list, {});
  const users = useQuery(api.users.listForAssignment, isAdmin ? {} : "skip");
  const locations = useQuery(api.locations.list, {});
  const prefillContact = useQuery(api.contacts.getById, params.contactId ? { contactId: params.contactId as Id<"contacts"> } : "skip");
  const create = useMutation(api.leads.createWithProperties);
  const seedLocations = useMutation(api.locations.seedDefaultsIfEmpty);
  const syncLocations = useMutation(api.locations.syncDefaults);

  const [contact, setContact] = useState<PickedContact | null>(null);
  const [contactError, setContactError] = useState<string>();
  const [interest, setInterest] = useState<InterestType>(params.interestType === "buy" ? "buy" : "rent");
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [currency, setCurrency] = useState("USD");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [propertyIds, setPropertyIds] = useState<Set<Id<"properties">>>(() => new Set(params.propertyId ? [params.propertyId as Id<"properties">] : []));
  const [showProperties, setShowProperties] = useState(!!params.propertyId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Default to the first stage once stages load.
  useEffect(() => {
    if (stages?.length && !stageId) setStageId((stages.find((s) => s.order === 1) ?? stages[0]!)._id);
  }, [stages, stageId]);

  // Same housekeeping as the website: seed or top up the area suggestions.
  // Best effort; refused harmlessly in a read-only view.
  useEffect(() => {
    if (locations === undefined) return;
    (locations.length === 0 ? seedLocations({}) : syncLocations({})).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations !== undefined]);

  useEffect(() => {
    if (prefillContact && !contact) setContact({ _id: prefillContact._id, name: prefillContact.name, phone: prefillContact.phone, email: prefillContact.email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillContact]);

  const minV = parseMoney(min);
  const maxV = parseMoney(max);
  const budgetError = minV !== null && maxV !== null && minV > maxV ? "Minimum cannot be more than maximum" : undefined;
  const stage = stages?.find((s) => s._id === stageId);

  const save = async () => {
    setError("");
    if (!contact) {
      setContactError("Choose a contact");
      return;
    }
    if (budgetError || !stageId) return;
    setBusy(true);
    try {
      const ids = Array.from(propertyIds);
      const leadId = await create({
        contactId: contact._id,
        source,
        interestType: interest,
        budgetCurrency: currency || undefined,
        budgetMin: minV ?? undefined,
        budgetMax: maxV ?? undefined,
        preferredAreas: areas,
        notes: notes.trim(),
        stageId: stageId as Id<"pipelineStages">,
        ownerUserId: isAdmin && ownerId ? (ownerId as Id<"users">) : undefined,
        propertyIds: ids.length ? ids : undefined,
      });
      // Several properties create one lead each, so land on the list.
      if (ids.length > 1) router.replace("/crm/leads");
      else router.replace(`/crm/leads/${leadId}` as Href);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "New lead" }} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ContactPicker
        value={contact}
        onChange={(c) => {
          setContact(c);
          setContactError(undefined);
        }}
        error={contactError}
      />
      {contact && <DuplicateWarning email={contact.email} phone={contact.phone} />}

      <Section title="Lead">
        <Select label="Interest" value={interest} options={INTEREST_OPTIONS} onChange={setInterest} />
        <Select label="Source" value={source} options={LEAD_SOURCE_OPTIONS} onChange={setSource} />
        <MoneyField label="Budget minimum" value={min} onChange={setMin} currency={currency} onCurrency={setCurrency} error={budgetError} />
        <MoneyField label="Budget maximum" value={max} onChange={setMax} currency={currency} />
        <Select
          label="Initial stage"
          value={stageId}
          options={(stages ?? []).map((s) => ({ value: s._id as string, label: s.name }))}
          onChange={setStageId}
          hint={stage?.description}
        />
        {isAdmin && (
          <Select label="Assign to" value={ownerId} options={[{ value: "", label: "Myself" }, ...(users ?? []).map((u) => ({ value: u._id as string, label: u.name }))]} onChange={setOwnerId} />
        )}
        <AreaPicker value={areas} onChange={setAreas} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="What the client is looking for" />
      </Section>

      <Section title="Properties" right={!showProperties ? <Button small variant="secondary" title="Add" icon="add" onPress={() => setShowProperties(true)} /> : undefined}>
        {showProperties ? (
          <PropertyPicker value={propertyIds} onChange={setPropertyIds} interest={interest} budgetMin={min} budgetMax={max} areas={areas} />
        ) : (
          <Card>
            <Body muted>Optional. You can also attach properties later.</Body>
          </Card>
        )}
      </Section>

      <View style={{ gap: space.sm }}>
        <Button
          title={propertyIds.size > 0 ? `Save lead and ${propertyIds.size} propert${propertyIds.size === 1 ? "y" : "ies"}` : "Save lead"}
          loading={busy}
          onPress={save}
        />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
