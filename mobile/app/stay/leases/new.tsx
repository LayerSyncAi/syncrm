/** Let a vacant unit: choose the unit and tenant, set the terms. Opens with ?unitId=... from a unit. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, DateField, EmptyState, Field, ListItem, Loading, Notice, Row, Screen, SearchBar, Section, Select, Toggle } from "../../../components/ui";
import { OptionGrid } from "../../../components/stay/option-grid";
import { PersonFields } from "../../../components/stay/person-fields";
import { EMPTY_PERSON, personArg, type PersonForm } from "../../../lib/stay/person";
import { useDebounced } from "../../../lib/stay/hooks";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { HELD_IN_OPTIONS, addDays, addMonths, money, parseAmount, todayLocal } from "@/lib/stay/format";

/** Twelve months, ending the day before the anniversary. */
function defaultEnd(start: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  return addDays(`${addMonths(start.slice(0, 7), 12)}-${start.slice(8, 10)}`, -1);
}

const DUE_DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
type HeldIn = (typeof HELD_IN_OPTIONS)[number]["value"];

export default function NewLease() {
  const router = useRouter();
  const params = useLocalSearchParams<{ unitId?: string }>();
  const units = useQuery(api.stay.properties.vacantUnits);
  const org = useQuery(api.hub.getOrgSettings);
  const create = useMutation(api.stay.leases.create);
  const { busy, run } = useRun();

  const [unitId, setUnitId] = useState<string>(params.unitId ?? "");
  const [tenantMode, setTenantMode] = useState<"new" | "existing">("new");
  const [tenant, setTenant] = useState<PersonForm>(EMPTY_PERSON);
  const [existing, setExisting] = useState<{ _id: Id<"contacts">; name: string } | null>(null);
  const [tenantSearch, setTenantSearch] = useState("");
  const tenantQ = useDebounced(tenantSearch);
  const tenantResults = useQuery(api.stay.people.listTenants, tenantMode === "existing" && tenantQ.trim().length >= 2 ? { q: tenantQ, status: "all" } : "skip");

  const today = todayLocal();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd(today));
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZiG" | "">("");
  const [dueDay, setDueDay] = useState("1");
  const [deposit, setDeposit] = useState("");
  const [heldIn, setHeldIn] = useState<HeldIn>("trust");
  const [chargeFirst, setChargeFirst] = useState(true);
  const [increaseOn, setIncreaseOn] = useState(false);
  const [increaseDate, setIncreaseDate] = useState("");
  const [increaseRent, setIncreaseRent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cur: "USD" | "ZiG" = currency || (org?.defaultCurrency === "ZiG" ? "ZiG" : "USD");

  async function submit() {
    setError(null);
    if (!unitId) return setError("Choose the unit.");
    const rentAmount = parseAmount(rent);
    if (!(rentAmount > 0)) return setError("Enter the monthly rent.");
    if (tenantMode === "existing" && !existing) return setError("Choose the tenant.");
    if (tenantMode === "new" && !tenant.name.trim()) return setError("Enter the tenant's name.");
    if (tenantMode === "new" && !tenant.phone.trim() && !tenant.email.trim()) {
      return setError("Add a phone number or email so the tenant can get receipts and reminders.");
    }
    const depositAmount = deposit.trim() ? parseAmount(deposit) : 0;
    if (Number.isNaN(depositAmount) || depositAmount < 0) return setError("Enter a valid deposit.");
    let rentIncrease: { effectiveDate: string; newRent: number } | undefined;
    if (increaseOn) {
      const newRent = parseAmount(increaseRent);
      if (!increaseDate || !(newRent > 0)) return setError("Enter the date and new rent for the planned increase.");
      rentIncrease = { effectiveDate: increaseDate, newRent };
    }
    const id = await run(
      () =>
        create({
          unitId: unitId as Id<"stayUnits">,
          tenant: tenantMode === "existing" && existing ? { existingContactId: existing._id } : { person: personArg(tenant, false) },
          startDate,
          endDate,
          rentAmount,
          currency: cur,
          dueDay: Number(dueDay),
          depositAmount,
          depositHeldIn: depositAmount > 0 ? heldIn : undefined,
          chargeFirstMonth: chargeFirst,
          rentIncrease,
        }),
      { success: "Lease created. The unit is now occupied." },
    );
    if (id) router.replace(`/stay/leases/${id}` as Href);
  }

  if (units === undefined) return <Loading />;
  if (units.length === 0 && !unitId) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "New lease" }} />
        <EmptyState
          icon="business-outline"
          title="No vacant units"
          message="Every unit you manage is let. Add a property or a unit first, or end the current lease."
          action={<Button variant="secondary" title="Properties" onPress={() => router.navigate("/stay/properties")} />}
        />
      </Screen>
    );
  }

  const rentValue = parseAmount(rent);
  return (
    <Screen>
      <Stack.Screen options={{ title: "New lease" }} />
      {error && <Notice tone="danger">{error}</Notice>}

      <Section title="Unit">
        <Select label="Vacant unit" value={unitId} onChange={setUnitId} placeholder="Choose a unit" options={units.map((u) => ({ value: u.unitId as string, label: u.label }))} />
      </Section>

      <Section title="Tenant">
        <OptionGrid
          value={tenantMode}
          onChange={setTenantMode}
          options={[
            { value: "new", label: "New tenant" },
            { value: "existing", label: "Existing tenant" },
          ]}
        />
        {tenantMode === "new" ? (
          <PersonFields
            value={tenant}
            onChange={setTenant}
            role="tenant"
            onUseExisting={(c) => {
              setExisting(c);
              setTenantMode("existing");
            }}
          />
        ) : existing ? (
          <Card style={{ backgroundColor: colors.surface }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{existing.name}</Text>
              <Button small variant="ghost" title="Change" onPress={() => setExisting(null)} />
            </Row>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <SearchBar value={tenantSearch} onChangeText={setTenantSearch} placeholder="Search tenants by name or phone" />
            {tenantResults?.length === 0 && (
              <Body small muted>
                No tenants found. Use New tenant instead.
              </Body>
            )}
            {tenantResults?.slice(0, 10).map((t) => (
              <ListItem key={t._id} title={t.name} subtitle={[t.phone, t.email].filter(Boolean).join(", ")} onPress={() => setExisting({ _id: t._id, name: t.name })} />
            ))}
          </View>
        )}
      </Section>

      <Section title="Terms">
        <DateField
          label="Start date"
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            setEndDate(defaultEnd(v));
          }}
        />
        <DateField label="End date" value={endDate} onChange={setEndDate} />
        <OptionGrid
          label="Currency"
          value={cur}
          onChange={setCurrency}
          options={[
            { value: "USD", label: "USD" },
            { value: "ZiG", label: "ZiG" },
          ]}
        />
        <Field label={`Monthly rent (${cur})`} value={rent} onChangeText={setRent} keyboardType="decimal-pad" placeholder="0.00" />
        <Select label="Rent due on day" value={dueDay} onChange={setDueDay} options={DUE_DAYS} hint="Day 1 to 28 of each month." />
        <Field label={`Deposit (${cur})`} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" placeholder="0.00" />
        {parseAmount(deposit) > 0 && (
          <Select
            label="Deposit will be held in"
            value={heldIn}
            onChange={setHeldIn}
            options={HELD_IN_OPTIONS.map((h) => ({ value: h.value, label: h.label }))}
            hint="Record the deposit when it is paid, from Record payment. It gets its own receipt."
          />
        )}
        <Toggle
          label={`Charge the first month's rent now${rentValue > 0 ? ` (${money(rentValue, cur)})` : ""}, due on the start date.`}
          hint="After that, rent is charged automatically each month on the due day."
          value={chargeFirst}
          onChange={setChargeFirst}
        />
        <Toggle label="Plan a rent increase" value={increaseOn} onChange={setIncreaseOn} />
        {increaseOn && (
          <>
            <DateField label="From" value={increaseDate} onChange={setIncreaseDate} />
            <Field label={`New monthly rent (${cur})`} value={increaseRent} onChangeText={setIncreaseRent} keyboardType="decimal-pad" />
          </>
        )}
      </Section>

      <Button title="Create lease" onPress={submit} loading={busy} />
    </Screen>
  );
}
