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
  const [notes, setNotes] = useState("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Property attachment state
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [matchType, setMatchType] = useState<"suggested" | "requested" | "viewed" | "offered">("requested");
  const [propertySearch, setPropertySearch] = useState("");
  const [isAttaching, setIsAttaching] = useState(false);

  // Property comparison state
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonPropertyIds, setComparisonPropertyIds] = useState<Id<"properties">[]>([]);

  // View property modal state
  const [viewPropertyId, setViewPropertyId] = useState<string | null>(null);

  // Queries
  const leadData = useQuery(api.leads.getById, { leadId });
  const stages = useQuery(api.stages.list);
  const activities = useQuery(api.activities.listForLead, { leadId });
  const matches = useQuery(api.matches.listForLead, { leadId });
  const scoreBreakdown = useQuery(api.leadScoring.getScoreBreakdown, { leadId });
  const properties = useQuery(api.properties.list, (drawerOpen || viewPropertyId) ? {} : "skip");
  // Support both paginated response shape and legacy array shape
  const propertiesArray: Array<{ _id: Id<"properties">; title: string; listingType: string; location: string; [k: string]: unknown }> =
    (properties as any)?.items ?? (Array.isArray(properties) ? properties : []);
  const viewProperty = viewPropertyId ? propertiesArray.find((p) => p._id === viewPropertyId) ?? null : null;

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
    } catch (error) {
      console.error("Failed to update stage:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    }
  }, [stages, moveStage, leadId, closeReason, dealValue, dealCurrency]);

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

  const handleAttachProperties = useCallback(async () => {
    if (selectedPropertyIds.size === 0) return;
    setIsAttaching(true);
    try {
      for (const propertyId of selectedPropertyIds) {
        await attachProperty({ leadId, propertyId: propertyId as Id<"properties">, matchType });
      }
      propertyToasts.attached(selectedPropertyIds.size);
      setDrawerOpen(false);
      setSelectedPropertyIds(new Set());
    } catch (error) {
      console.error("Failed to attach property:", error);
      propertyToasts.attachFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsAttaching(false);
    }
  }, [selectedPropertyIds, attachProperty, leadId, matchType]);

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
      p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
      p.location.toLowerCase().includes(propertySearch.toLowerCase())
  );
  const attachedPropertyIds = new Set(matches?.map((m) => m.propertyId) ?? []);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Leads", href: "/app/leads" }, { label: lead.fullName }]} />

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
            />
          </motion.div>
        )}

        {activeTab === "Documents" && (
          <motion.div key="documents" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <DocumentManager leadId={leadId} folders={["lead_documentation", "id_copies", "proof_of_funds", "contracts", "mandates_to_sell"]} />
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
            { label: "Phone", value: lead.phone },
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
    </div>
  );
}
