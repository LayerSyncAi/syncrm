"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useRequireAuth } from "@/hooks/useAuth";

type Source =
  | "walk_in"
  | "referral"
  | "facebook"
  | "whatsapp"
  | "website"
  | "property_portal"
  | "other";

type InterestType = "rent" | "buy";

interface FieldState {
  value: string;
  touched: boolean;
  error?: string;
}

interface Contact {
  _id: Id<"contacts">;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  ownerNames: string[];
}

const createEmptyFieldState = (value: string = ""): FieldState => ({
  value,
  touched: false,
  error: undefined,
});

export default function NewLeadPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Contact selection state
  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | "">("");
  const [contactSearchInput, setContactSearchInput] = useState("");
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactError, setContactError] = useState<string | undefined>();

  // New contact modal state
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState<FieldState>(createEmptyFieldState());
  const [newContactPhone, setNewContactPhone] = useState<FieldState>(createEmptyFieldState());
  const [newContactEmail, setNewContactEmail] = useState<FieldState>(createEmptyFieldState());
  const [newContactCompany, setNewContactCompany] = useState("");
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [newContactError, setNewContactError] = useState("");

  // Lead form state
  const [source, setSource] = useState<Source>("walk_in");
  const [interestType, setInterestType] = useState<InterestType>("rent");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetMinTouched, setBudgetMinTouched] = useState(false);
  const [budgetMaxTouched, setBudgetMaxTouched] = useState(false);
  const [budgetError, setBudgetError] = useState<string | undefined>();
  const [preferredAreas, setPreferredAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // New location state
  const [newLocation, setNewLocation] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  // Debounce contact search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContactSearch(contactSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearchInput]);

  // Queries
  const stages = useQuery(api.stages.list);
  const locations = useQuery(api.locations.list);
  const users = useQuery(api.users.listForAssignment);
  const contacts = useQuery(
    api.contacts.list,
    user ? { q: debouncedContactSearch || undefined } : "skip"
  );

  // Get selected contact details
  const selectedContact = contacts?.find((c: Contact) => c._id === selectedContactId);

  // Mutations
  const createLead = useMutation(api.leads.create);
  const createContact = useMutation(api.contacts.create);
  const createLocation = useMutation(api.locations.create);
  const seedLocations = useMutation(api.locations.seedDefaultsIfEmpty);

  // Seed locations on first load
  useEffect(() => {
    if (user && locations !== undefined && locations.length === 0) {
      seedLocations();
    }
  }, [user, locations, seedLocations]);

  // Set default stage when stages load
  useEffect(() => {
    if (stages && stages.length > 0 && !selectedStage) {
      const firstStage = stages.find((s) => s.order === 1) || stages[0];
      setSelectedStage(firstStage._id);
    }
  }, [stages, selectedStage]);

  // Validate budget range
  useEffect(() => {
    if (budgetMin && budgetMax) {
      const min = parseFloat(budgetMin);
      const max = parseFloat(budgetMax);
      if (!isNaN(min) && !isNaN(max) && min > max) {
        setBudgetError("Minimum budget cannot exceed maximum budget");
      } else {
        setBudgetError(undefined);
      }
    } else {
      setBudgetError(undefined);
    }
  }, [budgetMin, budgetMax]);

  // Validation functions for new contact
  const validateName = (value: string): string | undefined => {
    if (!value.trim()) return "Name is required";
    if (value.trim().length < 2) return "Name must be at least 2 characters";
    return undefined;
  };

  const validatePhone = (value: string): string | undefined => {
    if (!value.trim()) return "Phone number is required";
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "Please enter a valid phone number";
    return undefined;
  };

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return undefined; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "Please enter a valid email address";
    return undefined;
  };

  const handleNewContactFieldChange = (
    field: "name" | "phone" | "email",
    value: string,
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "name" ? setNewContactName : field === "phone" ? setNewContactPhone : setNewContactEmail;
    setter((prev) => ({
      value,
      touched: prev.touched,
      error: prev.touched ? validator(value) : undefined,
    }));
  };

  const handleNewContactFieldBlur = (
    field: "name" | "phone" | "email",
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "name" ? setNewContactName : field === "phone" ? setNewContactPhone : setNewContactEmail;
    const state = field === "name" ? newContactName : field === "phone" ? newContactPhone : newContactEmail;
    setter({
      ...state,
      touched: true,
      error: validator(state.value),
    });
  };

  const handleAddArea = (area: string) => {
    const trimmed = area.trim();
    if (trimmed && !preferredAreas.includes(trimmed)) {
      setPreferredAreas([...preferredAreas, trimmed]);
    }
  };

  const handleRemoveArea = (area: string) => {
    setPreferredAreas(preferredAreas.filter((a) => a !== area));
  };

  const handleAddNewLocation = async () => {
    if (!newLocation.trim()) return;
    setIsAddingLocation(true);
    try {
      await createLocation({ name: newLocation.trim() });
      handleAddArea(newLocation.trim());
      setNewLocation("");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add location";
      setFormError(errorMessage);
    } finally {
      setIsAddingLocation(false);
    }
  };

  const validateNewContactForm = (): boolean => {
    const nameError = validateName(newContactName.value);
    const phoneError = validatePhone(newContactPhone.value);
    const emailError = validateEmail(newContactEmail.value);

    setNewContactName((prev) => ({ ...prev, touched: true, error: nameError }));
    setNewContactPhone((prev) => ({ ...prev, touched: true, error: phoneError }));
    setNewContactEmail((prev) => ({ ...prev, touched: true, error: emailError }));

    return !nameError && !phoneError && !emailError;
  };

  const handleCreateNewContact = async () => {
    if (!validateNewContactForm()) return;

    setIsCreatingContact(true);
    setNewContactError("");
    try {
      const newContactId = await createContact({
        name: newContactName.value.trim(),
        phone: newContactPhone.value.trim(),
        email: newContactEmail.value.trim() || undefined,
        company: newContactCompany.trim() || undefined,
      });

      // Select the newly created contact
      setSelectedContactId(newContactId);
      setContactSearchInput(newContactName.value.trim());
      setShowNewContactModal(false);
      setContactError(undefined);

      // Reset new contact form
      setNewContactName(createEmptyFieldState());
      setNewContactPhone(createEmptyFieldState());
      setNewContactEmail(createEmptyFieldState());
      setNewContactCompany("");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create contact";
      setNewContactError(errorMessage);
    } finally {
      setIsCreatingContact(false);
    }
  };

  const validateForm = (): boolean => {
    // Contact is required
    if (!selectedContactId) {
      setContactError("Please select a contact");
      return false;
    }
    setContactError(undefined);

    if (budgetError) {
      return false;
    }

    if (!selectedStage) {
      setFormError("Please select a stage");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createLead({
        contactId: selectedContactId as Id<"contacts">,
        source,
        interestType,
        budgetCurrency: budgetCurrency || undefined,
        budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
        budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
        preferredAreas,
        notes: notes.trim(),
        stageId: selectedStage as Id<"pipelineStages">,
        ownerUserId:
          isAdmin && selectedOwner
            ? (selectedOwner as Id<"users">)
            : undefined,
      });
      router.push("/app/leads");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create lead";
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContactId(contact._id);
    setContactSearchInput(contact.name);
    setShowContactDropdown(false);
    setContactError(undefined);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Get stage description for selected stage
  const selectedStageData = stages?.find((s) => s._id === selectedStage);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create Lead</h2>
        <p className="text-sm text-text-muted">
          Quick capture for new opportunities.
        </p>
      </div>

      {formError && (
        <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact Selection */}
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-1">
                Contact <span className="text-danger">*</span>
              </Label>
              {contactError && (
                <p className="text-xs text-danger">{contactError}</p>
              )}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search contacts by name, phone, or email..."
                      value={contactSearchInput}
                      onChange={(e) => {
                        setContactSearchInput(e.target.value);
                        setShowContactDropdown(true);
                        if (selectedContactId) {
                          setSelectedContactId("");
                        }
                      }}
                      onFocus={() => setShowContactDropdown(true)}
                      error={!!contactError}
                    />
                    {/* Dropdown */}
                    {showContactDropdown && contacts && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-border-strong bg-card-bg shadow-lg max-h-60 overflow-auto">
                        {contacts.length === 0 ? (
                          <div className="p-3 text-sm text-text-muted">
                            {debouncedContactSearch
                              ? "No contacts found. Create a new one?"
                              : "Start typing to search contacts..."}
                          </div>
                        ) : (
                          contacts.map((contact: Contact) => (
                            <button
                              key={contact._id}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors flex flex-col"
                              onClick={() => handleSelectContact(contact)}
                            >
                              <span className="font-medium">{contact.name}</span>
                              <span className="text-sm text-text-muted">
                                {contact.phone}
                                {contact.email && ` • ${contact.email}`}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowContactDropdown(false);
                      setShowNewContactModal(true);
                    }}
                  >
                    + New Contact
                  </Button>
                </div>
              </div>
            </div>

            {/* Selected Contact Info (Read-only) */}
            {selectedContact && (
              <div className="md:col-span-2 rounded-lg bg-gray-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-muted">Selected Contact</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      setSelectedContactId("");
                      setContactSearchInput("");
                    }}
                  >
                    Change
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs text-text-muted">Name</Label>
                    <p className="font-medium">{selectedContact.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-text-muted">Phone</Label>
                    <p>{selectedContact.phone}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-text-muted">Email</Label>
                    <p>{selectedContact.email || "-"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Interest Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Interest type <span className="text-danger">*</span>
              </Label>
              <Select
                value={interestType}
                onChange={(e) => setInterestType(e.target.value as InterestType)}
              >
                <option value="rent">Rent</option>
                <option value="buy">Buy</option>
              </Select>
            </div>

            {/* Source */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Source <span className="text-danger">*</span>
              </Label>
              <Select
                value={source}
                onChange={(e) => setSource(e.target.value as Source)}
              >
                <option value="walk_in">Walk-in</option>
                <option value="referral">Referral</option>
                <option value="facebook">Facebook</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="website">Website</option>
                <option value="property_portal">Property portal</option>
                <option value="other">Other</option>
              </Select>
            </div>

            {/* Budget Min */}
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <CurrencyInput
                value={budgetMin}
                onChange={setBudgetMin}
                onBlur={() => setBudgetMinTouched(true)}
                currency={budgetCurrency}
                onCurrencyChange={setBudgetCurrency}
                placeholder="0.00"
                touched={budgetMinTouched}
                error={budgetError}
              />
            </div>

            {/* Budget Max */}
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <CurrencyInput
                value={budgetMax}
                onChange={setBudgetMax}
                onBlur={() => setBudgetMaxTouched(true)}
                currency={budgetCurrency}
                onCurrencyChange={setBudgetCurrency}
                placeholder="0.00"
                touched={budgetMaxTouched}
              />
            </div>

            {/* Initial Stage */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Initial Stage <span className="text-danger">*</span>
              </Label>
              <Select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
              >
                {stages?.map((stage) => (
                  <option key={stage._id} value={stage._id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
              {selectedStageData?.description && (
                <p className="text-xs text-text-muted mt-1">
                  {selectedStageData.description}
                </p>
              )}
            </div>

            {/* Assign to (Admin only) */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                >
                  <option value="">Myself</option>
                  {users?.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Preferred Areas */}
            <div className="space-y-2 md:col-span-2">
              <Label>Preferred Areas</Label>
              <div className="flex gap-2">
                <Select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddArea(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="flex-1"
                >
                  <option value="">Select a location...</option>
                  {locations?.map((loc) => (
                    <option key={loc._id} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2 mt-2">
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
                <div className="flex flex-wrap gap-2 mt-2">
                  {preferredAreas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                    >
                      {area}
                      <button
                        type="button"
                        onClick={() => handleRemoveArea(area)}
                        className="hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this lead..."
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save lead"}
            </Button>
          </div>
        </Card>
      </form>

      {/* New Contact Modal */}
      <Modal
        open={showNewContactModal}
        title="Create New Contact"
        description="Add a new contact to use for this lead. This contact will also be available in your contacts list."
        onClose={() => setShowNewContactModal(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowNewContactModal(false)}
              disabled={isCreatingContact}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateNewContact} disabled={isCreatingContact}>
              {isCreatingContact ? "Creating..." : "Create Contact"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {newContactError && (
            <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
              {newContactError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Name <span className="text-danger">*</span>
              </Label>
              {newContactName.touched && newContactName.error && (
                <p className="text-xs text-danger">{newContactName.error}</p>
              )}
              <Input
                value={newContactName.value}
                onChange={(e) => handleNewContactFieldChange("name", e.target.value, validateName)}
                onBlur={() => handleNewContactFieldBlur("name", validateName)}
                placeholder="John Doe"
                error={newContactName.touched && !!newContactName.error}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Phone <span className="text-danger">*</span>
              </Label>
              {newContactPhone.touched && newContactPhone.error && (
                <p className="text-xs text-danger">{newContactPhone.error}</p>
              )}
              <Input
                value={newContactPhone.value}
                onChange={(e) => handleNewContactFieldChange("phone", e.target.value, validatePhone)}
                onBlur={() => handleNewContactFieldBlur("phone", validatePhone)}
                placeholder="+263 77 123 4567"
                error={newContactPhone.touched && !!newContactPhone.error}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email</Label>
              {newContactEmail.touched && newContactEmail.error && (
                <p className="text-xs text-danger">{newContactEmail.error}</p>
              )}
              <Input
                type="email"
                value={newContactEmail.value}
                onChange={(e) => handleNewContactFieldChange("email", e.target.value, validateEmail)}
                onBlur={() => handleNewContactFieldBlur("email", validateEmail)}
                placeholder="john@example.com"
                error={newContactEmail.touched && !!newContactEmail.error}
              />
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={newContactCompany}
                onChange={(e) => setNewContactCompany(e.target.value)}
                placeholder="Company name"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Click outside to close dropdown */}
      {showContactDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowContactDropdown(false)}
        />
      )}
    </div>
  );
}
