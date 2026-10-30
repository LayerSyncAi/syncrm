"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Building2, Pencil, Plus, Receipt } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Facts, FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { LeaseStatusBadge, UnitStatusBadge } from "@/components/stay/badges";
import { PersonFields, personArg, personFormFrom, type PersonForm } from "@/components/stay/person-fields";
import { useRecordPayment } from "@/components/stay/record-payment";
import { PortalAccess } from "@/components/stay/portal-access";
import { StayDocuments } from "@/components/stay/ops/stay-documents";
import { UnitInspections } from "@/components/stay/ops/unit-inspections";
import { UnitMaintenance } from "@/components/stay/ops/unit-maintenance";
import { dateLabel, money, parseAmount, todayLocal } from "@/lib/stay/format";

type Detail = NonNullable<ReturnType<typeof useDetail>>;
function useDetail(id: Id<"stayProperties">) {
  return useQuery(api.stay.properties.get, { id });
}

export default function StayPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const p = useDetail(id as Id<"stayProperties">);
  const { open: recordPayment } = useRecordPayment();
  const [modal, setModal] = React.useState<null | "landlord" | "agreement" | "unit" | "expense">(null);
  const [openUnit, setOpenUnit] = React.useState<Id<"stayUnits"> | null>(null);
  const [editUnit, setEditUnit] = React.useState<Detail["units"][number] | null>(null);

  if (p === undefined) return <ListSkeleton />;
  if (p === null) {
    return (
      <EmptyState
        icon={Building2}
        title="Property not found"
        description="It may have been removed, or it is assigned to another manager."
        action={
          <Link href="/app/stay/properties">
            <Button variant="secondary">Back to properties</Button>
          </Link>
        }
      />
    );
  }

  const close = () => {
    setModal(null);
    setEditUnit(null);
  };

  return (
    <div className="space-y-6">
      <StayPageHeader
        title={p.name}
        description={p.address}
        back={{ href: "/app/stay/properties", label: "Properties" }}
        actions={
          p.canEdit ? (
            <Button variant="secondary" onClick={() => setModal("agreement")} className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : undefined
        }
      />

      <Section title="Management agreement">
        <Facts
          items={[
            { label: "Use", value: p.kind === "commercial" ? "Commercial" : "Residential" },
            { label: "Management fee", value: `${p.managementFeePct}% of rent collected` },
            { label: "Property manager", value: p.managerName ?? "Unassigned" },
            { label: "Repairs needing landlord approval", value: p.repairApprovalThreshold !== null ? `Over ${p.repairApprovalThreshold}` : "None" },
            { label: "Status", value: p.isActive ? "Managed" : "No longer managed" },
            { label: "Notes", value: p.notes },
          ]}
        />
      </Section>

      <Section
        title="Landlord"
        actions={
          p.canEdit && p.landlord ? (
            <Button size="sm" variant="secondary" onClick={() => setModal("landlord")}>
              <Pencil className="h-4 w-4" />
              Edit details
            </Button>
          ) : undefined
        }
      >
        {p.landlord ? (
          <>
          <div className="mb-3">
            <PortalAccess contactId={p.landlord._id} kind="landlord" canManage={p.canEdit} />
          </div>
          <Facts
            items={[
              { label: "Name", value: p.landlord.name },
              { label: "Phone", value: p.landlord.phone ? <a href={`tel:${p.landlord.phone}`}>{p.landlord.phone}</a> : "" },
              { label: "Email", value: p.landlord.email ? <a href={`mailto:${p.landlord.email}`}>{p.landlord.email}</a> : "" },
              { label: p.landlord.entityKind === "company" ? "Company number" : "ID number", value: p.landlord.idNumber },
              {
                label: "Bank",
                value: [p.landlord.bankDetails.bankName, p.landlord.bankDetails.branch].filter(Boolean).join(", "),
              },
              {
                label: "Account",
                value: [p.landlord.bankDetails.accountName, p.landlord.bankDetails.accountNumber].filter(Boolean).join(", "),
              },
            ]}
          />
          </>
        ) : (
          <p className="text-sm text-text-muted">Landlord record not found.</p>
        )}
      </Section>

      <Section
        title={`Units (${p.units.length})`}
        actions={
          p.canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setModal("unit")}>
              <Plus className="h-4 w-4" />
              Add unit
            </Button>
          ) : undefined
        }
      >
        <ul className="divide-y divide-border">
          {p.units.map((u) => (
            <li key={u._id} className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.label}</span>
                  <UnitStatusBadge status={u.status} />
                  {u.bedrooms !== null && <span className="text-xs text-text-muted">{u.bedrooms} bed</span>}
                </div>
                {u.lease ? (
                  <p className="mt-1 text-sm">
                    <Link href={`/app/stay/leases/${u.lease._id}`} className="font-medium text-primary-ink hover:underline">
                      {u.lease.tenantName}
                    </Link>
                    <span className="text-text-muted">
                      {" "}
                      {money(u.lease.rentAmount, u.lease.currency)} a month, {dateLabel(u.lease.startDate)} to {dateLabel(u.lease.endDate)}
                      {u.lease.noticeGivenOn ? `, notice given ${dateLabel(u.lease.noticeGivenOn)}` : ""}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-text-muted">No current lease</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {u.lease ? (
                  <Button size="sm" onClick={() => recordPayment(u.lease!._id)} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                    <Receipt className="h-4 w-4" />
                    Record payment
                  </Button>
                ) : (
                  p.canEdit && (
                    <Link href={`/app/stay/leases/new?unitId=${u._id}`}>
                      <Button size="sm">Let this unit</Button>
                    </Link>
                  )
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpenUnit(openUnit === u._id ? null : u._id)}
                  aria-expanded={openUnit === u._id}
                >
                  {openUnit === u._id ? "Hide repairs and inspections" : "Repairs and inspections"}
                </Button>
                {p.canEdit && (
                  <Button size="sm" variant="secondary" onClick={() => setEditUnit(u)} aria-label={`Edit ${u.label}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {openUnit === u._id && (
                <div className="grid w-full gap-4 sm:basis-full lg:grid-cols-2">
                  <UnitMaintenance unitId={u._id} />
                  <UnitInspections unitId={u._id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {p.pastLeases.length > 0 && (
        <Section title="Past leases">
          <ul className="divide-y divide-border text-sm">
            {p.pastLeases.map((l) => (
              <li key={l._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/app/stay/leases/${l._id}`} className="hover:underline">
                  <span className="font-medium">{l.tenantName}</span>
                  <span className="text-text-muted">
                    {" "}
                    {l.unitLabel}, {dateLabel(l.startDate)} to {dateLabel(l.endDate)}
                  </span>
                </Link>
                <LeaseStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Expenses"
        actions={
          p.canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setModal("expense")}>
              <Plus className="h-4 w-4" />
              Add expense
            </Button>
          ) : undefined
        }
      >
        {p.expenses.length === 0 ? (
          <p className="text-sm text-text-muted">No expenses recorded. Repair costs from maintenance requests appear here too.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {p.expenses.map((e) => (
              <li key={e._id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{e.description}</p>
                  <p className="text-xs text-text-muted">
                    {dateLabel(e.date)}
                    {e.supplier ? `, ${e.supplier}` : ""}
                    {e.fromMaintenance ? ", from a maintenance request" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p>{money(e.amount, e.currency)}</p>
                  {e.rechargeToLandlord ? (
                    <Badge variant="info" className="mt-1 px-2 py-0.5">
                      On landlord statement
                    </Badge>
                  ) : (
                    <span className="text-xs text-text-muted">Agency cost</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <StayDocuments stayPropertyId={p._id} />

      {modal === "landlord" && p.landlord && <LandlordModal landlord={p.landlord} onClose={close} />}
      {modal === "agreement" && <AgreementModal p={p} onClose={close} />}
      {modal === "unit" && <UnitModal stayPropertyId={p._id} onClose={close} />}
      {editUnit && <UnitModal stayPropertyId={p._id} unit={editUnit} onClose={close} />}
      {modal === "expense" && <ExpenseModal p={p} onClose={close} />}
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, label }: { onClose: () => void; onSave: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : label}
      </Button>
    </div>
  );
}

function useSave(onClose: () => void) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      animatedToast.success(success);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

function LandlordModal({ landlord, onClose }: { landlord: NonNullable<Detail["landlord"]>; onClose: () => void }) {
  const [form, setForm] = React.useState<PersonForm>(personFormFrom(landlord));
  const update = useMutation(api.stay.people.updatePerson);
  const { saving, error, setError, run } = useSave(onClose);
  return (
    <Modal
      open
      title={`Landlord: ${landlord.name}`}
      description="Changes apply to this contact everywhere in the Hub."
      onClose={onClose}
      footer={
        <ModalFooter
          onClose={onClose}
          saving={saving}
          label="Save landlord"
          onSave={() => {
            if (!form.name.trim()) return setError("Name is required.");
            run(() => update({ contactId: landlord._id, person: personArg(form, true) }), "Landlord updated");
          }}
        />
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <PersonFields role="landlord" value={form} onChange={setForm} excludeId={landlord._id} />
      </div>
    </Modal>
  );
}

function AgreementModal({ p, onClose }: { p: Detail; onClose: () => void }) {
  const [name, setName] = React.useState(p.name);
  const [address, setAddress] = React.useState(p.address);
  const [kind, setKind] = React.useState(p.kind);
  const [fee, setFee] = React.useState(String(p.managementFeePct));
  const [threshold, setThreshold] = React.useState(p.repairApprovalThreshold !== null ? String(p.repairApprovalThreshold) : "");
  const [managerUserId, setManagerUserId] = React.useState<string>(p.managerUserId ?? "");
  const [landlordId, setLandlordId] = React.useState<string>(p.landlord?._id ?? "");
  const [notes, setNotes] = React.useState(p.notes);
  const [isActive, setIsActive] = React.useState(p.isActive);
  const managers = useQuery(api.stay.properties.listManagers, p.canAssign ? {} : "skip");
  const landlords = useQuery(api.stay.people.landlordOptions, p.canAssign ? {} : "skip");
  const update = useMutation(api.stay.properties.update);
  const { saving, error, setError, run } = useSave(onClose);

  const save = () => {
    const pct = parseAmount(fee);
    if (!(pct >= 0 && pct <= 100)) return setError("Management fee must be between 0 and 100%.");
    const thr = threshold.trim() ? parseAmount(threshold) : null;
    if (thr !== null && !(thr >= 0)) return setError("The approval amount must be a number.");
    if (!name.trim() || !address.trim()) return setError("Name and address are required.");
    run(
      () =>
        update({
          id: p._id,
          name: name.trim(),
          address: address.trim(),
          kind,
          managementFeePct: pct,
          repairApprovalThreshold: thr,
          notes,
          isActive,
          ...(p.canAssign
            ? {
                managerUserId: (managerUserId || null) as Id<"users"> | null,
                landlordContactId: landlordId ? (landlordId as Id<"contacts">) : undefined,
              }
            : {}),
        }),
      "Property updated"
    );
  };

  return (
    <Modal open title="Edit property" onClose={onClose} footer={<ModalFooter onClose={onClose} onSave={save} saving={saving} label="Save changes" />}>
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Use</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Management fee (%)</Label>
            <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Repairs above this need landlord approval</Label>
            <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Leave blank for none" />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
              <option value="1">Managed</option>
              <option value="0">No longer managed</option>
            </Select>
          </div>
          {p.canAssign && (
            <>
              <div className="space-y-2">
                <Label>Property manager</Label>
                <Select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {(managers ?? []).map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Landlord</Label>
                <Select value={landlordId} onChange={(e) => setLandlordId(e.target.value)}>
                  {p.landlord && !landlords?.some((l) => l._id === p.landlord!._id) && <option value={p.landlord._id}>{p.landlord.name}</option>}
                  {(landlords ?? []).map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} className="min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {p.canAssign && <p className="text-xs text-text-muted">Changing the manager or landlord also updates every lease on this property.</p>}
      </div>
    </Modal>
  );
}

function UnitModal({ stayPropertyId, unit, onClose }: { stayPropertyId: Id<"stayProperties">; unit?: Detail["units"][number]; onClose: () => void }) {
  const [label, setLabel] = React.useState(unit?.label ?? "");
  const [bedrooms, setBedrooms] = React.useState(unit?.bedrooms !== null && unit?.bedrooms !== undefined ? String(unit.bedrooms) : "");
  const [interval, setIntervalMonths] = React.useState(
    unit?.inspectionIntervalMonths ? String(unit.inspectionIntervalMonths) : ""
  );
  const add = useMutation(api.stay.properties.addUnit);
  const update = useMutation(api.stay.properties.updateUnit);
  const setUnitInterval = useMutation(api.stay.inspections.setUnitInterval);
  const { saving, error, setError, run } = useSave(onClose);

  const save = () => {
    if (!label.trim()) return setError("Enter the unit name.");
    const beds = bedrooms.trim() ? parseInt(bedrooms, 10) : undefined;
    if (beds !== undefined && (isNaN(beds) || beds < 0)) return setError("Bedrooms must be a number.");
    const months = interval.trim() ? parseInt(interval, 10) : null;
    if (months !== null && (isNaN(months) || months < 1 || months > 60)) {
      return setError("Routine inspections: use 1 to 60 months, or leave blank for none.");
    }
    run(async () => {
      const unitId = unit
        ? (await update({ unitId: unit._id, label: label.trim(), bedrooms: beds ?? null }), unit._id)
        : await add({ stayPropertyId, label: label.trim(), bedrooms: beds });
      // The interval also sets when the next routine inspection falls due.
      if (months !== (unit?.inspectionIntervalMonths ?? null)) {
        await setUnitInterval({ unitId, months });
      }
    }, unit ? "Unit updated" : "Unit added");
  };

  return (
    <Modal
      open
      title={unit ? `Edit ${unit.label}` : "Add unit"}
      onClose={onClose}
      footer={<ModalFooter onClose={onClose} onSave={save} saving={saving} label={unit ? "Save unit" : "Add unit"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Unit name</Label>
            <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Flat 3" />
          </div>
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <Input inputMode="numeric" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Routine inspection every (months)</Label>
            <Input inputMode="numeric" value={interval} onChange={(e) => setIntervalMonths(e.target.value)} placeholder="Blank for none, e.g. 6" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ExpenseModal({ p, onClose }: { p: Detail; onClose: () => void }) {
  const firstCurrency = p.units.find((u) => u.lease)?.lease?.currency ?? "USD";
  const [date, setDate] = React.useState(todayLocal());
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<"USD" | "ZiG">(firstCurrency);
  const [supplier, setSupplier] = React.useState("");
  const [unitId, setUnitId] = React.useState<string>("");
  const [recharge, setRecharge] = React.useState(true);
  const create = useMutation(api.stay.expenses.create);
  const { saving, error, setError, run } = useSave(onClose);

  const save = () => {
    const value = parseAmount(amount);
    if (!description.trim()) return setError("Describe the expense.");
    if (!(value > 0)) return setError("Enter the amount.");
    run(
      () =>
        create({
          stayPropertyId: p._id,
          unitId: unitId ? (unitId as Id<"stayUnits">) : undefined,
          date,
          description: description.trim(),
          amount: value,
          currency,
          supplier: supplier.trim() || undefined,
          rechargeToLandlord: recharge,
        }),
      "Expense recorded"
    );
  };

  return (
    <Modal open title="Add expense" onClose={onClose} footer={<ModalFooter onClose={onClose} onSave={save} saving={saving} label="Save expense" />}>
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Replaced geyser element" />
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <div className="flex gap-2">
              <Select className="w-24" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "ZiG")}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </Select>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Whole property</option>
              {p.units.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={recharge} onChange={(e) => setRecharge(e.target.checked)} />
          Deduct from the landlord&apos;s statement
        </label>
      </div>
    </Modal>
  );
}
