"use client";

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { useRequireAuth } from "@/hooks/useAuth";
import { leadToasts } from "@/lib/toast";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { Eye, Trash2, ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Columns3 } from "lucide-react";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { KanbanBoard } from "@/components/leads/kanban-board";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const BulkMatching = lazy(() =>
  import("@/components/leads/bulk-matching").then((m) => ({ default: m.BulkMatching }))
);


interface LeadRowData {
  _id: Id<"leads">;
  contactId: Id<"contacts">;
  fullName: string;
  phone: string;
  interestType: string;
  score?: number;
  stageId: Id<"pipelineStages">;
  ownerName: string;
  updatedAt: number;
  closedAt?: number;
  closeReason?: string;
  propertyTitle?: string | null;
}

const LeadTableRow = React.memo(function LeadTableRow({
  lead,
  stages,
  onStageChange,
  onDelete,
  onRowClick,
}: {
  lead: LeadRowData;
  stages: { _id: string; name: string }[] | undefined;
  onStageChange: (leadId: Id<"leads">, stageId: Id<"pipelineStages">) => void;
  onDelete: (lead: LeadRowData) => void;
  onRowClick: (lead: LeadRowData) => void;
}) {
  return (
    <motion.tr
      variants={rowVariants}
      className="group h-11 cursor-pointer border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)]"
      onClick={() => onRowClick(lead)}
    >
      <TableCell>
        <Link href={`/app/leads/${lead._id}`} className="font-medium hover:text-primary">
          {lead.fullName}
        </Link>
        <p className="text-xs text-text-muted">{lead.phone}</p>
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            lead.interestType === "buy" ? "bg-primary/10 text-primary" : "bg-info/10 text-info"
          }`}
        >
          {lead.interestType === "buy" ? "Buy" : "Rent"}
        </span>
      </TableCell>
      <TableCell>
        <ScoreBadge score={lead.score} />
      </TableCell>
      <TableCell>
        <div onClick={(e) => e.stopPropagation()}>
          <StaggeredDropDown
            value={lead.stageId}
            onChange={(val) => onStageChange(lead._id, val as Id<"pipelineStages">)}
            aria-label={`Update stage for ${lead.fullName}`}
            portal
            disabled={!!(lead.closedAt && lead.closeReason)}
            options={stages?.map((stage) => ({ value: stage._id, label: stage.name })) ?? []}
          />
        </div>
      </TableCell>
      <TableCell>{lead.ownerName}</TableCell>
      <TableCell>
        {lead.propertyTitle ? (
          <span className="text-sm text-text">{lead.propertyTitle}</span>
        ) : (
          <span className="text-xs text-text-dim">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Tooltip content="View">
            <Button
              variant="secondary"
              className="action-btn h-9 w-9 p-0 md:opacity-0 md:translate-x-3 md:scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out"
              style={{ transitionDelay: "0ms" }}
              onClick={(e) => { e.stopPropagation(); onRowClick(lead); }}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button
              variant="secondary"
              className="action-btn h-9 w-9 p-0 text-danger hover:text-danger hover:bg-danger/10 md:opacity-0 md:translate-x-3 md:scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out"
              style={{ transitionDelay: "40ms" }}
              onClick={(e) => { e.stopPropagation(); onDelete(lead); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </TableCell>
    </motion.tr>
  );
});

function ScoreBadge({ score }: { score: number | undefined }) {
  if (score === undefined || score === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs text-text-dim">
        --
      </span>
    );
  }

  const color =
    score >= 70
      ? "bg-success/15 text-success"
      : score >= 40
        ? "bg-warning/15 text-warning"
        : "bg-danger/15 text-danger";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger"
        }`}
      />
      {score}
    </span>
  );
}

