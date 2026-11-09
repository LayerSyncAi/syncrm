"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { canonicalizeArea } from "../../../convex/lib/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";
import { LEAD_SOURCE_OPTIONS, type LeadSource } from "@/lib/lead-sources";
import { validateName, validatePhone, validateEmail } from "@/lib/validators";
import { leadToasts, locationToasts } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";

type InterestType = "rent" | "buy";

export interface EditableLead {
  _id: Id<"leads">;
  fullName: string;
  phone?: string;
  email?: string;
  source: string;
  interestType: InterestType;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas: string[];
  ownerUserId: Id<"users">;
  isUnassigned?: boolean;
  interestNeedsReview?: boolean;
}

interface LeadEditModalProps {
  open: boolean;
  lead: EditableLead;
  /** Who is editing: admins may assign anyone, agents may take an unassigned lead. */
  currentUser: { _id: Id<"users">; role: "admin" | "agent" };
  onClose: () => void;
}

const UNASSIGNED = "";

/**
 * Edit a lead's details after creation: name, phone, email, interest, source,
 * budget, preferred areas and assigned agent. Name / phone / email also update
 * the linked contact (and any other leads for that contact) server-side.
 */
export function LeadEditModal({ open, lead, currentUser, onClose }: LeadEditModalProps) {
  const updateDetails = useMutation(api.leads.updateDetails);
  const locations = useQuery(api.locations.list, open ? {} : "skip");
  const isAdmin = currentUser.role === "admin";
  const agents = useQuery(api.users.listForAssignment, open ? {} : "skip");
  const currentOwner = lead.isUnassigned ? UNASSIGNED : (lead.ownerUserId as string);
  const [ownerId, setOwnerId] = useState<string>(currentOwner);
  const createLocation = useMutation(api.locations.create);

  const [fullName, setFullName] = useState(lead.fullName);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [interestType, setInterestType] = useState<InterestType>(lead.interestType);
  const [source, setSource] = useState<LeadSource>(lead.source as LeadSource);
  const [budgetCurrency, setBudgetCurrency] = useState(lead.budgetCurrency || "USD");
  const [budgetMin, setBudgetMin] = useState(lead.budgetMin !== undefined ? String(lead.budgetMin) : "");
  const [budgetMax, setBudgetMax] = useState(lead.budgetMax !== undefined ? String(lead.budgetMax) : "");
  const [preferredAreas, setPreferredAreas] = useState<string[]>(lead.preferredAreas);
  const [newLocation, setNewLocation] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false, email: false });
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed the form each time the modal opens so stale edits never linger.
  useEffect(() => {
    if (!open) return;
    setFullName(lead.fullName);
    setPhone(lead.phone ?? "");
    setEmail(lead.email ?? "");
    setInterestType(lead.interestType);
    setSource(lead.source as LeadSource);
    setBudgetCurrency(lead.budgetCurrency || "USD");
    setBudgetMin(lead.budgetMin !== undefined ? String(lead.budgetMin) : "");
    setBudgetMax(lead.budgetMax !== undefined ? String(lead.budgetMax) : "");
    setPreferredAreas(lead.preferredAreas);
    setOwnerId(lead.isUnassigned ? UNASSIGNED : (lead.ownerUserId as string));
    setNewLocation("");
    setTouched({ name: false, phone: false, email: false });
    setFormError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead._id]);

  const nameError = validateName(fullName);
  const phoneError = validatePhone(phone);
  const emailError = validateEmail(email);
  const parseMoney = (raw: string): number | null => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const minValue = parseMoney(budgetMin);
  const maxValue = parseMoney(budgetMax);
  const budgetError =
    minValue !== null && maxValue !== null && minValue > maxValue
      ? "Minimum budget cannot exceed maximum budget"
      : undefined;
  const contactError =
    !phone.trim() && !email.trim() ? "Add a phone number or an email address" : undefined;

  const handleAddArea = (area: string) => {
    const canonical = canonicalizeArea(area);
    if (canonical && !preferredAreas.some((a) => a.toLowerCase() === canonical.toLowerCase())) {
      setPreferredAreas((prev) => [...prev, canonical]);
    }
  };

  const handleRemoveArea = (area: string) => {
    setPreferredAreas((prev) => prev.filter((a) => a !== area));
  };

  const handleAddNewLocation = async () => {
    if (!newLocation.trim()) return;
    setIsAddingLocation(true);
    // Record the area on the lead first; a failed suggestion save must never
    // block capturing the client's actual preference.
    handleAddArea(newLocation);
    try {
      await createLocation({ name: newLocation });
      locationToasts.created(newLocation);
    } catch (error) {
      const msg = getErrorMessage(error);
      if (!msg.toLowerCase().includes("already exists")) {
        locationToasts.createFailed(msg);
      }
    } finally {
      setNewLocation("");
      setIsAddingLocation(false);
    }
  };

  const handleSave = async () => {
    setTouched({ name: true, phone: true, email: true });
    setFormError("");
    if (nameError || phoneError || emailError || budgetError) {
      setFormError(nameError || phoneError || emailError || budgetError || "");
      return;
    }
    setIsSaving(true);
    try {
      await updateDetails({
        leadId: lead._id,
        fullName,
        phone,
        email,
        source,
        interestType,
        budgetCurrency,
        budgetMin: minValue,
        budgetMax: maxValue,
        preferredAreas,
        ...(ownerId !== currentOwner && ownerId !== UNASSIGNED
          ? { ownerUserId: ownerId as Id<"users"> }
          : {}),
      });
      leadToasts.detailsSaved();
      onClose();
    } catch (error) {
      const msg = getErrorMessage(error);
      setFormError(msg);
      leadToasts.detailsSaveFailed(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Edit lead details"
      description="Update what you've learned about this lead. Name, phone and email also update the linked contact."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {formError && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label className="flex items-center gap-1">
              Name <span className="text-danger">*</span>
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="Full name"
            />
            {touched.name && nameError && <p className="text-xs text-danger">{nameError}</p>}
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              placeholder="+263 77 000 0000"
              inputMode="tel"
            />
            {touched.phone && phoneError && <p className="text-xs text-danger">{phoneError}</p>}
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="name@example.com"
              inputMode="email"
            />
            {touched.email && emailError && <p className="text-xs text-danger">{emailError}</p>}
          </div>

          {contactError && (
            <p className="text-xs text-warning md:col-span-2">
              {contactError} — leads past the first stage must stay contactable.
            </p>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label>Assigned agent</Label>
            {isAdmin ? (
              <StaggeredDropDown
                value={ownerId}
                onChange={(val) => setOwnerId(val)}
                portal
                searchable
                placeholder="Unassigned"
                options={[
                  ...(lead.isUnassigned ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
                  ...(agents?.map((a) => ({ value: a._id as string, label: a.name })) ?? []),
                ]}
              />
            ) : lead.isUnassigned ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-text-muted">
                  {ownerId === currentUser._id ? "You (on save)" : "Unassigned"}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={() =>
                    setOwnerId(ownerId === currentUser._id ? UNASSIGNED : (currentUser._id as string))
                  }
                >
                  {ownerId === currentUser._id ? "Undo" : "Assign to me"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {agents?.find((a) => a._id === lead.ownerUserId)?.name ?? "—"}
                <span className="ml-2 text-xs">(only an admin can reassign)</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Interest type
              {lead.interestNeedsReview && (
                <span className="ml-2 text-xs font-normal text-warning">needs review — confirm on save</span>
              )}
            </Label>
            <StaggeredDropDown
              value={interestType}
              onChange={(val) => setInterestType(val as InterestType)}
              portal
              options={[
                { value: "rent", label: "Renting" },
                { value: "buy", label: "Buying" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <StaggeredDropDown
              value={source}
              onChange={(val) => setSource(val as LeadSource)}
              portal
              options={LEAD_SOURCE_OPTIONS}
            />
          </div>

          <div className="space-y-2">
            <Label>Budget Min</Label>
            <CurrencyInput
              value={budgetMin}
              onChange={setBudgetMin}
              currency={budgetCurrency}
              onCurrencyChange={setBudgetCurrency}
              placeholder="0.00"
              touched
              error={budgetError}
            />
          </div>

          <div className="space-y-2">
            <Label>Budget Max</Label>
            <CurrencyInput
              value={budgetMax}
              onChange={setBudgetMax}
              currency={budgetCurrency}
              onCurrencyChange={setBudgetCurrency}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Preferred Areas</Label>
            <StaggeredDropDown
              value=""
              onChange={(val) => {
                if (val) handleAddArea(val);
              }}
              portal
              placeholder="Select a location..."
              searchable
              options={[
                { value: "", label: "Select a location..." },
                ...(locations?.map((loc) => ({ value: loc.name, label: loc.name })) ?? []),
              ]}
            />
            <div className="flex gap-2">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Add new location..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddNewLocation();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddNewLocation}
                disabled={isAddingLocation || !newLocation.trim()}
              >
                {isAddingLocation ? "Adding..." : "Add"}
              </Button>
            </div>
            {preferredAreas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {preferredAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary-ink"
                  >
                    {area}
                    <button
                      type="button"
                      onClick={() => handleRemoveArea(area)}
                      className="hover:text-danger"
                      aria-label={`Remove ${area}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DuplicateWarning
          email={email.trim() || undefined}
          phone={phone.trim() || undefined}
          excludeLeadId={lead._id}
        />
      </div>
    </Modal>
  );
}
