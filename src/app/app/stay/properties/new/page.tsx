"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { EMPTY_PERSON, PersonFields, personArg, type PersonForm } from "@/components/stay/person-fields";
import { parseAmount } from "@/lib/stay/format";
import { cn } from "@/lib/utils";

type HubType = "house" | "apartment" | "commercial" | "other";
type UnitRow = { label: string; bedrooms: string };

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 rounded-[10px] border px-2 text-sm font-medium",
            value === o.value ? "border-emerald-600 bg-emerald-600/10 text-emerald-700" : "border-border-strong"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function NewStayPropertyPage() {
  const router = useRouter();
  const hub = useQuery(api.hub.getContext);
  const isAdmin = !!hub?.isAdmin;

  const [source, setSource] = React.useState<"new" | "existing">("new");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [hubType, setHubType] = React.useState<HubType>("house");
  const [hubSearch, setHubSearch] = React.useState("");
  const [hubQ, setHubQ] = React.useState("");
  const [hubPick, setHubPick] = React.useState<{ _id: Id<"properties">; title: string; location: string } | null>(null);

  const [kind, setKind] = React.useState<"residential" | "commercial">("residential");
  const [landlordMode, setLandlordMode] = React.useState<"existing" | "new">("new");
  const [landlordId, setLandlordId] = React.useState<Id<"contacts"> | "">("");
  const [landlordName, setLandlordName] = React.useState("");
  const [landlordSearch, setLandlordSearch] = React.useState("");
  const [person, setPerson] = React.useState<PersonForm>(EMPTY_PERSON);

  const [managerUserId, setManagerUserId] = React.useState<Id<"users"> | "">("");
  const [fee, setFee] = React.useState("10");
  const [units, setUnits] = React.useState<UnitRow[]>([{ label: "Main", bedrooms: "" }]);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setHubQ(hubSearch), 300);
    return () => clearTimeout(t);
  }, [hubSearch]);

  const hubResults = useQuery(
    api.stay.properties.searchHubProperties,
    source === "existing" && !hubPick && hubQ.trim().length >= 2 ? { q: hubQ } : "skip"
  );
  const landlords = useQuery(api.stay.people.landlordOptions, landlordMode === "existing" ? { q: landlordSearch || undefined } : "skip");
  const managers = useQuery(api.stay.properties.listManagers, isAdmin ? {} : "skip");
  const create = useMutation(api.stay.properties.create);

  const setUnit = (i: number, patch: Partial<UnitRow>) => setUnits((u) => u.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function submit() {
    setError(null);
    if (source === "new" && (!name.trim() || !address.trim())) return setError("Enter the property name and address.");
    if (source === "existing" && !hubPick) return setError("Pick the CRM property to manage.");
    if (landlordMode === "existing" && !landlordId) return setError("Pick the landlord.");
    if (landlordMode === "new" && !person.name.trim()) return setError("Enter the landlord's name.");
    const feePct = parseAmount(fee);
    if (!(feePct >= 0 && feePct <= 100)) return setError("Management fee must be between 0 and 100%.");
    const unitArgs = [];
    for (const u of units) {
      if (!u.label.trim()) continue;
      const beds = u.bedrooms.trim() ? parseInt(u.bedrooms, 10) : undefined;
      if (beds !== undefined && (isNaN(beds) || beds < 0)) return setError(`Bedrooms for ${u.label} must be a number.`);
      unitArgs.push({ label: u.label.trim(), bedrooms: beds });
    }
    if (!unitArgs.length) return setError("Add at least one unit. A house is one unit.");
    if (new Set(unitArgs.map((u) => u.label.toLowerCase())).size !== unitArgs.length) return setError("Each unit needs a different name.");

    setSaving(true);
    try {
      const id = await create({
        hubPropertyId: source === "existing" ? hubPick!._id : undefined,
        newProperty: source === "new" ? { name: name.trim(), address: address.trim(), hubType } : undefined,
        kind,
        landlord: landlordMode === "existing" ? { existingContactId: landlordId as Id<"contacts"> } : { person: personArg(person, true) },
        managerUserId: managerUserId || undefined,
        managementFeePct: feePct,
        units: unitArgs,
        notes: notes.trim() || undefined,
      });
      animatedToast.success("Property added", { description: source === "new" ? name.trim() : hubPick!.title });
      router.push(`/app/stay/properties/${id}`);
    } catch (e) {
      setError(getErrorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <StayPageHeader title="Add property" back={{ href: "/app/stay/properties", label: "Properties" }} />

      <Section title="Property">
        <div className="space-y-4">
          <Toggle
            value={source}
            onChange={(v) => setSource(v)}
            options={[
              { value: "new", label: "New property" },
              { value: "existing", label: "Existing CRM property" },
            ]}
          />
          {source === "new" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>
                  Name <span className="text-danger">*</span>
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="12 Kings Road" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>
                  Address <span className="text-danger">*</span>
                </Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Kings Road, Avondale, Harare" />
              </div>
              <div className="space-y-2">
                <Label>Building type</Label>
                <Select value={hubType} onChange={(e) => setHubType(e.target.value as HubType)}>
                  <option value="house">House</option>
                  <option value="apartment">Apartment block</option>
                  <option value="commercial">Commercial</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
          ) : hubPick ? (
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{hubPick.title}</p>
                <p className="truncate text-text-muted">{hubPick.location}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setHubPick(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input autoFocus placeholder="Search CRM properties by title or location" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)} />
              {hubQ.trim().length >= 2 &&
                (hubResults === undefined ? (
                  <p className="text-sm text-text-muted">Searching...</p>
                ) : hubResults.length === 0 ? (
                  <p className="text-sm text-text-muted">No unmanaged CRM properties match.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-[10px] border border-border-strong">
                    {hubResults.map((p) => (
                      <li key={p._id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-row-hover"
                          onClick={() => {
                            setHubPick(p);
                            if (p.type === "commercial") setKind("commercial");
                          }}
                        >
                          <span className="block font-medium">{p.title}</span>
                          <span className="block text-xs text-text-muted">
                            {p.location} · {p.listingType === "rent" ? "To let" : "For sale"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>Use</Label>
            <Toggle
              value={kind}
              onChange={setKind}
              options={[
                { value: "residential", label: "Residential" },
                { value: "commercial", label: "Commercial" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Landlord">
        <div className="space-y-4">
          <Toggle
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
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 p-3 text-sm">
              <p className="font-medium">{landlordName}</p>
              <Button variant="secondary" size="sm" onClick={() => setLandlordId("")}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Search landlords by name or phone" value={landlordSearch} onChange={(e) => setLandlordSearch(e.target.value)} />
              {landlords === undefined ? (
                <p className="text-sm text-text-muted">Loading...</p>
              ) : landlords.length === 0 ? (
                <p className="text-sm text-text-muted">No landlords found. Add a new one instead.</p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-[10px] border border-border-strong">
                  {landlords.map((l) => (
                    <li key={l._id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-row-hover"
                        onClick={() => {
                          setLandlordId(l._id);
                          setLandlordName(l.name);
                        }}
                      >
                        <span className="font-medium">{l.name}</span>
                        {l.phone && <span className="text-text-muted"> {l.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Management">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Management fee (% of rent collected)</Label>
            <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label>Property manager</Label>
              <Select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value as Id<"users"> | "")}>
                <option value="">Unassigned</option>
                {(managers ?? []).map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} className="min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mandate terms, keys, access arrangements." />
          </div>
        </div>
      </Section>

      <Section
        title="Units"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setUnits((u) => [...u, { label: `Unit ${u.length + 1}`, bedrooms: "" }])}>
            <Plus className="h-4 w-4" />
            Add unit
          </Button>
        }
      >
        <p className="mb-3 text-sm text-text-muted">A house is one unit. A block of flats has one unit per flat.</p>
        <div className="space-y-2">
          {units.map((u, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {i === 0 && <Label>Unit name</Label>}
                <Input value={u.label} onChange={(e) => setUnit(i, { label: e.target.value })} />
              </div>
              <div className="w-24 space-y-1">
                {i === 0 && <Label>Bedrooms</Label>}
                <Input inputMode="numeric" value={u.bedrooms} onChange={(e) => setUnit(i, { bedrooms: e.target.value })} />
              </div>
              <Button
                variant="ghost"
                className="h-10 w-10 p-0"
                aria-label={`Remove ${u.label}`}
                disabled={units.length === 1}
                onClick={() => setUnits((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <FormError message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => router.push("/app/stay/properties")} disabled={saving} className="h-12 sm:h-10">
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving} className="h-12 sm:h-10">
          {saving ? "Saving..." : "Add property"}
        </Button>
      </div>
    </div>
  );
}
