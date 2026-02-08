"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

interface PropertyResult {
  _id: Id<"properties">;
  title: string;
  type: string;
  listingType: "rent" | "sale";
  price: number;
  currency: string;
  location: string;
  bedrooms?: number;
  bathrooms?: number;
  area: number;
  status: string;
}

const createEmptyFieldState = (value: string = ""): FieldState => ({
  value,
  touched: false,
  error: undefined,
});

const formatPrice = (price: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
};

export default function NewLeadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Pre-fill from URL params (property-first flow)
  const prefillPropertyId = searchParams.get("propertyId");
  const prefillInterestType = searchParams.get("interestType");

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
  const [interestType, setInterestType] = useState<InterestType>(
    prefillInterestType === "buy" || prefillInterestType === "rent"
      ? prefillInterestType
      : "rent"
  );
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

  // Property attachment state (inline multi-select)
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<Id<"properties">>>(
    () => {
      const initial = new Set<Id<"properties">>();
      if (prefillPropertyId) {
        initial.add(prefillPropertyId as Id<"properties">);
      }
      return initial;
    }
  );
  const [propertySearchInput, setPropertySearchInput] = useState("");
  const [debouncedPropertySearch, setDebouncedPropertySearch] = useState("");
  const [showPropertySection, setShowPropertySection] = useState(!!prefillPropertyId);

  // Debounce contact search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContactSearch(contactSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearchInput]);

  // Debounce property search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPropertySearch(propertySearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [propertySearchInput]);

  // Queries
  const stages = useQuery(api.stages.list);
  const locations = useQuery(api.locations.list);
  const users = useQuery(api.users.listForAssignment);
  const contacts = useQuery(
    api.contacts.list,
    user ? { q: debouncedContactSearch || undefined } : "skip"
  );

  // Property search query - only active when section is open
  const listingTypeForSearch = interestType === "buy" ? "sale" as const : "rent" as const;
  const propertyResults = useQuery(
    api.properties.search,
    showPropertySection && user
      ? {
          q: debouncedPropertySearch || undefined,
          listingType: listingTypeForSearch,
          limit: 20,
        }
      : "skip"
  );

  // Get selected contact details
  const selectedContact = contacts?.find((c: Contact) => c._id === selectedContactId);

  // Mutations
  const createLeadWithProperties = useMutation(api.leads.createWithProperties);
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

  // Filter property results to exclude already-selected ones (for the search list)
  const availableProperties = useMemo(() => {
    if (!propertyResults) return [];
    return propertyResults;
  }, [propertyResults]);

  // Separate: properties selected but not in current search results (show them as tags)
  const selectedPropertyList = useMemo(() => {
    if (!propertyResults) return [];
    return propertyResults.filter((p: PropertyResult) => selectedPropertyIds.has(p._id));
  }, [propertyResults, selectedPropertyIds]);

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
    if (!value.trim()) return undefined;
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

  const toggleProperty = (propertyId: Id<"properties">) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const removeProperty = (propertyId: Id<"properties">) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      next.delete(propertyId);
      return next;
    });
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

      setSelectedContactId(newContactId);
      setContactSearchInput(newContactName.value.trim());
      setShowNewContactModal(false);
      setContactError(undefined);

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
      const leadId = await createLeadWithProperties({
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
        propertyIds: selectedPropertyIds.size > 0
          ? Array.from(selectedPropertyIds)
          : undefined,
      });
      router.push(`/app/leads/${leadId}`);
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

  const selectedStageData = stages?.find((s) => s._id === selectedStage);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create Lead</h2>
        <p className="text-sm text-text-muted">
          Quick capture for new opportunities. Attach properties now or later.
        </p>
      </div>

      {formError && (
        <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Left column: Lead details */}
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
                                  {contact.email && ` \u00B7 ${contact.email}`}
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

              {/* Selected Contact Info */}
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
                          &times;
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
          </Card>

          {/* Right column: Property attachment */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Attach Properties</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Optional. You can also attach later.
                  </p>
                </div>
                {!showPropertySection && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    onClick={() => setShowPropertySection(true)}
                  >
                    + Add
                  </Button>
                )}
              </div>

              {/* Selected properties as dismissable tags */}
              {selectedPropertyIds.size > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-text-muted font-medium">
                    {selectedPropertyIds.size} propert{selectedPropertyIds.size !== 1 ? "ies" : "y"} selected
                  </p>
                  <div className="space-y-2">
                    {selectedPropertyList.map((property: PropertyResult) => (
                      <div
                        key={property._id}
                        className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{property.title}</p>
                          <p className="text-xs text-text-muted">
                            {formatPrice(property.price, property.currency)} &middot; {property.location}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProperty(property._id)}
                          className="ml-2 shrink-0 rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          aria-label={`Remove ${property.title}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                    {/* Show count of properties not in current search results */}
                    {selectedPropertyIds.size > selectedPropertyList.length && selectedPropertyList.length > 0 && (
                      <p className="text-xs text-text-muted">
                        +{selectedPropertyIds.size - selectedPropertyList.length} more not shown in current search
                      </p>
                    )}
                  </div>
                </div>
              )}

              {showPropertySection && (
                <div className="space-y-3">
                  <Input
                    placeholder="Search by title or location..."
                    value={propertySearchInput}
                    onChange={(e) => setPropertySearchInput(e.target.value)}
                  />
                  <p className="text-xs text-text-muted">
                    Showing {interestType === "buy" ? "sale" : "rental"} properties (matching interest type)
                  </p>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {!propertyResults ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                      </div>
                    ) : availableProperties.length === 0 ? (
                      <p className="text-sm text-text-muted py-4 text-center">
                        {debouncedPropertySearch
                          ? "No properties match your search."
                          : "No available properties found."}
                      </p>
                    ) : (
                      availableProperties.map((property: PropertyResult) => {
                        const isSelected = selectedPropertyIds.has(property._id);
                        return (
                          <label
                            key={property._id}
                            className={`flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                              isSelected
                                ? "border-primary/40 bg-primary/5"
                                : "border-border-strong hover:bg-card-bg/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleProperty(property._id)}
                              className="rounded border-border shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{property.title}</p>
                              <p className="text-xs text-text-muted">
                                {formatPrice(property.price, property.currency)}
                                {" \u00B7 "}
                                {property.location}
                                {property.bedrooms !== undefined && ` \u00B7 ${property.bedrooms} bed`}
                                {" \u00B7 "}
                                {property.area} m\u00B2
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                property.status === "available"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {property.status === "available" ? "Available" : "Under Offer"}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Save CTA */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting
                  ? "Saving..."
                  : selectedPropertyIds.size > 0
                    ? `Save lead + ${selectedPropertyIds.size} propert${selectedPropertyIds.size !== 1 ? "ies" : "y"}`
                    : "Save lead"}
              </Button>
            </div>
          </div>
        </div>
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
