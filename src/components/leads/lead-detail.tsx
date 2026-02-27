"use client";

import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ImageUpload, type ImageItem } from "@/components/ui/image-upload";
import { FlipCalendar } from "@/components/ui/flip-calendar";
import { RightDrawer } from "@/components/common/right-drawer";
import { useRequireAuth } from "@/hooks/useAuth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";
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
const viewPropertyTabs = ["Details", "Documentation", "Gallery"] as const;
type ViewPropertyTab = (typeof viewPropertyTabs)[number];

// --- #18–25 animation variants ---

const timelineContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const timelineItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

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

const drawerItemContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const drawerItemVariants = {
  hidden: { opacity: 0, x: 12 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

interface LeadDetailProps {
  leadId: Id<"leads">;
}

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

const formatPrice = (price: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);

const formatPropertyType = (type: string) => {
  const m: Record<string, string> = { house: "House", apartment: "Apartment", land: "Land", commercial: "Commercial", other: "Other" };
  return m[type] || type;
};

const formatPropertyStatus = (status: string) => {
  const m: Record<string, string> = { available: "Available", under_offer: "Under Offer", let: "Let", sold: "Sold", off_market: "Off Market" };
  return m[status] || status;
};

const isActivityOverdue = (a: { status: string; scheduledAt?: number }) =>
  a.status === "todo" && !!a.scheduledAt && a.scheduledAt < Date.now();

// Due date proximity ring
function DueDateRing({ scheduledAt, createdAt }: { scheduledAt: number; createdAt: number }) {
  const now = Date.now();
  const total = scheduledAt - createdAt;
  const elapsed = now - createdAt;
  const progress = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const color = progress >= 1 ? "var(--danger)" : progress >= 0.75 ? "var(--warning)" : "var(--info)";

  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 11 11)" className="transition-all duration-700" />
    </svg>
  );
}

