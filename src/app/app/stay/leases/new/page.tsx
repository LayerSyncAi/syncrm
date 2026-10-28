"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { EMPTY_PERSON, PersonFields, personArg, type PersonForm } from "@/components/stay/person-fields";
import { HELD_IN_OPTIONS, addDays, addMonths, money, parseAmount, todayLocal } from "@/lib/stay/format";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

function defaultEnd(start: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  // Twelve months, ending the day before the anniversary.
  return addDays(`${addMonths(start.slice(0, 7), 12)}-${start.slice(8, 10)}`, -1);
}

function NewLeaseForm() {
  const router = useRouter();
  const params = useSearchParams();
  const units = useQuery(api.stay.properties.vacantUnits);
  const org = useQuery(api.hub.getOrgSettings);
  const create = useMutation(api.stay.leases.create);

  const [unitId, setUnitId] = React.useState<string>(params.get("unitId") ?? "");
  const [tenantMode, setTenantMode] = React.useState<"new" | "existing">("new");
  const [tenant, setTenant] = React.useState<PersonForm>(EMPTY_PERSON);
  const [existing, setExisting] = React.useState<{ _id: Id<"contacts">; name: string } | null>(null);
  const [tenantQ, setTenantQ] = React.useState("");
  const tenantResults = useQuery(
    api.stay.people.listTenants,
    tenantMode === "existing" && tenantQ.trim().length >= 2 ? { q: tenantQ, status: "all" } : "skip"
  );

  const today = todayLocal();
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(defaultEnd(today));
  const [rent, setRent] = React.useState("");
  const [currency, setCurrency] = React.useState<"USD" | "ZiG" | "">("");
  const [dueDay, setDueDay] = React.useState("1");
  const [deposit, setDeposit] = React.useState("");
  const [heldIn, setHeldIn] = React.useState<"trust" | "business" | "landlord">("trust");
  const [chargeFirst, setChargeFirst] = React.useState(true);
  const [increaseOn, setIncreaseOn] = React.useState(false);
  const [increaseDate, setIncreaseDate] = React.useState("");
  const [increaseRent, setIncreaseRent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const cur = currency || org?.defaultCurrency || "USD";

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
    setSaving(true);
    try {
      const id = await create({
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
      });
      animatedToast.success("Lease created", { description: "The unit is now occupied." });
      router.push(`/app/stay/leases/${id}`);
    } catch (e) {
      setError(getErrorMessage(e));
      setSaving(false);
    }
  }

  if (units === undefined) return <ListSkeleton />;
  if (units.length === 0 && !unitId) {
    return (
      <div className="space-y-6">
        <StayPageHeader title="New lease" back={{ href: "/app/stay/leases", label: "Leases" }} />
        <EmptyState
          icon={Building2}
          title="No vacant units"
          description="Every unit you manage is let. Add a property or a unit first, or end the current lease."
          action={
            <Link href="/app/stay/properties">
              <Button variant="secondary">Properties</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <StayPageHeader title="New lease" back={{ href: "/app/stay/leases", label: "Leases" }} />
      <FormError message={error} />

      <Section title="Unit">
        <div className="space-y-2">
          <Label>Vacant unit</Label>
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      <Section title="Tenant">
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["new", "existing"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTenantMode(m)}
              className={cn(
                "h-10 rounded-[10px] border text-sm font-medium",
                tenantMode === m ? "border-primary-600 bg-primary-600/10 text-primary-600" : "border-border-strong"
              )}
            >
              {m === "new" ? "New tenant" : "Existing tenant"}
            </button>
          ))}
        </div>
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
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 p-3">
            <span className="font-medium">{existing.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setExisting(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Search tenants by name or phone" value={tenantQ} onChange={(e) => setTenantQ(e.target.value)} autoFocus />
            {tenantResults && (
              <ul className="divide-y divide-border rounded-[10px] border border-border-strong">
                {tenantResults.length === 0 && <li className="p-3 text-sm text-text-muted">No tenants found. Use New tenant instead.</li>}
                {tenantResults.slice(0, 10).map((t) => (
                  <li key={t._id}>
                    <button type="button" className="w-full px-3 py-2.5 text-left hover:bg-row-hover" onClick={() => setExisting({ _id: t._id, name: t.name })}>
                      <span className="block font-medium">{t.name}</span>
                      <span className="block text-xs text-text-muted">{[t.phone, t.email].filter(Boolean).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title="Terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setEndDate(defaultEnd(e.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Monthly rent</Label>
            <Input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={cur} onChange={(e) => setCurrency(e.target.value as "USD" | "ZiG")}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rent due on day</Label>
            <Select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <p className="text-xs text-text-muted">Day 1 to 28 of each month.</p>
          </div>
          <div className="space-y-2">
            <Label>Deposit</Label>
            <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          {parseAmount(deposit) > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Deposit will be held in</Label>
              <Select value={heldIn} onChange={(e) => setHeldIn(e.target.value as typeof heldIn)}>
                {HELD_IN_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-text-muted">Record the deposit when it is paid, from Record payment. It gets its own receipt.</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-emerald-600" checked={chargeFirst} onChange={(e) => setChargeFirst(e.target.checked)} />
            <span>
              Charge the first month&apos;s rent now{rent && parseAmount(rent) > 0 ? ` (${money(parseAmount(rent), cur)})` : ""}, due on the start date.
              <span className="block text-xs text-text-muted">After that, rent is charged automatically each month on the due day.</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={increaseOn} onChange={(e) => setIncreaseOn(e.target.checked)} />
            Plan a rent increase
          </label>
          {increaseOn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={increaseDate} onChange={(e) => setIncreaseDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>New monthly rent ({cur})</Label>
                <Input inputMode="decimal" value={increaseRent} onChange={(e) => setIncreaseRent(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/app/stay/leases">
          <Button variant="secondary" className="w-full sm:w-auto">
            Cancel
          </Button>
        </Link>
        <Button onClick={submit} disabled={saving} className="h-12 sm:h-10">
          {saving ? "Saving..." : "Create lease"}
        </Button>
      </div>
    </div>
  );
}

export default function NewLeasePage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <NewLeaseForm />
    </React.Suspense>
  );
}
