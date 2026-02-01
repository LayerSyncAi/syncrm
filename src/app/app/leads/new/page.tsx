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

export default function NewLeadPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<Source>("walk_in");
  const [interestType, setInterestType] = useState<InterestType>("rent");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [preferredAreas, setPreferredAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const handleAddArea = (area: string) => {
    const trimmed = area.trim();
    if (trimmed && !preferredAreas.includes(trimmed)) {
      setPreferredAreas([...preferredAreas, trimmed]);
    }
    setAreaInput("");
  };

  const handleRemoveArea = (area: string) => {
    setPreferredAreas(preferredAreas.filter((a) => a !== area));
  };

  const handleAddNewLocation = async () => {
    if (!newLocation.trim()) return;
    setIsAddingLocation(true);
    try {
      await createLocation({ name: newLocation.trim() });
      // Add to preferred areas
      handleAddArea(newLocation.trim());
      setNewLocation("");
    } catch (err: any) {
      setError(err.message || "Failed to add location");
    } finally {
      setIsAddingLocation(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }
    if (!phone.trim()) {
      setError("Phone number is required");
      return;
    }
    if (!selectedStage) {
      setError("Please select a stage");
      return;
    }

    setIsSubmitting(true);
    try {
      await createLead({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source,
        interestType,
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
    } catch (err: any) {
      setError(err.message || "Failed to create lead");
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create Lead</h2>
        <p className="text-sm text-text-muted">
          Quick capture for new opportunities.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+263 77 123 4567"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Interest type *</Label>
              <Select
                value={interestType}
                onChange={(e) => setInterestType(e.target.value as InterestType)}
              >
                <option value="rent">Rent</option>
                <option value="buy">Buy</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Budget min</Label>
              <Input
                type="number"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="$"
              />
            </div>
            <div className="space-y-2">
              <Label>Budget max</Label>
              <Input
                type="number"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="$"
              />
            </div>
            <div className="space-y-2">
              <Label>Source *</Label>
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
            <div className="space-y-2">
              <Label>Initial Stage *</Label>
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
            </div>

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

            <div className="space-y-2 md:col-span-2">
              <Label>Preferred Areas</Label>
              <div className="flex gap-2">
                <Select
                  value={areaInput}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddArea(e.target.value);
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