// Animated SVG checkmark for completion celebration
function CelebrationCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-success">
      <path d="M5 12l5 5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" className="check-draw-in" />
    </svg>
  );
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

  // Property attachment state (multi-select)
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [matchType, setMatchType] = useState<"suggested" | "requested" | "viewed" | "offered">("requested");
  const [propertySearch, setPropertySearch] = useState("");
  const [isAttaching, setIsAttaching] = useState(false);

  // Activity form state
  const [activityType, setActivityType] = useState<"call" | "whatsapp" | "email" | "meeting" | "viewing" | "note">("call");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityScheduledAt, setActivityScheduledAt] = useState<Date | null>(null);
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  // Complete activity modal state
  const [completingActivityId, setCompletingActivityId] = useState<Id<"activities"> | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  // Property comparison state
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonPropertyIds, setComparisonPropertyIds] = useState<Id<"properties">[]>([]);

  // View property modal state
  const [viewPropertyId, setViewPropertyId] = useState<string | null>(null);
  const [viewPropertyTab, setViewPropertyTab] = useState<ViewPropertyTab>("Details");

  // Timeline celebration state
  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(new Set());

  // Score breakdown expand state
  const [scoreExpanded, setScoreExpanded] = useState(false);

  // Queries - conditionally skip properties query when drawer is closed
  const leadData = useQuery(api.leads.getById, { leadId });
  const stages = useQuery(api.stages.list);
  const activities = useQuery(api.activities.listForLead, { leadId });
  const matches = useQuery(api.matches.listForLead, { leadId });
  const scoreBreakdown = useQuery(api.leadScoring.getScoreBreakdown, { leadId });
  // Load properties when attach drawer or property view modal is open
  const properties = useQuery(api.properties.list, (drawerOpen || viewPropertyId) ? {} : "skip");
  const viewProperty = viewPropertyId ? properties?.find((p) => p._id === viewPropertyId) : null;

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

  const handleCreateActivity = useCallback(async () => {
    if (!activityTitle.trim()) return;
    setIsSavingActivity(true);
    try {
      await createActivity({
        leadId,
        type: activityType,
        title: activityTitle.trim(),
        description: activityDescription.trim(),
        scheduledAt: activityScheduledAt ? activityScheduledAt.getTime() : undefined,
      });
      activityToasts.created(activityTitle.trim());
      setActivityTitle("");
      setActivityDescription("");
      setActivityScheduledAt(null);
    } catch (error) {
      console.error("Failed to create activity:", error);
      activityToasts.createFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsSavingActivity(false);
    }
  }, [createActivity, leadId, activityType, activityTitle, activityDescription, activityScheduledAt]);

  const handleOpenCompleteModal = useCallback((activityId: Id<"activities">) => {
    setCompletingActivityId(activityId);
    setCompletionNotes("");
  }, []);

  const handleCloseCompleteModal = useCallback(() => {
    setCompletingActivityId(null);
    setCompletionNotes("");
  }, []);

  const handleMarkComplete = useCallback(async () => {
    if (!completingActivityId || !completionNotes.trim()) return;
    setIsMarkingComplete(true);
    try {
      await markActivityComplete({
        activityId: completingActivityId,
        completionNotes: completionNotes.trim(),
      });
      activityToasts.completed("Activity");
      // Trigger celebration animation
      const cid = completingActivityId;
      setCelebratingIds((prev) => new Set([...prev, cid]));
      setTimeout(() => {
        setCelebratingIds((prev) => {
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
      }, 1600);
      handleCloseCompleteModal();
    } catch (error) {
      console.error("Failed to mark activity complete:", error);
      activityToasts.completeFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsMarkingComplete(false);
    }
  }, [completingActivityId, completionNotes, markActivityComplete, handleCloseCompleteModal]);

  const handleAttachProperties = useCallback(async () => {
    if (selectedPropertyIds.size === 0) return;
    setIsAttaching(true);
    try {
      for (const propertyId of selectedPropertyIds) {
        await attachProperty({
          leadId,
          propertyId: propertyId as Id<"properties">,
          matchType,
        });
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
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
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

  // Filter properties for search (only computed when drawer is open and properties are loaded)
  const filteredProperties = properties?.filter(
    (p) =>
      p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
      p.location.toLowerCase().includes(propertySearch.toLowerCase())
  );

  // Get attached property IDs
  const attachedPropertyIds = new Set(matches?.map((m) => m.propertyId) ?? []);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Leads", href: "/app/leads" },
          { label: lead.fullName },
        ]}
      />
      {/* #47: Hero card entrance + hover lift */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
      >
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
            {/* #21: Area tags with stagger entrance */}
            {lead.preferredAreas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lead.preferredAreas.map((area: string, i: number) => (
                  <motion.span
                    key={area}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.1 + i * 0.04 }}
                    className="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs"
                  >
                    {area}
                  </motion.span>
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
          <div className="min-w-[200px] space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Stage progress</span>
                <span>{stageProgress}%</span>
              </div>
              {/* #20: Stage progress bar with spring fill + shimmer */}
              <div className="mt-2 h-2 rounded-full bg-border overflow-hidden">
                <motion.div
                  className={`h-2 rounded-full relative overflow-hidden ${
                    lead.closedAt && stage?.terminalOutcome === "lost"
                      ? "bg-danger"
                      : "bg-primary"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${stageProgress}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.3 }}
                >
                  <div className="shimmer-overlay" />
                </motion.div>
              </div>
            </div>
            {/* Lead score with expandable breakdown */}
            {scoreBreakdown && (
              <div>
                <button
                  onClick={() => setScoreExpanded((p) => !p)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="flex items-center gap-1.5">
                      Lead Score
                      <svg
                        className={`h-3 w-3 transition-transform duration-200 ${scoreExpanded ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <span
                      className={`font-semibold ${
                        scoreBreakdown.totalScore >= 70
                          ? "text-success"
                          : scoreBreakdown.totalScore >= 40
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {scoreBreakdown.totalScore}/{scoreBreakdown.maxPossible}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-border overflow-hidden">
                    <motion.div
                      className={`h-2 rounded-full relative overflow-hidden ${
                        scoreBreakdown.totalScore >= 70
                          ? "bg-success"
                          : scoreBreakdown.totalScore >= 40
                            ? "bg-warning"
                            : "bg-danger"
                      }`}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${scoreBreakdown.maxPossible > 0 ? (scoreBreakdown.totalScore / scoreBreakdown.maxPossible) * 100 : 0}%`,
                      }}
                      transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.5 }}
                    >
                      <div className="shimmer-overlay" />
                    </motion.div>
                  </div>
                </button>
                <AnimatePresence>
                  {scoreExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-1">
                        {scoreBreakdown.breakdown.map((item) => (
                          <div key={item.key} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-text-muted">
                              {item.met ? (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                              ) : (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-border" />
                              )}
                              {item.label}
                            </span>
                            <span className={item.met ? "font-medium text-success" : "text-text-dim"}>
                              {item.points}/{item.maxPoints}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StaggeredDropDown
            className="max-w-xs"
            value={lead.stageId}
            onChange={(val) => handleStageChange(val as Id<"pipelineStages">)}
            options={stages?.map((s) => ({ value: s._id, label: s.name })) ?? []}
          />
          {stages?.find((s) => s._id === lead.stageId)?.isTerminal && (
            <>
              <Input
                placeholder="Close reason"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                className="max-w-xs"
              />
              {stages?.find((s) => s._id === lead.stageId)?.terminalOutcome === "won" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Deal value"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className="max-w-[140px]"
                  />
                  <select
                    value={dealCurrency}
                    onChange={(e) => setDealCurrency(e.target.value)}
                    className="h-10 rounded-[10px] border border-border-strong bg-transparent px-2 text-sm text-text outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="ZWL">ZWL</option>
                    <option value="ZAR">ZAR</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
      </motion.div>

      {/* Duplicate Detection Warning */}
      <DuplicateWarning
        email={lead.email}
        phone={lead.phone}
        excludeLeadId={leadId}
      />

      {/* #18: Tab bar with sliding underline indicator */}
      <div className="border-b border-border">
        <div className="flex gap-6 relative">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                activeTab === tab
                  ? "text-text"
                  : "text-text-muted hover:text-text"
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

      {/* #19: Tab content crossfade */}
      <AnimatePresence mode="wait">
      {activeTab === "Timeline" && (
        <motion.div key="timeline" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* #23: Activity form card entrance */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Log activity
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <StaggeredDropDown
                    value={activityType}
                    onChange={(val) => setActivityType(val as typeof activityType)}
                    options={[
                      { value: "call", label: "Call" },
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "email", label: "Email" },
                      { value: "meeting", label: "Meeting" },
                      { value: "viewing", label: "Viewing" },
                      { value: "note", label: "Note" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Title <span className="text-danger">*</span>
                  </Label>
                  <Input
                    placeholder="Title"
                    value={activityTitle}
                    onChange={(e) => setActivityTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <FlipCalendar
                  value={activityScheduledAt}
                  onChange={setActivityScheduledAt}
                  showTime
                  placeholder="Schedule date/time (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={activityDescription}
                  onChange={(e) => setActivityDescription(e.target.value)}
                  placeholder="Description..."
                />
              </div>
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
          </motion.div>
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
              // #22: Timeline entry stagger cascade with hover lift
              <motion.div variants={timelineContainerVariants} initial="hidden" animate="show" className="space-y-4">
                {activities.map((activity) => {
                  const overdue = isActivityOverdue(activity);
                  const celebrating = celebratingIds.has(activity._id);
                  return (
                  <motion.div
                    key={activity._id}
                    variants={timelineItemVariants}
                    layout
                    whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`rounded-[10px] border border-border-strong bg-card-bg/40 p-4 ${
                      overdue ? "overdue-pulse" : ""
                    } ${celebrating ? "celebration-glow" : ""}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{activity.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-info/10 text-info capitalize">
                          {activity.type}
                        </Badge>
                        {celebrating ? (
                          <div className="flex items-center gap-1.5">
                            <CelebrationCheck />
                            <span className="text-xs font-medium text-success">Done!</span>
                          </div>
                        ) : (
                          <Badge
                            className={
                              activity.status === "completed"
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                            }
                          >
                            {activity.status === "completed" ? "Completed" : "To Do"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {activity.description && (
                      <p className="mt-2 text-sm text-text-muted">
                        {activity.description}
                      </p>
                    )}
                    {activity.status === "completed" && activity.completionNotes && (
                      <div className="mt-3 rounded-md border border-success/20 bg-success/5 p-2">
                        <p className="text-xs text-text-muted mb-1">Completion notes:</p>
                        <p className="text-sm">{activity.completionNotes}</p>
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {/* Due date proximity ring */}
                        {activity.status === "todo" && activity.scheduledAt && (
                          <DueDateRing scheduledAt={activity.scheduledAt} createdAt={activity.createdAt} />
                        )}
                        <span className={overdue ? "overdue-breathe text-danger font-medium" : ""}>
                          {activity.scheduledAt
                            ? `Scheduled: ${formatDateTime(activity.scheduledAt)}`
                            : `Created: ${formatDateTime(activity.createdAt)}`}
                        </span>
                        {activity.completedAt && (
                          <span>· Completed: {formatDateTime(activity.completedAt)}</span>
                        )}
                      </div>
                      {activity.status !== "completed" && (
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenCompleteModal(activity._id)}
                        >
                          Mark complete
                        </Button>
                      )}
                    </div>
                  </motion.div>
                  );
                })}
              </motion.div>
            )}
          </Card>
        </motion.div>
      )}

      {activeTab === "Documents" && (
        <motion.div key="documents" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
          >
            <DocumentManager
              leadId={leadId}
              folders={["lead_documentation", "id_copies", "proof_of_funds", "contracts", "mandates_to_sell"]}
            />
          </Suspense>
        </motion.div>
      )}

      {activeTab === "Matched Properties" && (
        <motion.div key="matched" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
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
              // #24: Match card stagger + hover lift
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
                      <span className="text-xs text-text-muted">
                        {match.property?.listingType === "sale" ? "Sale" : "Rent"}
                      </span>
                      <Button
                        variant="secondary"
                        className="h-8 px-2 text-xs"
                        onClick={() => setViewPropertyId(match.propertyId)}
                      >
                        View
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-8 px-2 text-xs text-danger hover:text-danger"
                        onClick={() => handleDetachProperty(match._id)}
                      >
                        Remove
                      </Button>
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
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <PropertySuggestions
            leadId={leadId}
            onCompareSelect={handleOpenComparison}
          />
        </Suspense>
        </motion.div>
      )}

      {/* #25: Notes tab entrance */}
      {activeTab === "Notes" && (
        <motion.div key="notes" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
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
        </motion.div>
      )}
      </AnimatePresence>

      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Attach properties"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">
              {selectedPropertyIds.size > 0
                ? `${selectedPropertyIds.size} selected`
                : "Select properties"}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAttachProperties}
                disabled={isAttaching || selectedPropertyIds.size === 0}
              >
                {isAttaching
                  ? "Attaching..."
                  : `Attach${selectedPropertyIds.size > 0 ? ` (${selectedPropertyIds.size})` : ""}`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Search by title or location..."
            value={propertySearch}
            onChange={(e) => setPropertySearch(e.target.value)}
          />
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
          {/* #22b: Drawer property list stagger */}
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {filteredProperties?.filter((p) => !attachedPropertyIds.has(p._id)).map((property, index) => {
              const isSelected = selectedPropertyIds.has(property._id);
              return (
                <motion.label
                  key={property._id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24, delay: index * 0.04 }}
                  className={`flex items-center gap-3 rounded-[10px] border p-3 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-primary/5 text-text"
                      : "border-border-strong bg-card-bg text-text hover:bg-card-bg/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePropertySelection(property._id)}
                    className="rounded border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text">{property.title}</p>
                    <p className="text-xs text-text-muted">
                      {property.listingType === "sale" ? "Sale" : "Rent"} &middot; {property.location}
                    </p>
                  </div>
                </motion.label>
              );
            })}
            {filteredProperties?.filter((p) => !attachedPropertyIds.has(p._id)).length === 0 && (
              <p className="text-text-muted text-sm py-4">No properties available to attach.</p>
            )}
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
        {/* #48: Contact modal field stagger entrance */}
        <motion.div
          className="grid gap-4 md:grid-cols-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Name</Label>
            <Input value={lead.fullName} readOnly />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Phone</Label>
            <Input value={lead.phone} readOnly />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Email</Label>
            <Input value={lead.email || "Not provided"} readOnly />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Owner</Label>
            <Input value={owner?.fullName || owner?.name || owner?.email || "Unassigned"} readOnly />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Interest</Label>
            <Input value={lead.interestType === "buy" ? "Buying" : "Renting"} readOnly />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }} className="space-y-2">
            <Label>Source</Label>
            <Input value={lead.source.replace("_", " ").replace(/^\w/, (c: string) => c.toUpperCase())} readOnly />
          </motion.div>
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
            <Input
              value={lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "None specified"}
              readOnly
            />
          </div>
        </motion.div>
      </Modal>

      {/* #49: Complete Activity modal entrance */}
      <Modal
        open={completingActivityId !== null}
        title="Complete Activity"
        description="Add notes about what transpired or the next steps"
        onClose={handleCloseCompleteModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCloseCompleteModal}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkComplete}
              disabled={isMarkingComplete || !completionNotes.trim()}
            >
              {isMarkingComplete ? "Saving..." : "Mark Complete"}
            </Button>
          </div>
        }
      >
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
        >
          <div className="space-y-2">
            <Label>
              Completion Notes <span className="text-danger">*</span>
            </Label>
            <Textarea
              placeholder="Describe what happened or what the next steps are..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-text-muted">
              These notes will be visible in the timeline and on the tasks page.
            </p>
          </div>
        </motion.div>
      </Modal>

      {/* Read-only Property View Modal */}
      <Modal
        open={viewPropertyId !== null}
        title={viewProperty ? `Property: ${viewProperty.title}` : "Loading property..."}
        description="Read-only view of property details."
        onClose={() => { setViewPropertyId(null); setViewPropertyTab("Details"); }}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => { setViewPropertyId(null); setViewPropertyTab("Details"); }}>Close</Button>
          </div>
        }
      >
        {viewProperty ? (
          <div className="space-y-5">
            {/* Tab bar */}
            <div className="border-b border-border">
              <div className="flex gap-6 relative">
                {viewPropertyTabs.map((tab) => (
                  <button
                    key={tab}
                    className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                      viewPropertyTab === tab
                        ? "text-text"
                        : "text-text-muted hover:text-text"
                    }`}
                    onClick={() => setViewPropertyTab(tab)}
                  >
                    {tab}
                    {viewPropertyTab === tab && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                        layoutId="view-property-tab-indicator"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {viewPropertyTab === "Details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                  className="space-y-6"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Title */}
                    <div className="space-y-2 md:col-span-2">
                      <Label className="flex items-center gap-1">
                        Title <span className="text-danger">*</span>
                      </Label>
                      <Input value={viewProperty.title} readOnly />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <StaggeredDropDown
                        value={viewProperty.type}
                        onChange={() => {}}
                        disabled
                        options={[
                          { value: "house", label: "House" },
                          { value: "apartment", label: "Apartment" },
                          { value: "land", label: "Land" },
                          { value: "commercial", label: "Commercial" },
                          { value: "other", label: "Other" },
                        ]}
                      />
                    </div>

                    {/* Listing */}
                    <div className="space-y-2">
                      <Label>Listing</Label>
                      <StaggeredDropDown
                        value={viewProperty.listingType}
                        onChange={() => {}}
                        disabled
                        options={[
                          { value: "sale", label: "Sale" },
                          { value: "rent", label: "Rent" },
                        ]}
                      />
                    </div>

                    {/* Price */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Price <span className="text-danger">*</span>
                      </Label>
                      <CurrencyInput
                        value={viewProperty.price.toString()}
                        onChange={() => {}}
                        currency={viewProperty.currency}
                        onCurrencyChange={() => {}}
                        disabled
                      />
                    </div>

                    {/* Location */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Location <span className="text-danger">*</span>
                      </Label>
                      <Input value={viewProperty.location} readOnly />
                    </div>

                    {/* Area */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Area (m²) <span className="text-danger">*</span>
                      </Label>
                      <Input value={viewProperty.area?.toString() || "-"} readOnly />
                    </div>

                    {/* Bedrooms */}
                    <div className="space-y-2">
                      <Label>Bedrooms</Label>
                      <Input value={viewProperty.bedrooms?.toString() || "-"} readOnly />
                    </div>

                    {/* Bathrooms */}
                    <div className="space-y-2">
                      <Label>Bathrooms</Label>
                      <Input value={viewProperty.bathrooms?.toString() || "-"} readOnly />
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <StaggeredDropDown
                        value={viewProperty.status}
                        onChange={() => {}}
                        disabled
                        options={[
                          { value: "available", label: "Available" },
                          { value: "under_offer", label: "Under Offer" },
                          { value: "let", label: "Let" },
                          { value: "sold", label: "Sold" },
                          { value: "off_market", label: "Off Market" },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  {viewProperty.description && (
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea value={viewProperty.description} readOnly />
                    </div>
                  )}
                </motion.div>
              )}

              {viewPropertyTab === "Documentation" && (
                <motion.div
                  key="documentation"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                >
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    }
                  >
                    <DocumentManager
                      propertyId={viewPropertyId as Id<"properties">}
                      folders={["mandates_to_sell", "contracts", "id_copies", "proof_of_funds"]}
                    />
                  </Suspense>
                </motion.div>
              )}

              {viewPropertyTab === "Gallery" && (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                  className="space-y-2"
                >
                  <Label className="flex items-center gap-1">
                    Images <span className="text-danger">*</span>
                  </Label>
                  <ImageUpload
                    images={(viewProperty.images || []).map((url: string) => ({ url }))}
                    onChange={() => {}}
                    minImages={2}
                    maxImages={10}
                    disabled
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}
      </Modal>

      {comparisonOpen && (
        <Suspense fallback={null}>
          <PropertyComparison
            open={comparisonOpen}
            onClose={() => {
              setComparisonOpen(false);
              setComparisonPropertyIds([]);
            }}
            propertyIds={comparisonPropertyIds}
            leadId={leadId}
          />
        </Suspense>
      )}
    </div>
  );
}
