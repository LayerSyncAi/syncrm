import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, DateField, Loading, Screen, Select } from "../../../components/ui";
import { todayIso } from "../../../lib/format";
import { useRun } from "../../../lib/useRun";
import { space } from "../../../lib/theme";
import { INSPECTION_TYPES, formatDay, type InspectionType } from "@/lib/stay-ops/labels";

/** Start an inspection draft. ?unitId= pre-selects the unit. */
export default function NewInspection() {
  const router = useRouter();
  const params = useLocalSearchParams<{ unitId?: string }>();
  const units = useQuery(api.stay.maintenance.unitOptions);
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const create = useMutation(api.stay.inspections.create);
  const { busy, run } = useRun();

  const [unitId, setUnitId] = useState(params.unitId ?? "");
  const [type, setType] = useState<InspectionType>("routine");
  const [date, setDate] = useState(todayIso());
  const [inspector, setInspector] = useState("");
  const [leaseId, setLeaseId] = useState("");

  const leases = useQuery(api.stay.inspections.leasesForUnit, unitId ? { unitId: unitId as Id<"stayUnits"> } : "skip");

  // Changing unit drops a lease picked for the previous one.
  useEffect(() => setLeaseId(""), [unitId]);

  if (units === undefined) return <Loading />;
  const selected = units.find((u) => u.unitId === unitId);

  const start = async () => {
    if (!unitId) return run(async () => { throw new Error("Pick a unit."); });
    const id = await run(() =>
      create({
        unitId: unitId as Id<"stayUnits">,
        type,
        date,
        inspectorUserId: inspector ? (inspector as Id<"users">) : undefined,
        leaseId: leaseId ? (leaseId as Id<"stayLeases">) : undefined,
      })
    );
    if (id) router.replace(`/stay/inspections/${id}` as Href);
  };

  return (
    <Screen contentStyle={{ gap: space.lg }}>
      <Stack.Screen options={{ title: "New inspection" }} />
      <Select
        label="Unit"
        placeholder="Choose a unit"
        value={unitId}
        onChange={setUnitId}
        options={units.map((u) => ({ value: u.unitId as string, label: `${u.propertyTitle}, ${u.label}` }))}
        hint={selected ? `${selected.rooms.length || 5} rooms in the checklist${selected.tenantName ? `. Current tenant: ${selected.tenantName}` : ""}` : undefined}
      />
      <Select label="Type" value={type} onChange={setType} options={INSPECTION_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
      <DateField label="Date" value={date} onChange={setDate} />
      <Select
        label="Inspector"
        value={inspector}
        onChange={setInspector}
        options={[{ value: "", label: "Me" }, ...(staff ?? []).map((s) => ({ value: s._id as string, label: s.name }))]}
      />
      {unitId && leases && leases.length > 0 && (
        <>
          <Select
            label="Lease"
            value={leaseId}
            onChange={setLeaseId}
            options={[
              { value: "", label: "Current lease" },
              ...leases.map((l) => ({ value: l.leaseId as string, label: `${l.tenantName}, ${formatDay(l.startDate)} to ${formatDay(l.endDate)} (${l.status})` })),
            ]}
          />
          <Body small muted>Pick an ended lease for a move-out after the tenant has left.</Body>
        </>
      )}
      <Button title="Start inspection" loading={busy} onPress={start} />
    </Screen>
  );
}
