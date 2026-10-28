"use client";

/**
 * Log a valuation instruction (VW-01..03): the instructing party and the
 * property are picked from the Hub's shared records or created on the spot.
 */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { CLASS_LABELS, PARTY_LABELS, PURPOSE_LABELS, addDaysIso, todayIso } from "@/lib/worth/format";
import type { WorthPartyType, WorthPropertyClass, WorthPurpose } from "../../../convex/worth/lib";
import { ErrorNote, Field, numOrUndef, worthToast } from "./ui";

type PropType = "house" | "apartment" | "land" | "commercial" | "other";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ModeSwitch({ mode, onChange, newLabel }: { mode: "pick" | "new"; onChange: (m: "pick" | "new") => void; newLabel: string }) {
  return (
    <div className="inline-flex rounded-[10px] border border-border-strong p-0.5 text-xs">
      {(["pick", "new"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-[8px] px-3 py-1.5 font-medium ${mode === m ? "bg-primary-600 text-white" : "text-text-muted"}`}
        >
          {m === "pick" ? "Choose existing" : newLabel}
        </button>
      ))}
    </div>
  );
}

export function InstructionForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const create = useMutation(api.worth.jobs.create);
  const valuers = useQuery(api.worth.jobs.valuers, open ? {} : "skip");

  const [clientMode, setClientMode] = React.useState<"pick" | "new">("pick");
  const [clientQ, setClientQ] = React.useState("");
  const [clientId, setClientId] = React.useState<Id<"contacts"> | null>(null);
  const [clientLabel, setClientLabel] = React.useState("");
  const [newClient, setNewClient] = React.useState({
    name: "",
    entityKind: "company" as "individual" | "company",
    company: "",
    phone: "",
    email: "",
  });

  const [propMode, setPropMode] = React.useState<"pick" | "new">("pick");
  const [propQ, setPropQ] = React.useState("");
  const [propertyId, setPropertyId] = React.useState<Id<"properties"> | null>(null);
  const [propLabel, setPropLabel] = React.useState("");
  const [newProp, setNewProp] = React.useState({ address: "", suburb: "", type: "house" as PropType, landSizeM2: "", bedrooms: "", bathrooms: "" });

  const [form, setForm] = React.useState({
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
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const dq = useDebounced(clientQ);
  const clients = useQuery(api.worth.jobs.searchClients, open && clientMode === "pick" ? { q: dq } : "skip");
  const pq = useDebounced(propQ);
  const props = useQuery(api.worth.jobs.searchProperties, open && propMode === "pick" ? { q: pq } : "skip");
  const dupPhone = useDebounced(newClient.phone, 400);
  const dupEmail = useDebounced(newClient.email, 400);
  const dups = useQuery(
    api.worth.jobs.findDuplicateClients,
    open && clientMode === "new" && (dupPhone || dupEmail) ? { phone: dupPhone || undefined, email: dupEmail || undefined } : "skip"
  );

  const reset = () => {
    setClientMode("pick");
    setClientQ("");
    setClientId(null);
    setClientLabel("");
    setNewClient({ name: "", entityKind: "company", company: "", phone: "", email: "" });
    setPropMode("pick");
    setPropQ("");
    setPropertyId(null);
    setPropLabel("");
    setNewProp({ address: "", suburb: "", type: "house", landSizeM2: "", bedrooms: "", bathrooms: "" });
    setForm((f) => ({ ...f, contactPerson: "", purposeNote: "", fee: "", valuerId: "", note: "", receivedDate: todayIso(), dueDate: addDaysIso(todayIso(), 7) }));
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (clientMode === "pick" && !clientId) return setError("Choose the instructing party, or add a new one.");
    if (clientMode === "new" && !newClient.name.trim()) return setError("Enter the client's name.");
    if (clientMode === "new" && !newClient.phone.trim() && !newClient.email.trim()) {
      return setError("Add a phone number or email for the client.");
    }
    if (propMode === "pick" && !propertyId) return setError("Choose the property, or add a new one.");
    if (propMode === "new" && (!newProp.address.trim() || !newProp.suburb.trim())) {
      return setError("Enter the property address and suburb.");
    }
    const fee = numOrUndef(form.fee);
    if (fee === undefined || fee < 0) return setError("Enter the agreed fee.");
    setSaving(true);
    try {
      const res = await create({
        clientContactId: clientMode === "pick" ? clientId ?? undefined : undefined,
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
        propertyId: propMode === "pick" ? propertyId ?? undefined : undefined,
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
      worthToast.done("Instruction logged", res.reference);
      close();
      router.push(`/app/worth/jobs/${res.jobId}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Log instruction"
      description="Record who instructed, the property, the purpose, the fee and when the report is due."
      onClose={close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Log instruction"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <ErrorNote message={error} />

        {/* Instructing party */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Instructing party</h4>
            <ModeSwitch mode={clientMode} onChange={setClientMode} newLabel="New client" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" required>
              <Select value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value as WorthPartyType })}>
                {Object.entries(PARTY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact person">
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Credit officer, lawyer" />
            </Field>
          </div>
          {clientMode === "pick" ? (
            clientId ? (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-primary-600/40 bg-primary-600/5 px-3 py-2 text-sm">
                <span className="font-medium">{clientLabel}</span>
                <Button variant="ghost" size="sm" onClick={() => setClientId(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input value={clientQ} onChange={(e) => setClientQ(e.target.value)} placeholder="Search contacts by name, company, phone or email" />
                <div className="max-h-48 overflow-y-auto rounded-[10px] border border-border">
                  {clients === undefined ? (
                    <p className="p-3 text-sm text-text-muted">Searching...</p>
                  ) : clients.length === 0 ? (
                    <p className="p-3 text-sm text-text-muted">No contacts match. Add a new client instead.</p>
                  ) : (
                    clients.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => {
                          setClientId(c._id);
                          setClientLabel(c.company && c.entityKind === "company" ? `${c.company} (${c.name})` : c.name);
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-row-hover"
                      >
                        <span>
                          <span className="font-medium">{c.name}</span>
                          {c.company && <span className="text-text-muted"> · {c.company}</span>}
                        </span>
                        <span className="text-xs text-text-dim">{c.isValuationClient ? "Valuation client" : c.phone || c.email}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Person or organisation" />
              </Field>
              <Field label="Kind">
                <Select value={newClient.entityKind} onChange={(e) => setNewClient({ ...newClient, entityKind: e.target.value as "individual" | "company" })}>
                  <option value="company">Company or bank</option>
                  <option value="individual">Individual</option>
                </Select>
              </Field>
              {newClient.entityKind === "company" && (
                <Field label="Company name" className="sm:col-span-2">
                  <Input value={newClient.company} onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} placeholder="e.g. CBZ Bank, Harare branch" />
                </Field>
              )}
              <Field label="Phone">
                <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} inputMode="tel" />
              </Field>
              <Field label="Email">
                <Input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
              </Field>
              {dups && dups.length > 0 && (
                <div className="space-y-2 rounded-[10px] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--status-warning-fg)] sm:col-span-2">
                  <p className="font-medium">This phone or email already belongs to a contact.</p>
                  {dups.map((d) => (
                    <div key={d._id} className="flex items-center justify-between gap-2">
                      <span>
                        {d.name}
                        {d.company ? ` · ${d.company}` : ""} ({d.phone || d.email})
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setClientMode("pick");
                          setClientId(d._id);
                          setClientLabel(d.company ? `${d.company} (${d.name})` : d.name);
                        }}
                      >
                        Use this contact
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Property */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Property</h4>
            <ModeSwitch mode={propMode} onChange={setPropMode} newLabel="New property" />
          </div>
          {propMode === "pick" ? (
            propertyId ? (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-primary-600/40 bg-primary-600/5 px-3 py-2 text-sm">
                <span className="font-medium">{propLabel}</span>
                <Button variant="ghost" size="sm" onClick={() => setPropertyId(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input value={propQ} onChange={(e) => setPropQ(e.target.value)} placeholder="Search properties by address or suburb" />
                <div className="max-h-48 overflow-y-auto rounded-[10px] border border-border">
                  {props === undefined ? (
                    <p className="p-3 text-sm text-text-muted">Searching...</p>
                  ) : props.length === 0 ? (
                    <p className="p-3 text-sm text-text-muted">No properties match. Add a new property instead.</p>
                  ) : (
                    props.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => {
                          setPropertyId(p._id);
                          setPropLabel(`${p.title}, ${p.location}`);
                          if (p.type === "commercial") setForm((f) => ({ ...f, propertyClass: "commercial" }));
                          if (p.type === "land") setForm((f) => ({ ...f, propertyClass: "vacant_land" }));
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-row-hover"
                      >
                        <span className="font-medium">{p.title}</span>
                        <span className="text-xs text-text-dim">{p.location}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Address" required className="sm:col-span-2">
                <Input value={newProp.address} onChange={(e) => setNewProp({ ...newProp, address: e.target.value })} placeholder="Stand number and street" />
              </Field>
              <Field label="Suburb" required>
                <Input value={newProp.suburb} onChange={(e) => setNewProp({ ...newProp, suburb: e.target.value })} />
              </Field>
              <Field label="Type">
                <Select value={newProp.type} onChange={(e) => setNewProp({ ...newProp, type: e.target.value as PropType })}>
                  <option value="house">House</option>
                  <option value="apartment">Flat or apartment</option>
                  <option value="land">Land</option>
                  <option value="commercial">Commercial</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Land size (m²)">
                <Input inputMode="decimal" value={newProp.landSizeM2} onChange={(e) => setNewProp({ ...newProp, landSizeM2: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bedrooms">
                  <Input inputMode="numeric" value={newProp.bedrooms} onChange={(e) => setNewProp({ ...newProp, bedrooms: e.target.value })} />
                </Field>
                <Field label="Bathrooms">
                  <Input inputMode="numeric" value={newProp.bathrooms} onChange={(e) => setNewProp({ ...newProp, bathrooms: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
          <Field label="Category">
            <Select value={form.propertyClass} onChange={(e) => setForm({ ...form, propertyClass: e.target.value as WorthPropertyClass })}>
              {Object.entries(CLASS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        {/* Purpose, fee and dates */}
        <section className="grid gap-3 sm:grid-cols-2">
          <h4 className="text-sm font-semibold sm:col-span-2">Purpose, fee and dates</h4>
          <Field label="Purpose" required>
            <Select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as WorthPurpose })}>
              {Object.entries(PURPOSE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={form.purpose === "other" ? "Describe the purpose" : "Purpose note"}>
            <Input value={form.purposeNote} onChange={(e) => setForm({ ...form, purposeNote: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Agreed fee" required>
            <div className="flex gap-2">
              <Select className="w-24 shrink-0" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as "USD" | "ZiG" })}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </Select>
              <Input inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0" />
            </div>
          </Field>
          <Field label="Assign to" hint="Open jobs in brackets. You can assign later.">
            <Select value={form.valuerId} onChange={(e) => setForm({ ...form, valuerId: e.target.value })}>
              <option value="">Not yet assigned</option>
              {valuers?.map((v) => (
                <option key={v.userId} value={v.userId}>
                  {v.name} ({v.openJobs} open)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date received" required>
            <Input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
          </Field>
          <Field label="Date due" required>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Textarea rows={2} className="min-h-[64px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Access arrangements, keys, who to call on site" />
          </Field>
        </section>
      </div>
    </Modal>
  );
}