export default function LeadsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();
  const pagination = usePagination(50);

  // View mode state
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  // Filter state
  const [stageFilter, setStageFilter] = useState<string>("");
  const [interestFilter, setInterestFilter] = useState<string>("");
  const [propertyFilter, setPropertyFilter] = useState<string>("");
  const [contactNameFilter, setContactNameFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<string>("");
  const [debouncedContactName, setDebouncedContactName] = useState("");

  // Sort state
  const [scoreSortDir, setScoreSortDir] = useState<"" | "score_asc" | "score_desc">("");

  // Bulk matching modal state
  const [bulkMatchingOpen, setBulkMatchingOpen] = useState(false);

  // Delete lead modal state
  const [deleteTarget, setDeleteTarget] = useState<LeadRowData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Sibling leads resolution state (when won/under contract from table)
  const [siblingTriggerLead, setSiblingTriggerLead] = useState<LeadRowData | null>(null);
  const [siblingLeadsToClose, setSiblingLeadsToClose] = useState<Set<string>>(new Set());
  const [isClosingSiblings, setIsClosingSiblings] = useState(false);
  const [siblingCloseConfirmText, setSiblingCloseConfirmText] = useState("");

  // Debounce contact name search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedContactName(contactNameFilter); pagination.resetPage(); }, 300);
    return () => clearTimeout(timer);
  }, [contactNameFilter]);

  // Derive score range from filter
  const scoreRange = useMemo(() => {
    switch (scoreFilter) {
      case "high": return { scoreMin: 70, scoreMax: undefined };
      case "medium": return { scoreMin: 40, scoreMax: 69 };
      case "low": return { scoreMin: 0, scoreMax: 39 };
      case "unscored": return { scoreMin: 0, scoreMax: 0 };
      default: return { scoreMin: undefined, scoreMax: undefined };
    }
  }, [scoreFilter]);

  // Queries
  const stages = useQuery(api.stages.list);
  const users = useQuery(api.users.listActiveUsers, isAdmin ? {} : "skip");
  const properties = useQuery(api.properties.list, {});
  const propertiesList = useMemo(() => {
    if (!properties) return [];
    const items = (properties as any)?.items ?? (Array.isArray(properties) ? properties : []);
    return items as { _id: Id<"properties">; title: string }[];
  }, [properties]);

  const leadsResult = useQuery(api.leads.list, {
    stageId: stageFilter ? (stageFilter as Id<"pipelineStages">) : undefined,
    interestType:
      interestFilter === "rent" || interestFilter === "buy"
        ? interestFilter
        : undefined,
    propertyId: propertyFilter ? (propertyFilter as Id<"properties">) : undefined,
    q: debouncedContactName || undefined,
    ownerUserId: ownerFilter ? (ownerFilter as Id<"users">) : undefined,
    scoreMin: scoreRange.scoreMin,
    scoreMax: scoreRange.scoreMax,
    sortBy: scoreSortDir || undefined,
    page: pagination.page > 0 ? pagination.page : undefined,
    pageSize: pagination.pageSize !== 50 ? pagination.pageSize : undefined,
  });

  // Kanban query (only active in kanban mode)
  const kanbanData = useQuery(
    api.leads.listByStage,
    viewMode === "kanban"
      ? {
          interestType:
            interestFilter === "rent" || interestFilter === "buy"
              ? interestFilter
              : undefined,
          q: debouncedContactName || undefined,
          ownerUserId: ownerFilter ? (ownerFilter as Id<"users">) : undefined,
          scoreMin: scoreRange.scoreMin,
          scoreMax: scoreRange.scoreMax,
        }
      : "skip"
  );

  // Sibling leads query (for resolution modal)
  const siblingLeads = useQuery(
    api.leads.getOpenLeadsForContact,
    siblingTriggerLead
      ? { contactId: siblingTriggerLead.contactId, excludeLeadId: siblingTriggerLead._id }
      : "skip"
  );

  // Support both paginated and legacy response format
  const leads = useMemo(() => {
    if (!leadsResult) return undefined;
    return (leadsResult as any).items ?? (Array.isArray(leadsResult) ? leadsResult : []);
  }, [leadsResult]);
  const totalCount = (leadsResult as any)?.totalCount ?? leads?.length ?? 0;
  const hasMore = (leadsResult as any)?.hasMore ?? false;

  // Mutations
  const moveStage = useMutation(api.leads.moveStage);
  const bulkCloseAsLost = useMutation(api.leads.bulkCloseAsLost);
  const deleteLeadMutation = useMutation(api.leads.deleteLead);

  const handleDeleteLead = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLeadMutation({ leadId: deleteTarget._id });
      leadToasts.stageMoved("Lead deleted");
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (error) {
      console.error("Failed to delete lead:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteLeadMutation]);

  const handleStageChange = useCallback(async (
    leadId: Id<"leads">,
    newStageId: Id<"pipelineStages">
  ) => {
    const stage = stages?.find((s) => s._id === newStageId);
    try {
      await moveStage({ leadId, stageId: newStageId });
      const stageName = stage?.name || "new stage";
      leadToasts.stageMoved(stageName);

      // Show sibling leads modal when won or under contract
      const isWon = stage?.isTerminal && stage?.terminalOutcome === "won";
      const isUnderContract = !stage?.isTerminal && stage?.name.toLowerCase() === "under contract";
      if (isWon || isUnderContract) {
        const triggerLead = leads?.find((l: LeadRowData) => l._id === leadId);
        if (triggerLead) {
          setSiblingTriggerLead(triggerLead);
          setSiblingLeadsToClose(new Set());
          setSiblingCloseConfirmText("");
        }
      }
    } catch (error) {
      console.error("Failed to update stage:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    }
  }, [moveStage, stages, leads]);

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
      setSiblingTriggerLead(null);
      return;
    }
    setIsClosingSiblings(true);
    try {
      await bulkCloseAsLost({
        leadIds: Array.from(siblingLeadsToClose) as Id<"leads">[],
        closeReason: "Contact chose another property",
      });
      leadToasts.stageMoved(`${siblingLeadsToClose.size} lead(s) marked as lost`);
      setSiblingTriggerLead(null);
      setSiblingLeadsToClose(new Set());
      setSiblingCloseConfirmText("");
    } catch (error) {
      console.error("Failed to close sibling leads:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsClosingSiblings(false);
    }
  }, [siblingLeadsToClose, bulkCloseAsLost]);

  // Handle sibling resolution from kanban drag-and-drop
  const handleKanbanSiblingResolution = useCallback((lead: { _id: Id<"leads">; contactId: Id<"contacts">; fullName: string }) => {
    setSiblingTriggerLead({
      _id: lead._id,
      contactId: lead.contactId,
      fullName: lead.fullName,
      phone: "",
      interestType: "",
      score: undefined,
      stageId: "" as Id<"pipelineStages">,
      ownerName: "",
      updatedAt: 0,
    });
    setSiblingLeadsToClose(new Set());
    setSiblingCloseConfirmText("");
  }, []);

  const toggleScoreSort = useCallback(() => {
    setScoreSortDir((prev) => {
      if (prev === "") return "score_desc";
      if (prev === "score_desc") return "score_asc";
      return "";
    });
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

  return (
    <div className="space-y-6">
      {/* #31: Header entrance */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-lg font-semibold">Leads</h2>
          <p className="text-sm text-text-muted">
            Manage your leads and track their progress through the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-[10px] border border-border-strong bg-card-bg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                viewMode === "list"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                viewMode === "kanban"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </button>
          </div>
          <Button variant="secondary" onClick={() => setBulkMatchingOpen(true)}>
            Bulk Match
          </Button>
          <Link
            href="/app/leads/new"
            className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
          >
            <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary"
              >
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-sm font-medium">New Lead</span>
          </Link>
        </div>
      </motion.div>

      {/* #32: Filter panel entrance */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.06 }}
        className="rounded-[12px] border border-border-strong bg-card-bg p-4"
      >
        <div className={`grid gap-3 ${viewMode === "kanban" ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-6"}`}>
          {viewMode === "list" && (
            <div className="space-y-2">
              <Label>Stage</Label>
              <StaggeredDropDown
                value={stageFilter}
                onChange={(val) => setStageFilter(val)}
                options={[
                  { value: "", label: "All stages" },
                  ...(stages?.map((stage) => ({ value: stage._id, label: stage.name })) ?? []),
                ]}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Interest type</Label>
            <StaggeredDropDown
              value={interestFilter}
              onChange={(val) => setInterestFilter(val)}
              options={[
                { value: "", label: "Rent / Buy" },
                { value: "rent", label: "Rent" },
                { value: "buy", label: "Buy" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Lead Score</Label>
            <StaggeredDropDown
              value={scoreFilter}
              onChange={(val) => setScoreFilter(val)}
              options={[
                { value: "", label: "All scores" },
                { value: "high", label: "Hot (70+)" },
                { value: "medium", label: "Warm (40–69)" },
                { value: "low", label: "Cold (0–39)" },
                { value: "unscored", label: "Not scored" },
              ]}
            />
          </div>
          {viewMode === "list" && (
            <div className="space-y-2">
              <Label>Property</Label>
              <StaggeredDropDown
                value={propertyFilter}
                onChange={(val) => setPropertyFilter(val)}
                options={[
                  { value: "", label: "All properties" },
                  ...(propertiesList.map((p) => ({ value: p._id, label: p.title })) ?? []),
                ]}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Contact name</Label>
            <Input
              placeholder="Search by name, phone"
              value={contactNameFilter}
              onChange={(e) => setContactNameFilter(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label>Owner</Label>
              <StaggeredDropDown
                value={ownerFilter}
                onChange={(val) => setOwnerFilter(val)}
                options={[
                  { value: "", label: "All owners" },
                  ...(users?.map((u) => ({ value: u._id, label: u.name })) ?? []),
                ]}
              />
            </div>
          )}
        </div>
      </motion.div>

      {viewMode === "kanban" ? (
        /* ── Kanban Board View ── */
        kanbanData === undefined ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <ErrorBoundary sectionName="Kanban Board">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
            >
              <KanbanBoard
                stages={kanbanData.stages}
                columns={kanbanData.columns}
                onSiblingResolution={handleKanbanSiblingResolution}
              />
            </motion.div>
          </ErrorBoundary>
        )
      ) : (
        /* ── List View ── */
        leads === undefined ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : leads.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="text-center py-12"
          >
            <p className="text-text-muted">No leads found.</p>
            <Link href="/app/leads/new">
              <Button className="mt-4">Create your first lead</Button>
            </Link>
          </motion.div>
        ) : (
          <ErrorBoundary sectionName="Lead Table">
            <Table>
              <thead>
                <tr>
                  <TableHead>Contact</TableHead>
                  <TableHead>Interest</TableHead>
                  <TableHead>
                    <button
                      onClick={toggleScoreSort}
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      Score
                      {scoreSortDir === "" && <ArrowUpDown className="h-3 w-3 text-text-dim" />}
                      {scoreSortDir === "score_desc" && <ArrowDown className="h-3 w-3 text-primary" />}
                      {scoreSortDir === "score_asc" && <ArrowUp className="h-3 w-3 text-primary" />}
                    </button>
                  </TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Actions</TableHead>
                </tr>
              </thead>
              <motion.tbody
                variants={listVariants}
                initial="hidden"
                animate="show"
                key="data"
              >
                {leads.map((lead: LeadRowData) => (
                  <LeadTableRow
                    key={lead._id}
                    lead={lead}
                    stages={stages}
                    onStageChange={handleStageChange}
                    onDelete={(l) => { setDeleteTarget(l); setDeleteConfirmText(""); }}
                    onRowClick={(l) => router.push(`/app/leads/${l._id}`)}
                  />
                ))}
              </motion.tbody>
            </Table>
            <PaginationControls
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalCount={totalCount}
              hasMore={hasMore}
              onNextPage={pagination.nextPage}
              onPrevPage={pagination.prevPage}
            />
          </ErrorBoundary>
        )
      )}

      {bulkMatchingOpen && (
        <Suspense fallback={null}>
          <BulkMatching
            open={bulkMatchingOpen}
            onClose={() => setBulkMatchingOpen(false)}
          />
        </Suspense>
      )}

      {/* Delete lead confirmation modal */}
      <Modal
        open={deleteTarget !== null}
        title="Delete lead"
        description="This action cannot be undone. This will permanently delete the lead, its activities, and free any attached properties."
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteLead}
              disabled={isDeleting || !deleteTarget || deleteConfirmText !== (deleteTarget?.propertyTitle ? `delete lead ${deleteTarget.fullName.toLowerCase()} for ${deleteTarget.propertyTitle.toLowerCase()}` : "delete my lead")}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete lead"}
            </Button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-danger/20 bg-danger/5 p-3">
              <p className="text-sm font-medium text-text">{deleteTarget.fullName}</p>
              {deleteTarget.propertyTitle && (
                <p className="text-xs text-text-muted mt-0.5">Property: {deleteTarget.propertyTitle}</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Type{" "}
                <span className="font-mono font-medium text-text">
                  {deleteTarget.propertyTitle
                    ? `delete lead ${deleteTarget.fullName.toLowerCase()} for ${deleteTarget.propertyTitle.toLowerCase()}`
                    : "delete my lead"}
                </span>{" "}
                to confirm
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={
                  deleteTarget.propertyTitle
                    ? `delete lead ${deleteTarget.fullName.toLowerCase()} for ${deleteTarget.propertyTitle.toLowerCase()}`
                    : "delete my lead"
                }
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Sibling leads resolution modal (under contract / won from table) */}
      <Modal
        open={siblingTriggerLead !== null}
        title="Resolve other leads for this contact"
        description={siblingTriggerLead ? `${siblingTriggerLead.fullName} has other open leads. Select which ones to mark as lost, or keep them open.` : ""}
        onClose={() => { setSiblingTriggerLead(null); setSiblingCloseConfirmText(""); }}
        footer={
          <div className="space-y-3">
            {siblingLeadsToClose.size > 0 && siblingTriggerLead && (
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  Type <span className="font-mono font-medium text-text">close leads for {siblingTriggerLead.fullName.toLowerCase()}</span> to confirm
                </p>
                <Input
                  value={siblingCloseConfirmText}
                  onChange={(e) => setSiblingCloseConfirmText(e.target.value)}
                  placeholder={`close leads for ${siblingTriggerLead.fullName.toLowerCase()}`}
                  className="font-mono text-sm"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-muted">
                {siblingLeadsToClose.size > 0 ? `${siblingLeadsToClose.size} selected to close` : "None selected"}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setSiblingTriggerLead(null); setSiblingCloseConfirmText(""); }} disabled={isClosingSiblings}>
                  Keep all open
                </Button>
                <Button
                  onClick={handleCloseSiblingLeads}
                  disabled={isClosingSiblings || siblingLeadsToClose.size === 0 || (siblingTriggerLead ? siblingCloseConfirmText !== `close leads for ${siblingTriggerLead.fullName.toLowerCase()}` : true)}
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
    </div>
  );
}
