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

export default function NewLeadPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Form state with validation
  const [fullName, setFullName] = useState<FieldState>({ value: "", touched: false });
  const [phone, setPhone] = useState<FieldState>({ value: "", touched: false });
  const [email, setEmail] = useState<FieldState>({ value: "", touched: false });
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

  // Queries
  const stages = useQuery(api.stages.list);
  // @ts-expect-error - locations API will be generated after convex codegen
  const locations = useQuery(api.locations?.list ?? (() => [])) as Array<{_id: string; name: string}> | undefined;
  const users = useQuery(api.users.listForAssignment);

  // Mutations
  const createLead = useMutation(api.leads.create);
  // @ts-expect-error - locations API will be generated after convex codegen
  const createLocation = useMutation(api.locations?.create ?? (() => {}));
  // @ts-expect-error - locations API will be generated after convex codegen
  const seedLocations = useMutation(api.locations?.seedDefaultsIfEmpty ?? (() => {}));

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

  // Validation functions
  const validateFullName = (value: string): string | undefined => {
    if (!value.trim()) return "Full name is required";
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

  const handleFieldChange = (
    field: "fullName" | "phone" | "email",
    value: string,
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "fullName" ? setFullName : field === "phone" ? setPhone : setEmail;
    setter((prev) => ({
      value,
      touched: prev.touched,
      error: prev.touched ? validator(value) : undefined,
    }));
  };

  const handleFieldBlur = (
    field: "fullName" | "phone" | "email",
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "fullName" ? setFullName : field === "phone" ? setPhone : setEmail;
    const state = field === "fullName" ? fullName : field === "phone" ? phone : email;
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

  const validateForm = (): boolean => {
    // Trigger validation on all required fields
    const fullNameError = validateFullName(fullName.value);
    const phoneError = validatePhone(phone.value);
    const emailError = validateEmail(email.value);

    setFullName({ ...fullName, touched: true, error: fullNameError });
    setPhone({ ...phone, touched: true, error: phoneError });
    setEmail({ ...email, touched: true, error: emailError });
    setBudgetMinTouched(true);
    setBudgetMaxTouched(true);

    if (fullNameError || phoneError || emailError || budgetError) {
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
        fullName: fullName.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim() || undefined,
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
            {/* Full Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Full Name <span className="text-danger">*</span>
              </Label>
              {fullName.touched && fullName.error && (
                <p className="text-xs text-danger">{fullName.error}</p>
              )}
              <Input
                value={fullName.value}
                onChange={(e) => handleFieldChange("fullName", e.target.value, validateFullName)}
                onBlur={() => handleFieldBlur("fullName", validateFullName)}
                placeholder="John Doe"
                error={fullName.touched && !!fullName.error}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Phone <span className="text-danger">*</span>
              </Label>
              {phone.touched && phone.error && (
                <p className="text-xs text-danger">{phone.error}</p>
              )}
              <Input
                value={phone.value}
                onChange={(e) => handleFieldChange("phone", e.target.value, validatePhone)}
                onBlur={() => handleFieldBlur("phone", validatePhone)}
                placeholder="+263 77 123 4567"
                error={phone.touched && !!phone.error}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email</Label>
              {email.touched && email.error && (
                <p className="text-xs text-danger">{email.error}</p>
              )}
              <Input
                type="email"
                value={email.value}
                onChange={(e) => handleFieldChange("email", e.target.value, validateEmail)}
                onBlur={() => handleFieldBlur("email", validateEmail)}
                placeholder="john@example.com"
                error={email.touched && !!email.error}
              />
            </div>

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
    </div>
  );
}
