"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RightDrawer } from "@/components/common/right-drawer";
import { useRequireAuth } from "@/hooks/useAuth";

const tabs = ["Timeline", "Matched Properties", "Notes"] as const;

interface LeadDetailProps {
  leadId: Id<"leads">;
}

export function LeadDetail({ leadId }: LeadDetailProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Timeline");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [notes, setNotes] = useState("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Property attachment state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [matchType, setMatchType] = useState<"suggested" | "requested" | "viewed" | "offered">("suggested");
  const [propertySearch, setPropertySearch] = useState("");
  const [isAttaching, setIsAttaching] = useState(false);

  // Activity form state
  const [activityType, setActivityType] = useState<"call" | "whatsapp" | "email" | "meeting" | "viewing" | "note">("call");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityScheduledAt, setActivityScheduledAt] = useState("");
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  // Queries
  const leadData = useQuery(api.leads.getById, { leadId });
  const stages = useQuery(api.stages.list);
  const activities = useQuery(api.activities.listForLead, { leadId });
  const matches = useQuery(api.matches.listForLead, { leadId });
  const properties = useQuery(api.properties.list, {});

  // Mutations
  const moveStage = useMutation(api.leads.moveStage);
  const updateNotes = useMutation(api.leads.updateNotes);
  const createActivity = useMutation(api.activities.createForLead);
  const markActivityComplete = useMutation(api.activities.markComplete);
  const attachProperty = useMutation(api.matches.attachPropertyToLead);
  const detachProperty = useMutation(api.matches.detach);

  // Initialize notes from lead data
  if (leadData?.lead && !notesInitialized) {
    setNotes(leadData.lead.notes || "");
    setNotesInitialized(true);
  }

  const handleStageChange = async (newStageId: Id<"pipelineStages">) => {
    const stage = stages?.find((s) => s._id === newStageId);
    try {
      await moveStage({
        leadId,
        stageId: newStageId,
        closeReason: stage?.isTerminal ? closeReason : undefined,
      });
    } catch (error) {
      console.error("Failed to update stage:", error);
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await updateNotes({ leadId, notes });
    } catch (error) {
      console.error("Failed to save notes:", error);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCreateActivity = async () => {
    if (!activityTitle.trim()) return;
    setIsSavingActivity(true);
    try {
      await createActivity({
        leadId,
        type: activityType,
        title: activityTitle.trim(),
        description: activityDescription.trim(),
        scheduledAt: activityScheduledAt ? new Date(activityScheduledAt).getTime() : undefined,
      });
      setActivityTitle("");
      setActivityDescription("");
      setActivityScheduledAt("");
    } catch (error) {
      console.error("Failed to create activity:", error);
    } finally {
      setIsSavingActivity(false);
    }
  };

  const handleMarkComplete = async (activityId: Id<"activities">) => {
    try {
      await markActivityComplete({ activityId });
    } catch (error) {
      console.error("Failed to mark activity complete:", error);
    }
  };

  const handleAttachProperty = async () => {
    if (!selectedPropertyId) return;
    setIsAttaching(true);
    try {
      await attachProperty({
        leadId,
        propertyId: selectedPropertyId as Id<"properties">,
        matchType,
      });
      setDrawerOpen(false);
      setSelectedPropertyId("");
    } catch (error) {
      console.error("Failed to attach property:", error);
    } finally {
      setIsAttaching(false);
    }
  };

  const handleDetachProperty = async (matchId: Id<"leadPropertyMatches">) => {
    try {
      await detachProperty({ matchId });
    } catch (error) {
      console.error("Failed to detach property:", error);
    }
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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

  if (leadData === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (leadData === null) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Lead not found or you don&apos;t have access.</p>
        <Button className="mt-4" onClick={() => router.push("/app/leads")}>
          Back to leads
        </Button>
      </div>
    );
  }

  const { lead, stage, owner } = leadData as {
    lead: typeof leadData.lead;
    stage: { _id: string; name: string; order: number; isTerminal: boolean; terminalOutcome: "won" | "lost" | null } | null;
    owner: { _id: string; fullName?: string; name?: string; email?: string } | null;
  };

  // Calculate stage progress
  const nonTerminalStages = stages?.filter((s) => !s.isTerminal) ?? [];
  const currentStageOrder = stage?.order ?? 1;
  const maxOrder = Math.max(...(nonTerminalStages.map((s) => s.order) ?? [1]));
  const stageProgress = lead.closedAt
    ? 100
    : Math.round((currentStageOrder / maxOrder) * 100);

  // Filter properties for search
  const filteredProperties = properties?.filter(
    (p) =>
      p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
      p.location.toLowerCase().includes(propertySearch.toLowerCase())
  );

  // Get attached property IDs
  const attachedPropertyIds = new Set(matches?.map((m) => m.propertyId) ?? []);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{lead.fullName}</h2>
              <Badge
                className={
                  lead.closedAt
                    ? stage?.terminalOutcome === "won"
                      ? "bg-success/10 text-success"
                      : "bg-danger/10 text-danger"
                    : "bg-info/10 text-info"
                }
              >
                {lead.closedAt
                  ? stage?.terminalOutcome === "won"
                    ? "Won"
                    : "Lost"
                  : "Open"}
              </Badge>
              <Badge
                className={
                  lead.interestType === "buy"
                    ? "bg-primary/10 text-primary"
                    : "bg-warning/10 text-warning"
                }
              >
                {lead.interestType === "buy" ? "Buying" : "Renting"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-text-muted">
              <span>Owner: {owner?.fullName || owner?.name || owner?.email || "Unassigned"}</span>
              <span>Phone: {lead.phone}</span>
              {lead.email && <span>Email: {lead.email}</span>}
              <span>Created: {formatDate(lead.createdAt)}</span>
            </div>
            {lead.preferredAreas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lead.preferredAreas.map((area: string) => (
                  <span
                    key={area}
                    className="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs"
                  >
                    {area}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => setContactDetailsOpen(true)}
              >
                View details
              </Button>
            </div>
          </div>
          <div className="min-w-[200px]">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Stage progress</span>
              <span>{stageProgress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-border">
              <div
                className={`h-2 rounded-full ${
                  lead.closedAt && stage?.terminalOutcome === "lost"
                    ? "bg-danger"
                    : "bg-primary"
                }`}
                style={{ width: `${stageProgress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select
            className="max-w-xs"
            value={lead.stageId}
            onChange={(e) => handleStageChange(e.target.value as Id<"pipelineStages">)}
          >
            {stages?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          {stages?.find((s) => s._id === lead.stageId)?.isTerminal && (
            <Input
              placeholder="Close reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              className="max-w-xs"
            />
          )}
        </div>
      </Card>

      <div className="border-b border-border">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium transition duration-150 ${
                activeTab === tab
                  ? "border-b-2 border-primary text-text"
                  : "text-text-muted"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Timeline" && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Log activity
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as typeof activityType)}
                >
                  <option value="call">Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="viewing">Viewing</option>
                  <option value="note">Note</option>
                </Select>
                <Input
                  placeholder="Title"
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                />
              </div>
              <Input
                type="datetime-local"
                value={activityScheduledAt}
                onChange={(e) => setActivityScheduledAt(e.target.value)}
                placeholder="Schedule date/time (optional)"
              />
              <Textarea
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                placeholder="Description..."
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleCreateActivity}
                  disabled={isSavingActivity || !activityTitle.trim()}
                >
                  {isSavingActivity ? "Saving..." : "Save activity"}
                </Button>
              </div>
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Timeline
            </h3>
            {activities === undefined ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-text-muted text-sm py-4">No activities yet.</p>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity._id}
                    className="rounded-[10px] border border-border-strong bg-card-bg/40 p-4"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{activity.title}</span>
                      <Badge
                        className={
                          activity.completedAt
                            ? "bg-success/10 text-success"
                            : activity.scheduledAt
                            ? "bg-warning/10 text-warning"
                            : "bg-info/10 text-info"
                        }
                      >
                        {activity.completedAt
                          ? "Completed"
                          : activity.scheduledAt
                          ? "Scheduled"
                          : "Logged"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-text-muted capitalize">
                      {activity.type}
                    </p>
                    {activity.description && (
                      <p className="mt-2 text-sm text-text-muted">
                        {activity.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-text-muted">
                      {activity.scheduledAt
                        ? formatDateTime(activity.scheduledAt)
                        : formatDateTime(activity.createdAt)}
                    </p>
                    {!activity.completedAt && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => handleMarkComplete(activity._id)}
                        >
                          Mark complete
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "Matched Properties" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Matches
            </h3>
            <Button onClick={() => setDrawerOpen(true)}>Attach Property</Button>
          </div>
          <Card className="p-5">
            {matches === undefined ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : matches.length === 0 ? (
              <p className="text-text-muted text-sm py-4">No properties matched yet.</p>
            ) : (
              <div className="space-y-3">
                {matches.map((match) => (
                  <div
                    key={match._id}
                    className="flex items-center justify-between rounded-[10px] border border-border-strong p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{match.property?.title || "Unknown property"}</p>
                      <p className="text-xs text-text-muted">
                        {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)} · {match.property?.location || "No location"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">
                        {match.property?.listingType === "sale" ? "Sale" : "Rent"}
                      </span>
                      <Button
                        variant="secondary"
                        className="h-8 px-2 text-xs text-danger hover:text-danger"
                        onClick={() => handleDetachProperty(match._id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "Notes" && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Lead notes
          </h3>
          <Textarea
            className="min-h-[180px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this lead..."
          />
          <div className="flex justify-end">
            <Button onClick={handleSaveNotes} disabled={isSavingNotes}>
              {isSavingNotes ? "Saving..." : "Save notes"}
            </Button>
          </div>
        </Card>
      )}

      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Attach property"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAttachProperty}
              disabled={isAttaching || !selectedPropertyId}
            >
              {isAttaching ? "Attaching..." : "Attach"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Search property"
            value={propertySearch}
            onChange={(e) => setPropertySearch(e.target.value)}
          />
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filteredProperties?.filter((p) => !attachedPropertyIds.has(p._id)).map((property) => (
              <label
                key={property._id}
                className="flex items-center justify-between rounded-[10px] border border-border-strong p-3 text-sm cursor-pointer hover:bg-card-bg/50"
              >
                <div>
                  <p className="font-medium">{property.title}</p>
                  <p className="text-xs text-text-muted">
                    {property.listingType === "sale" ? "Sale" : "Rent"} · {property.location}
                  </p>
                </div>
                <input
                  type="radio"
                  name="property"
                  value={property._id}
                  checked={selectedPropertyId === property._id}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                />
              </label>
            ))}
            {filteredProperties?.filter((p) => !attachedPropertyIds.has(p._id)).length === 0 && (
              <p className="text-text-muted text-sm py-4">No properties available to attach.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Match type</Label>
            <Select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as typeof matchType)}
            >
              <option value="suggested">Suggested</option>
              <option value="requested">Requested</option>
              <option value="viewed">Viewed</option>
              <option value="offered">Offered</option>
            </Select>
          </div>
        </div>
      </RightDrawer>

      <Modal
        open={contactDetailsOpen}
        title={`Lead: ${lead.fullName}`}
        description="Review the lead details."
        onClose={() => setContactDetailsOpen(false)}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setContactDetailsOpen(false)}>Close</Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={lead.fullName} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={lead.phone} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={lead.email || "Not provided"} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input value={owner?.fullName || owner?.name || owner?.email || "Unassigned"} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Interest</Label>
            <Input value={lead.interestType === "buy" ? "Buying" : "Renting"} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input value={lead.source.replace("_", " ").replace(/^\w/, (c: string) => c.toUpperCase())} readOnly />
          </div>
          {lead.budgetMin !== undefined && (
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <Input value={`$${lead.budgetMin.toLocaleString()}`} readOnly />
            </div>
          )}
          {lead.budgetMax !== undefined && (
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <Input value={`$${lead.budgetMax.toLocaleString()}`} readOnly />
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label>Preferred Areas</Label>
            <Input
              value={lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "None specified"}
              readOnly
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
