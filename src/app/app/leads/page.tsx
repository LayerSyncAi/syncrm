"use client";

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";
import { leadToasts } from "@/lib/toast";

const BulkMatching = lazy(() =>
  import("@/components/leads/bulk-matching").then((m) => ({ default: m.BulkMatching }))
);

export default function LeadsPage() {
  const { user, isLoading: authLoading, isAdmin } = useRequireAuth();

  // Filter state
  const [stageFilter, setStageFilter] = useState<string>("");
  const [interestFilter, setInterestFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedArea, setDebouncedArea] = useState("");

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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
          <Link href="/app/leads/new">
            <Button>+ New Lead</Button>
          </Link>
        </div>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="">All stages</option>
              {stages?.map((stage) => (
                <option key={stage._id} value={stage._id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Interest type</Label>
            <Select
              value={interestFilter}
              onChange={(e) => setInterestFilter(e.target.value)}
            >
              <option value="">Rent / Buy</option>
              <option value="rent">Rent</option>
              <option value="buy">Buy</option>
            </Select>
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
              <Select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
              >
                <option value="">All owners</option>
                {users?.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      {leads === undefined ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No leads found.</p>
          <Link href="/app/leads/new">
            <Button className="mt-4">Create your first lead</Button>
          </Link>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Contact</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Preferred Areas</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <TableRow key={lead._id}>
                <TableCell>
                  <Link
                    href={`/app/leads/${lead._id}`}
                    className="font-medium hover:text-primary"
                  >
                    {lead.fullName}
                  </Link>
                  <p className="text-xs text-text-muted">{lead.phone}</p>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      lead.interestType === "buy"
                        ? "bg-primary/10 text-primary"
                        : "bg-info/10 text-info"
                    }`}
                  >
                    {lead.interestType === "buy" ? "Buy" : "Rent"}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-text-muted max-w-[150px] truncate">
                    {lead.preferredAreas.length > 0
                      ? lead.preferredAreas.join(", ")
                      : "None specified"}
                  </p>
                </TableCell>
                <TableCell>
                  <Select
                    value={lead.stageId}
                    onChange={(e) =>
                      handleStageChange(
                        lead._id,
                        e.target.value as Id<"pipelineStages">
                      )
                    }
                    aria-label={`Update stage for ${lead.fullName}`}
                    className="h-9"
                  >
                    {stages?.map((stage) => (
                      <option key={stage._id} value={stage._id}>
                        {stage.name}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>{lead.ownerName}</TableCell>
                <TableCell>{formatDate(lead.updatedAt)}</TableCell>
                <TableCell>
                  <Link href={`/app/leads/${lead._id}`}>
                    <Button variant="secondary" className="h-9 px-3">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

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
