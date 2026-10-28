/** Add a managed property: the building, its landlord, the fee and its units. */
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, Field, Ionicons, ListItem, Notice, Row, Screen, SearchBar, Section, Select } from "../../../components/ui";
import { OptionGrid } from "../../../components/stay/option-grid";
import { PersonFields } from "../../../components/stay/person-fields";
import { EMPTY_PERSON, personArg, type PersonForm } from "../../../lib/stay/person";
import { useDebounced } from "../../../lib/stay/hooks";
import { useSession } from "../../../lib/session";
import { useRun } from "../../../lib/useRun";
import { colors, font, radius, space } from "../../../lib/theme";
import { parseAmount } from "@/lib/stay/format";

type HubType = "house" | "apartment" | "commercial" | "other";
type UnitRow = { label: string; bedrooms: string };

export default function NewStayProperty() {
  const router = useRouter();
  const { hub } = useSession();
  const isAdmin = !!hub?.isAdmin;
  const create = useMutation(api.stay.properties.create);
  const { busy, run } = useRun();

  const [source, setSource] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hubType, setHubType] = useState<HubType>("house");
  const [hubSearch, setHubSearch] = useState("");
  const hubQ = useDebounced(hubSearch);
  const [hubPick, setHubPick] = useState<{ _id: Id<"properties">; title: string; location: string } | null>(null);

  const [kind, setKind] = useState<"residential" | "commercial">("residential");
  const [landlordMode, setLandlordMode] = useState<"existing" | "new">("new");
  const [landlordId, setLandlordId] = useState<Id<"contacts"> | "">("");
  const [landlordName, setLandlordName] = useState("");
  const [landlordSearch, setLandlordSearch] = useState("");
  const landlordQ = useDebounced(landlordSearch);
  const [person, setPerson] = useState<PersonForm>(EMPTY_PERSON);

  const [managerUserId, setManagerUserId] = useState<string>("");
  const [fee, setFee] = useState("10");
  const [units, setUnits] = useState<UnitRow[]>([{ label: "Main", bedrooms: "" }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hubResults = useQuery(api.stay.properties.searchHubProperties, source === "existing" && !hubPick && hubQ.trim().length >= 2 ? { q: hubQ } : "skip");
  const landlords = useQuery(api.stay.people.landlordOptions, landlordMode === "existing" && !landlordId ? { q: landlordQ || undefined } : "skip");
  const managers = useQuery(api.stay.properties.listManagers, isAdmin ? {} : "skip");

  const setUnit = (i: number, patch: Partial<UnitRow>) => setUnits((u) => u.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function submit() {
    setError(null);
    if (source === "new" && (!name.trim() || !address.trim())) return setError("Enter the property name and address.");
    if (source === "existing" && !hubPick) return setError("Pick the CRM property to manage.");
    if (landlordMode === "existing" && !landlordId) return setError("Pick the landlord.");
    if (landlordMode === "new" && !person.name.trim()) return setError("Enter the landlord's name.");
    const feePct = parseAmount(fee);
    if (!(feePct >= 0 && feePct <= 100)) return setError("Management fee must be between 0 and 100%.");
    const unitArgs: Array<{ label: string; bedrooms?: number }> = [];
    for (const u of units) {
      if (!u.label.trim()) continue;
      const beds = u.bedrooms.trim() ? parseInt(u.bedrooms, 10) : undefined;
      if (beds !== undefined && (isNaN(beds) || beds < 0)) return setError(`Bedrooms for ${u.label} must be a number.`);
      unitArgs.push({ label: u.label.trim(), bedrooms: beds });
    }
    if (!unitArgs.length) return setError("Add at least one unit. A house is one unit.");
    if (new Set(unitArgs.map((u) => u.label.toLowerCase())).size !== unitArgs.length) return setError("Each unit needs a different name.");

    const id = await run(
      () =>
        create({
          hubPropertyId: source === "existing" ? hubPick!._id : undefined,
          newProperty: source === "new" ? { name: name.trim(), address: address.trim(), hubType } : undefined,
          kind,
          landlord: landlordMode === "existing" ? { existingContactId: landlordId as Id<"contacts"> } : { person: personArg(person, true) },
          managerUserId: (managerUserId || undefined) as Id<"users"> | undefined,
          managementFeePct: feePct,
          units: unitArgs,
          notes: notes.trim() || undefined,
        }),
      { success: "Property added" },
    );
    if (id) router.replace(`/stay/properties/${id}` as Href);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Add property" }} />

      <Section title="Property">
        <OptionGrid
          value={source}
          onChange={setSource}
          options={[
            { value: "new", label: "New property" },
            { value: "existing", label: "Existing CRM property" },
          ]}
        />
        {source === "new" ? (
          <>
            <Field label="Name" value={name} onChangeText={setName} placeholder="12 Kings Road" />
            <Field label="Address" value={address} onChangeText={setAddress} placeholder="12 Kings Road, Avondale, Harare" />
            <Select
              label="Building type"
              value={hubType}
              onChange={setHubType}
              options={[
                { value: "house", label: "House" },
                { value: "apartment", label: "Apartment block" },
                { value: "commercial", label: "Commercial" },
                { value: "other", label: "Other" },
              ]}
            />
          </>
        ) : hubPick ? (
          <Card style={{ backgroundColor: colors.surface }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{hubPick.title}</Text>
                <Body small muted numberOfLines={1}>
                  {hubPick.location}
                </Body>
              </View>
              <Button small variant="secondary" title="Change" onPress={() => setHubPick(null)} />
            </Row>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <SearchBar value={hubSearch} onChangeText={setHubSearch} placeholder="Search CRM properties by title or location" />
            {hubQ.trim().length >= 2 &&
              (hubResults === undefined ? (
                <Body small muted>
                  Searching...
                </Body>
              ) : hubResults.length === 0 ? (
                <Body small muted>
                  No unmanaged CRM properties match.
                </Body>
              ) : (
                hubResults.map((p) => (
                  <ListItem
                    key={p._id}
                    title={p.title}
                    subtitle={`${p.location} · ${p.listingType === "rent" ? "To let" : "For sale"}`}
                    onPress={() => {
                      setHubPick(p);
                      if (p.type === "commercial") setKind("commercial");
                    }}
                  />
                ))
              ))}
          </View>
        )}
        <OptionGrid
          label="Use"
          value={kind}
          onChange={setKind}
          options={[
            { value: "residential", label: "Residential" },
            { value: "commercial", label: "Commercial" },
          ]}
        />
      </Section>

      <Section title="Landlord">
        <OptionGrid
          value={landlordMode}
          onChange={setLandlordMode}
          options={[
            { value: "new", label: "New landlord" },
            { value: "existing", label: "Existing landlord" },
          ]}
        />
        {landlordMode === "new" ? (
          <PersonFields
            role="landlord"
            value={person}
            onChange={setPerson}
            onUseExisting={(c) => {
              setLandlordId(c._id);
              setLandlordName(c.name);
              setLandlordMode("existing");
            }}
          />
        ) : landlordId ? (
          <Card style={{ backgroundColor: colors.surface }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{landlordName}</Text>
              <Button small variant="secondary" title="Change" onPress={() => setLandlordId("")} />
            </Row>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <SearchBar value={landlordSearch} onChangeText={setLandlordSearch} placeholder="Search landlords by name or phone" />
            {landlords === undefined ? (
              <Body small muted>
                Loading...
              </Body>
            ) : landlords.length === 0 ? (
              <Body small muted>
                No landlords found. Add a new one instead.
              </Body>
            ) : (
              landlords.slice(0, 20).map((l) => (
                <ListItem
                  key={l._id}
                  title={l.name}
                  subtitle={l.phone || undefined}
                  onPress={() => {
                    setLandlordId(l._id);
                    setLandlordName(l.name);
                  }}
                />
              ))
            )}
          </View>
        )}
      </Section>

      <Section title="Management">
        <Field label="Management fee (% of rent collected)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
        {isAdmin && (
          <Select
            label="Property manager"
            value={managerUserId}
            onChange={setManagerUserId}
            options={[{ value: "", label: "Unassigned" }, ...(managers ?? []).map((m) => ({ value: m._id as string, label: m.name }))]}
          />
        )}
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Mandate terms, keys, access arrangements." />
      </Section>

      <Section
        title="Units"
        right={<Button small variant="ghost" icon="add" title="Add unit" onPress={() => setUnits((u) => [...u, { label: `Unit ${u.length + 1}`, bedrooms: "" }])} />}
      >
        <Body small muted>
          A house is one unit. A block of flats has one unit per flat.
        </Body>
        {units.map((u, i) => (
          <Row key={i}>
            <TextInput
              value={u.label}
              onChangeText={(label) => setUnit(i, { label })}
              placeholder="Unit name"
              placeholderTextColor={colors.faint}
              style={[inputStyle, { flex: 1 }]}
            />
            <TextInput
              value={u.bedrooms}
              onChangeText={(bedrooms) => setUnit(i, { bedrooms })}
              placeholder="Beds"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              style={[inputStyle, { width: 72 }]}
            />
            <Pressable
              accessibilityLabel={`Remove ${u.label}`}
              disabled={units.length === 1}
              onPress={() => setUnits((list) => list.filter((_, j) => j !== i))}
              hitSlop={8}
              style={{ opacity: units.length === 1 ? 0.3 : 1, padding: space.xs }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </Row>
        ))}
      </Section>

      {error && <Notice tone="danger">{error}</Notice>}
      <Button title="Add property" onPress={submit} loading={busy} />
    </Screen>
  );
}

const inputStyle = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 12,
  fontSize: font.md,
  color: colors.text,
};
