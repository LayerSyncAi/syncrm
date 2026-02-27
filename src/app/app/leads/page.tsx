"use client";

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { useRequireAuth } from "@/hooks/useAuth";
import { leadToasts } from "@/lib/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const BulkMatching = lazy(() =>
  import("@/components/leads/bulk-matching").then((m) => ({ default: m.BulkMatching }))
);

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
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Filter state
  const [stageFilter, setStageFilter] = useState<string>("");
  const [interestFilter, setInterestFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedArea, setDebouncedArea] = useState("");

  // Sort state
  const [scoreSortDir, setScoreSortDir] = useState<"" | "score_asc" | "score_desc">("");

  // Bulk matching modal state
  const [bulkMatchingOpen, setBulkMatchingOpen] = useState(false);

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchFilter), 300);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedArea(areaFilter), 300);
    return () => clearTimeout(timer);
  }, [areaFilter]);

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
  const users = useQuery(
    api.users.listActiveUsers,
    isAdmin ? {} : "skip"
  );
  const leads = useQuery(api.leads.list, {
    stageId: stageFilter ? (stageFilter as Id<"pipelineStages">) : undefined,
    interestType:
      interestFilter === "rent" || interestFilter === "buy"
        ? interestFilter
        : undefined,
    preferredAreaKeyword: debouncedArea || undefined,
    q: debouncedSearch || undefined,
    ownerUserId: ownerFilter ? (ownerFilter as Id<"users">) : undefined,
    scoreMin: scoreRange.scoreMin,
    scoreMax: scoreRange.scoreMax,
    sortBy: scoreSortDir || undefined,
  });

  // Mutations
  const moveStage = useMutation(api.leads.moveStage);

  const handleStageChange = async (
    leadId: Id<"leads">,
    newStageId: Id<"pipelineStages">
  ) => {
    try {
      await moveStage({ leadId, stageId: newStageId });
      const stageName = stages?.find((s) => s._id === newStageId)?.name || "new stage";
      leadToasts.stageMoved(stageName);
    } catch (error) {
      console.error("Failed to update stage:", error);
      leadToasts.stageMoveFailed(error instanceof Error ? error.message : undefined);
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

  const toggleScoreSort = useCallback(() => {
    setScoreSortDir((prev) => {
      if (prev === "") return "score_desc";
      if (prev === "score_desc") return "score_asc";
      return "";
    });
  }, []);

  // Column definitions for DataTable
  type Lead = NonNullable<typeof leads>[number];
  const leadsColumns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: "contact",
        header: "Contact",
        accessor: (lead) => `${lead.fullName} ${lead.phone}`,
        searchable: true,
        cell: (lead) => (
          <>
            <Link
              href={`/app/leads/${lead._id}`}
              className="font-medium hover:text-primary"
            >
              {lead.fullName}
            </Link>
            <p className="text-xs text-text-muted">{lead.phone}</p>
          </>
        ),
      },
      {
        id: "interest",
        header: "Interest",
        accessor: (lead) => lead.interestType,
        searchable: true,
        cell: (lead) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              lead.interestType === "buy"
                ? "bg-primary/10 text-primary"
                : "bg-info/10 text-info"
            }`}
          >
            {lead.interestType === "buy" ? "Buy" : "Rent"}
          </span>
        ),
      },
      {
        id: "score",
        header: "Score",
        accessor: (lead) => lead.score ?? null,
        searchable: true,
        headerContent: (
          <button
            onClick={toggleScoreSort}
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            Score
            {scoreSortDir === "" && <ArrowUpDown className="h-3 w-3 text-text-dim" />}
            {scoreSortDir === "score_desc" && <ArrowDown className="h-3 w-3 text-primary" />}
            {scoreSortDir === "score_asc" && <ArrowUp className="h-3 w-3 text-primary" />}
          </button>
        ),
        cell: (lead) => <ScoreBadge score={lead.score} />,
      },
      {
        id: "stage",
        header: "Stage",
        accessor: (lead) => lead.stageName,
        searchable: true,
        cell: (lead) => (
          <StaggeredDropDown
            value={lead.stageId}
            onChange={(val) =>
              handleStageChange(lead._id, val as Id<"pipelineStages">)
            }
            aria-label={`Update stage for ${lead.fullName}`}
            portal
            options={
              stages?.map((stage) => ({
                value: stage._id,
                label: stage.name,
              })) ?? []
            }
          />
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessor: (lead) => lead.ownerName,
        searchable: true,
        cell: (lead) => <>{lead.ownerName}</>,
      },
      {
        id: "updated",
        header: "Updated",
        accessor: (lead) => formatDate(lead.updatedAt),
        searchable: true,
        cell: (lead) => <>{formatDate(lead.updatedAt)}</>,
      },
      {
        id: "actions",
        header: "Actions",
        cellClassName: "text-right",
        headerClassName: "text-right",
        cell: (lead) => (
          <div className="flex justify-end">
            <Tooltip content="View">
              <Link
                href={`/app/leads/${lead._id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="secondary"
                  className="action-btn h-9 w-9 p-0 opacity-0 translate-x-3 scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out"
                  style={{ transitionDelay: "0ms" }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
            </Tooltip>
          </div>
        ),
      },
    ],
    [stages, scoreSortDir, toggleScoreSort, handleStageChange, formatDate]
  );

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

  // Filter stages for dropdown (non-terminal for regular stage selection)
  const nonTerminalStages = stages?.filter((s) => !s.isTerminal) ?? [];

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
        <div className="flex gap-2">
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
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
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
          <div className="space-y-2">
            <Label>Location keyword</Label>
            <Input
              placeholder="Avondale"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Name, phone"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
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

      <DataTable
        columns={leadsColumns}
        data={leads}
        keyAccessor={(lead) => lead._id}
        emptyMessage="No leads found."
        emptyAction={
          <Link href="/app/leads/new">
            <Button>Create your first lead</Button>
          </Link>
        }
      />

      {bulkMatchingOpen && (
        <Suspense fallback={null}>
          <BulkMatching
            open={bulkMatchingOpen}
            onClose={() => setBulkMatchingOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
