"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { RightDrawer } from "@/components/common/right-drawer";
import { useRequireAuth } from "@/hooks/useAuth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";
import { LeadHeroCard } from "@/components/leads/lead-hero-card";
import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { PropertyViewModal } from "@/components/leads/property-view-modal";
import { leadToasts, activityToasts, propertyToasts } from "@/lib/toast";

const PropertySuggestions = lazy(() =>
  import("./property-suggestions").then((m) => ({ default: m.PropertySuggestions }))
);
const PropertyComparison = lazy(() =>
  import("./property-comparison").then((m) => ({ default: m.PropertyComparison }))
);
const DocumentManager = lazy(() =>
  import("../documents/document-manager").then((m) => ({ default: m.DocumentManager }))
);

const tabs = ["Timeline", "Documents", "Matched Properties", "Suggested", "Notes"] as const;

const matchCardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const matchCardItemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const tabContentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
} as const;

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
  const [dealValue, setDealValue] = useState("");
  const [dealCurrency, setDealCurrency] = useState("USD");
  const [closeDetailsInitialized, setCloseDetailsInitialized] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSavingCloseDetails, setIsSavingCloseDetails] = useState(false);

  // Property attachment state
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [matchType, setMatchType] = useState<"suggested" | "requested" | "viewed" | "offered">("requested");
  const [propertySearch, setPropertySearch] = useState("");
  const [isAttaching, setIsAttaching] = useState(false);

  // Sibling leads resolution state (when won/under contract)
  const [showSiblingModal, setShowSiblingModal] = useState(false);
  const [siblingLeadsToClose, setSiblingLeadsToClose] = useState<Set<string>>(new Set());
  const [isClosingSiblings, setIsClosingSiblings] = useState(false);
  const [siblingCloseConfirmText, setSiblingCloseConfirmText] = useState("");

  // Contact info warning state
  const [showContactInfoWarning, setShowContactInfoWarning] = useState(false);

  // Delete lead state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Property comparison state
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonPropertyIds, setComparisonPropertyIds] = useState<Id<"properties">[]>([]);

  // View property modal state
  const [viewPropertyId, setViewPropertyId] = useState<string | null>(null);

  // Deletion state — declared before queries so we can skip them after delete
  const [hasDeleted, setHasDeleted] = useState(false);

  // Queries — skip all lead-dependent queries after deletion to avoid errors
  const leadData = useQuery(api.leads.getById, hasDeleted ? "skip" : { leadId });
  const stages = useQuery(api.stages.list);
  const activities = useQuery(api.activities.listForLead, hasDeleted ? "skip" : { leadId });
  const matches = useQuery(api.matches.listForLead, hasDeleted ? "skip" : { leadId });
  const scoreBreakdown = useQuery(api.leadScoring.getScoreBreakdown, hasDeleted ? "skip" : { leadId });
  const properties = useQuery(api.properties.list, (drawerOpen || viewPropertyId) ? {} : "skip");
  // Support both paginated response shape and legacy array shape
  const propertiesArray: Array<{ _id: Id<"properties">; title: string; listingType: string; location: string; [k: string]: unknown }> =
    (properties as any)?.items ?? (Array.isArray(properties) ? properties : []);
  const viewProperty = viewPropertyId ? propertiesArray.find((p) => p._id === viewPropertyId) ?? null : null;

  // Sibling leads query (for resolution modal)
  const siblingLeads = useQuery(
    api.leads.getOpenLeadsForContact,
    showSiblingModal && leadData?.lead
      ? { contactId: leadData.lead.contactId, excludeLeadId: leadId }
      : "skip"
  );

  // Mutations
  const moveStage = useMutation(api.leads.moveStage);
  const bulkCloseAsLost = useMutation(api.leads.bulkCloseAsLost);
  const updateNotes = useMutation(api.leads.updateNotes);
  const updateCloseDetails = useMutation(api.leads.updateCloseDetails);
  const createActivity = useMutation(api.activities.createForLead);
  const markActivityComplete = useMutation(api.activities.markComplete);
  const removeActivity = useMutation(api.activities.remove);
  const attachProperty = useMutation(api.matches.attachPropertyToLead);
  const bulkAttachProperties = useMutation(api.matches.bulkAttachProperties);
  const detachProperty = useMutation(api.matches.detach);
  const deleteLeadMutation = useMutation(api.leads.deleteLead);

  // Initialize notes from lead data
  if (leadData?.lead && !notesInitialized) {
    setNotes(leadData.lead.notes || "");
    setNotesInitialized(true);
  }

  // Initialize close details from lead data
  if (leadData?.lead && !closeDetailsInitialized) {
    const l = leadData.lead as Record<string, unknown>;
    if (l.closeReason) setCloseReason(l.closeReason as string);
    if (l.dealValue) setDealValue(String(l.dealValue));
    if (l.dealCurrency) setDealCurrency(l.dealCurrency as string);
    setCloseDetailsInitialized(true);
  }

  const handleStageChange = useCallback(async (newStageId: Id<"pipelineStages">) => {
    const stage = stages?.find((s) => s._id === newStageId);
    try {
      const parsedDealValue = dealValue ? parseFloat(dealValue.replace(/[^0-9.]/g, "")) : undefined;
      await moveStage({
        leadId,
        stageId: newStageId,
        closeReason: stage?.isTerminal ? closeReason : undefined,
        dealValue: stage?.isTerminal && stage?.terminalOutcome === "won" ? parsedDealValue : undefined,
        dealCurrency: stage?.isTerminal && stage?.terminalOutcome === "won" ? dealCurrency : undefined,
      });
      leadToasts.stageMoved(stage?.name || "new stage");

      // Show sibling leads modal when won or under contract
      const isWon = stage?.isTerminal && stage?.terminalOutcome === "won";
      const isUnderContract = !stage?.isTerminal && stage?.name.toLowerCase() === "under contract";
      if (isWon || isUnderContract) {
        setShowSiblingModal(true);
        setSiblingLeadsToClose(new Set());
      }
    } catch (error) {
      console.error("Failed to update stage:", error);
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("MISSING_CONTACT_INFO")) {
        setShowContactInfoWarning(true);
      } else {
        leadToasts.stageMoveFailed(msg || undefined);
      }
    }
  }, [stages, moveStage, leadId, closeReason, dealValue, dealCurrency]);

  const handleSaveCloseDetails = useCallback(async () => {
    setIsSavingCloseDetails(true);
    try {
      const parsedDealValue = dealValue ? parseFloat(dealValue.replace(/[^0-9.]/g, "")) : undefined;
      await updateCloseDetails({
        leadId,
        closeReason: closeReason || undefined,
        dealValue: parsedDealValue,
        dealCurrency,
      });
      leadToasts.stageMoved("close details saved");
    } catch (error) {
      console.error("Failed to save close details:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsSavingCloseDetails(false);
    }
  }, [updateCloseDetails, leadId, closeReason, dealValue, dealCurrency]);

  const handleSaveNotes = useCallback(async () => {
    setIsSavingNotes(true);
    try {
      await updateNotes({ leadId, notes });
      leadToasts.notesSaved();
    } catch (error) {
      console.error("Failed to save notes:", error);
      leadToasts.notesSaveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsSavingNotes(false);
    }
  }, [updateNotes, leadId, notes]);

  const handleCreateActivity = useCallback(async (data: {
    type: "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note";
    title: string;
    description: string;
    scheduledAt?: number;
  }) => {
    try {
      await createActivity({ leadId, ...data });
      activityToasts.created(data.title);
    } catch (error) {
      console.error("Failed to create activity:", error);
      activityToasts.createFailed(error instanceof Error ? error.message : undefined);
      throw error;
    }
  }, [createActivity, leadId]);

  const handleMarkComplete = useCallback(async (activityId: Id<"activities">, completionNotes: string) => {
    try {
      await markActivityComplete({ activityId, completionNotes });
      activityToasts.completed("Activity");
    } catch (error) {
      console.error("Failed to mark activity complete:", error);
      activityToasts.completeFailed(error instanceof Error ? error.message : undefined);
      throw error;
    }
  }, [markActivityComplete]);

  const handleDeleteActivity = useCallback(async (activityId: Id<"activities">) => {
    try {
      await removeActivity({ activityId });
      activityToasts.deleted("Activity");
    } catch (error) {
      console.error("Failed to delete activity:", error);
      activityToasts.deleteFailed(error instanceof Error ? error.message : undefined);
      throw error;
    }
  }, [removeActivity]);

  const handleAttachProperties = useCallback(async () => {
    if (selectedPropertyIds.size === 0) return;
    setIsAttaching(true);
    try {
      const propertyIds = Array.from(selectedPropertyIds) as Id<"properties">[];
      const result = await bulkAttachProperties({ leadId, propertyIds, matchType });
      const totalAttached = (result.attachedToCurrentLead ? 1 : 0) + result.createdLeadCount;
      if (result.createdLeadCount > 0) {
        propertyToasts.attached(totalAttached, `${result.createdLeadCount} new lead${result.createdLeadCount > 1 ? "s" : ""} created`);
      } else {
        propertyToasts.attached(totalAttached);
      }
      setDrawerOpen(false);
      setSelectedPropertyIds(new Set());
    } catch (error) {
      console.error("Failed to attach property:", error);
      propertyToasts.attachFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsAttaching(false);
    }
  }, [selectedPropertyIds, bulkAttachProperties, leadId, matchType]);

  const togglePropertySelection = useCallback((propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }, []);

  const handleDetachProperty = useCallback(async (matchId: Id<"leadPropertyMatches">) => {
    try {
      await detachProperty({ matchId });
      propertyToasts.detached();
    } catch (error) {
      console.error("Failed to detach property:", error);
      propertyToasts.detachFailed(error instanceof Error ? error.message : undefined);
    }
  }, [detachProperty]);

  const handleOpenComparison = useCallback((propertyIds: Id<"properties">[]) => {
    setComparisonPropertyIds(propertyIds);
    setComparisonOpen(true);
  }, []);

  const toggleSiblingLead = useCallback((siblingLeadId: string) => {
    setSiblingLeadsToClose((prev) => {
      const next = new Set(prev);
      if (next.has(siblingLeadId)) next.delete(siblingLeadId);
      else next.add(siblingLeadId);
      return next;
    });
  }, []);

  const handleCloseSiblingLeads = useCallback(async () => {
    if (siblingLeadsToClose.size === 0) {
      setShowSiblingModal(false);
      return;
    }
    setIsClosingSiblings(true);
    try {
      await bulkCloseAsLost({
        leadIds: Array.from(siblingLeadsToClose) as Id<"leads">[],
        closeReason: "Contact chose another property",
      });
      leadToasts.stageMoved(`${siblingLeadsToClose.size} lead(s) marked as lost`);
      setShowSiblingModal(false);
      setSiblingLeadsToClose(new Set());
      setSiblingCloseConfirmText("");
    } catch (error) {
      console.error("Failed to close sibling leads:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsClosingSiblings(false);
    }
  }, [siblingLeadsToClose, bulkCloseAsLost]);

  const handleDeleteLead = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteLeadMutation({ leadId });
      leadToasts.stageMoved("Lead deleted");
      setHasDeleted(true);
      router.push("/app/leads");
    } catch (error) {
      console.error("Failed to delete lead:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteLeadMutation, leadId, router]);

  // Redirect immediately after deletion
  if (hasDeleted) {
    router.push("/app/leads");
    return null;
  }

  // Loading and error states
  if (authLoading || leadData === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (leadData === null) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Lead not found or you don&apos;t have access.</p>
        <Button className="mt-4" onClick={() => router.push("/app/leads")}>Back to leads</Button>
      </div>
    );
  }

  const { lead, stage, owner } = leadData as {
    lead: typeof leadData.lead;
    stage: { _id: string; name: string; order: number; isTerminal: boolean; terminalOutcome: "won" | "lost" | null } | null;
    owner: { _id: string; fullName?: string; name?: string; email?: string } | null;
  };

  const nonTerminalStages = stages?.filter((s) => !s.isTerminal) ?? [];
  const currentStageOrder = stage?.order ?? 1;
  const maxOrder = Math.max(...(nonTerminalStages.map((s) => s.order) ?? [1]));
  const stageProgress = lead.closedAt ? 100 : Math.round((currentStageOrder / maxOrder) * 100);

  const filteredProperties = propertiesArray.filter(
    (p) =>
      (p.status === "available" || p.status === "under_offer") &&
      (p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
      p.location.toLowerCase().includes(propertySearch.toLowerCase()))
  );
  const attachedPropertyIds = new Set(matches?.map((m) => m.propertyId) ?? []);

  const leadPropertyName = matches && matches.length > 0 && matches[0].property
    ? matches[0].property.title
    : null;
  const deleteConfirmPhrase = leadPropertyName
    ? `delete lead ${lead.fullName.toLowerCase()} for ${leadPropertyName.toLowerCase()}`
    : `delete my lead`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Breadcrumb items={[{ label: "Leads", href: "/app/leads" }, { label: lead.fullName }]} />
        <Button
          variant="ghost"
          className="text-danger hover:text-danger hover:bg-danger/10 text-xs h-8 px-3"
          onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); }}
        >
          Delete Lead
        </Button>
      </div>

      <LeadHeroCard
        lead={lead}
        stage={stage}
        owner={owner}
        stages={stages}
        scoreBreakdown={scoreBreakdown}
        stageProgress={stageProgress}
        closeReason={closeReason}
        onCloseReasonChange={setCloseReason}
        dealValue={dealValue}
        onDealValueChange={setDealValue}
        dealCurrency={dealCurrency}
        onDealCurrencyChange={setDealCurrency}
        onStageChange={handleStageChange}
        onSaveCloseDetails={handleSaveCloseDetails}
        isSavingCloseDetails={isSavingCloseDetails}
        closeDetailsSaved={!!(lead.closedAt && (leadData?.lead as Record<string, unknown>)?.closeReason)}
        onViewDetails={() => setContactDetailsOpen(true)}
      />

      <DuplicateWarning email={lead.email} phone={lead.phone} excludeLeadId={leadId} />

      {/* Tab bar with sliding underline */}
      <div className="border-b border-border">
        <div className="flex gap-6 relative">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                activeTab === tab ? "text-text" : "text-text-muted hover:text-text"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  layoutId="lead-tab-indicator"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "Timeline" && (
          <motion.div key="timeline" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <ActivityTimeline
              leadId={leadId}
              activities={activities}
              onCreateActivity={handleCreateActivity}
              onMarkComplete={handleMarkComplete}
              onDeleteActivity={handleDeleteActivity}
            />
          </motion.div>
        )}

        {activeTab === "Documents" && (
          <motion.div key="documents" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <DocumentManager leadId={leadId} folders={["lead_documentation", "id_copies", "proof_of_funds", "contracts"]} />
            </Suspense>
          </motion.div>
        )}

        {activeTab === "Matched Properties" && (
          <motion.div key="matched" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Matches</h3>
              <Button onClick={() => setDrawerOpen(true)}>Attach Property</Button>
            </div>
            <Card className="p-5">
              {matches === undefined ? (
                <div className="flex items-center justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
              ) : matches.length === 0 ? (
                <p className="text-text-muted text-sm py-4">No properties matched yet.</p>
              ) : (
                <motion.div variants={matchCardContainerVariants} initial="hidden" animate="show" className="space-y-3">
                  {matches.map((match) => (
                    <motion.div
                      key={match._id}
                      variants={matchCardItemVariants}
                      whileHover={{ x: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="flex items-center justify-between rounded-[10px] border border-border-strong p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{match.property?.title || "Unknown property"}</p>
                        <p className="text-xs text-text-muted">
                          {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)} · {match.property?.location || "No location"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{match.property?.listingType === "sale" ? "Sale" : "Rent"}</span>
                        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setViewPropertyId(match.propertyId)}>View</Button>
                        <Button variant="secondary" className="h-8 px-2 text-xs text-danger hover:text-danger" onClick={() => handleDetachProperty(match._id)}>Remove</Button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </Card>
          </motion.div>
        )}

        {activeTab === "Suggested" && (
          <motion.div key="suggested" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <PropertySuggestions leadId={leadId} onCompareSelect={handleOpenComparison} />
            </Suspense>
          </motion.div>
        )}

        {activeTab === "Notes" && (
          <motion.div key="notes" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Lead notes</h3>
              <Textarea className="min-h-[180px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this lead..." />
              <div className="flex justify-end">
                <Button onClick={handleSaveNotes} disabled={isSavingNotes}>{isSavingNotes ? "Saving..." : "Save notes"}</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attach properties drawer */}
      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Attach properties"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">{selectedPropertyIds.size > 0 ? `${selectedPropertyIds.size} selected` : "Select properties"}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button onClick={handleAttachProperties} disabled={isAttaching || selectedPropertyIds.size === 0}>
                {isAttaching ? "Attaching..." : `Attach${selectedPropertyIds.size > 0 ? ` (${selectedPropertyIds.size})` : ""}`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Input placeholder="Search by title or location..." value={propertySearch} onChange={(e) => setPropertySearch(e.target.value)} />
          <div className="space-y-2">
            <Label>Match type</Label>
            <StaggeredDropDown
              value={matchType}
              onChange={(val) => setMatchType(val as typeof matchType)}
              options={[
                { value: "requested", label: "Requested", description: "Client asked about this property" },
                { value: "suggested", label: "Suggested", description: "Agent recommended to the client" },
                { value: "viewed", label: "Viewed", description: "Client visited or viewed the property" },
                { value: "offered", label: "Offered", description: "Formally offered to the client" },
              ]}
            />
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {filteredProperties.filter((p) => !attachedPropertyIds.has(p._id)).map((property, index) => {
              const isSelected = selectedPropertyIds.has(property._id);
              return (
                <motion.label
                  key={property._id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24, delay: index * 0.04 }}
                  className={`flex items-center gap-3 rounded-[10px] border p-3 text-sm cursor-pointer transition-colors ${
                    isSelected ? "border-primary/40 bg-primary/5 text-text" : "border-border-strong bg-card-bg text-text hover:bg-card-bg/50"
                  }`}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => togglePropertySelection(property._id)} className="rounded border-border shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text">{property.title}</p>
                    <p className="text-xs text-text-muted">{property.listingType === "sale" ? "Sale" : "Rent"} &middot; {property.location}</p>
                  </div>
                </motion.label>
              );
            })}
            {filteredProperties.filter((p) => !attachedPropertyIds.has(p._id)).length === 0 && (
              <p className="text-text-muted text-sm py-4">No properties available to attach.</p>
            )}
          </div>
        </div>
      </RightDrawer>

      {/* Contact details modal */}
      <Modal
        open={contactDetailsOpen}
        title={`Lead: ${lead.fullName}`}
        description="Review the lead details."
        onClose={() => setContactDetailsOpen(false)}
        footer={<div className="flex justify-end"><Button onClick={() => setContactDetailsOpen(false)}>Close</Button></div>}
      >
        <motion.div
          className="grid gap-4 md:grid-cols-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        >
          {[
            { label: "Name", value: lead.fullName },
            { label: "Phone", value: lead.phone || "Not provided" },
            { label: "Email", value: lead.email || "Not provided" },
            { label: "Owner", value: owner?.fullName || owner?.name || owner?.email || "Unassigned" },
            { label: "Interest", value: lead.interestType === "buy" ? "Buying" : "Renting" },
            { label: "Source", value: lead.source.replace("_", " ").replace(/^\w/, (c: string) => c.toUpperCase()) },
          ].map(({ label, value }) => (
            <motion.div
              key={label}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
              className="space-y-2"
            >
              <Label>{label}</Label>
              <Input value={value} readOnly />
            </motion.div>
          ))}
          {lead.budgetMin !== undefined && (
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <Input value={`${lead.budgetCurrency || "USD"} ${lead.budgetMin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} readOnly />
            </div>
          )}
          {lead.budgetMax !== undefined && (
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <Input value={`${lead.budgetCurrency || "USD"} ${lead.budgetMax.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} readOnly />
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label>Preferred Areas</Label>
            <Input value={lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "None specified"} readOnly />
          </div>
        </motion.div>
      </Modal>

      {/* Property view modal */}
      <PropertyViewModal
        open={viewPropertyId !== null}
        property={viewProperty as any}
        propertyId={viewPropertyId}
        onClose={() => setViewPropertyId(null)}
      />

      {comparisonOpen && (
        <Suspense fallback={null}>
          <PropertyComparison
            open={comparisonOpen}
            onClose={() => { setComparisonOpen(false); setComparisonPropertyIds([]); }}
            propertyIds={comparisonPropertyIds}
            leadId={leadId}
          />
        </Suspense>
      )}

      {/* Sibling leads resolution modal */}
      <Modal
        open={showSiblingModal}
        title="Resolve other leads for this contact"
        description={`${lead.fullName} has other open leads. Select which ones to mark as lost, or keep them open.`}
        onClose={() => { setShowSiblingModal(false); setSiblingCloseConfirmText(""); }}
        footer={
          <div className="space-y-3">
            {siblingLeadsToClose.size > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  Type <span className="font-mono font-medium text-text">close leads for {lead.fullName.toLowerCase()}</span> to confirm
                </p>
                <Input
                  value={siblingCloseConfirmText}
                  onChange={(e) => setSiblingCloseConfirmText(e.target.value)}
                  placeholder={`close leads for ${lead.fullName.toLowerCase()}`}
                  className="font-mono text-sm"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-muted">
                {siblingLeadsToClose.size > 0 ? `${siblingLeadsToClose.size} selected to close` : "None selected"}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setShowSiblingModal(false); setSiblingCloseConfirmText(""); }} disabled={isClosingSiblings}>
                  Keep all open
                </Button>
                <Button
                  onClick={handleCloseSiblingLeads}
                  disabled={isClosingSiblings || siblingLeadsToClose.size === 0 || siblingCloseConfirmText !== `close leads for ${lead.fullName.toLowerCase()}`}
                  className="bg-danger hover:bg-danger/90 text-white"
                >
                  {isClosingSiblings ? "Closing..." : `Mark ${siblingLeadsToClose.size} as lost`}
                </Button>
              </div>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {siblingLeads === undefined ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : siblingLeads.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">
              No other open leads for this contact.
            </div>
          ) : (
            siblingLeads.map((sibling) => {
              const isSelected = siblingLeadsToClose.has(sibling._id);
              return (
                <label
                  key={sibling._id}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? "border-danger/40 bg-danger/5"
                      : "border-border-strong hover:bg-card-bg/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSiblingLead(sibling._id)}
                    className="rounded border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{sibling.fullName}</p>
                    <p className="text-xs text-text-muted">
                      {sibling.interestType === "buy" ? "Buying" : "Renting"} &middot; Stage: {sibling.stageName}
                    </p>
                    {sibling.properties && sibling.properties.length > 0 && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Property: {sibling.properties.filter(Boolean).map((p) => (p as { title: string }).title).join(", ")}
                      </p>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </Modal>

      {/* Contact info warning modal */}
      <Modal
        open={showContactInfoWarning}
        title="Contact Information Required"
        description=""
        onClose={() => setShowContactInfoWarning(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowContactInfoWarning(false)}>
              I&apos;ll do it later
            </Button>
            <Button onClick={() => { setShowContactInfoWarning(false); window.location.href = "/app/contacts"; }}>
              Go to Contacts
            </Button>
          </div>
        }
      >
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <div className="rounded-xl border-2 border-warning/40 bg-warning/10 p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-warning">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-text mb-2">Missing Contact Information</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              For the sake of data consistency, you can&apos;t move a lead further down the pipeline without any contact information.
            </p>
            <p className="text-sm text-text-muted mt-2 leading-relaxed">
              Please add a <span className="font-semibold text-text">phone number</span> or <span className="font-semibold text-text">email address</span> to the contact before moving this lead.
            </p>
          </div>
        </motion.div>
      </Modal>

      {/* Delete lead confirmation modal */}
      <Modal
        open={showDeleteModal}
        title="Delete lead"
        description="This action cannot be undone. This will permanently delete the lead, its activities, and property matches."
        onClose={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteLead}
              disabled={isDeleting || deleteConfirmText !== deleteConfirmPhrase}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete lead"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-danger/20 bg-danger/5 p-3">
            <p className="text-sm font-medium text-text">{lead.fullName}</p>
            {matches && matches.length > 0 && matches[0].property && (
              <p className="text-xs text-text-muted mt-0.5">
                Property: {matches[0].property.title}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Type <span className="font-mono font-medium text-text">{deleteConfirmPhrase}</span> to confirm
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteConfirmPhrase}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
