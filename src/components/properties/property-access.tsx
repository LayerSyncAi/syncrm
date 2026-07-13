"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

interface PropertyAccessProps {
  propertyId: Id<"properties">;
  /** Whether the current user may reassign ownership / manage collaborators. */
  canManage: boolean;
  /** Whether the current user is an admin (can reassign ownership). */
  isAdmin: boolean;
  ownershipType?: "agent" | "multiple" | "company";
  ownerUserIds?: Id<"users">[];
  ownerNames?: string[];
}

/**
 * Ownership + collaborator panel for a property. Rendered in the property
 * detail modal. Owners and admins manage collaborators; admins (and owners)
 * can also reassign ownership. All actions are enforced server-side too.
 */
export function PropertyAccess({
  propertyId,
  canManage,
  isAdmin,
  ownershipType,
  ownerUserIds = [],
  ownerNames = [],
}: PropertyAccessProps) {
  const agents = useQuery(api.users.listForAssignment) ?? [];
  const collaborators = useQuery(api.properties.listCollaborators, { propertyId });

  const addCollaborator = useMutation(api.properties.addCollaborator);
  const removeCollaborator = useMutation(api.properties.removeCollaborator);
  const reassignOwnership = useMutation(api.properties.reassignOwnership);

  const [busy, setBusy] = React.useState(false);
  const [selectedAgent, setSelectedAgent] = React.useState<string>("");

  // Ownership reassignment local state (admin only).
  const [reassigning, setReassigning] = React.useState(false);
  const [ownershipMode, setOwnershipMode] = React.useState<"company" | "agents">(
    ownershipType === "company" || !ownershipType ? "company" : "agents"
  );
  const [pendingOwners, setPendingOwners] =
    React.useState<Id<"users">[]>(ownerUserIds);

  React.useEffect(() => {
    setOwnershipMode(
      ownershipType === "company" || !ownershipType ? "company" : "agents"
    );
    setPendingOwners(ownerUserIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownershipType, JSON.stringify(ownerUserIds)]);

  const ownerSummary =
    ownershipType === "company"
      ? "Company (no individual agent owner)"
      : ownerNames.length > 0
        ? ownerNames.join(", ")
        : "Unassigned";

  const collaboratorAgentIds = new Set(
    (collaborators ?? []).map((c) => c.agentId)
  );

  // Agents eligible to be added as collaborators (not already an owner or collaborator).
  const eligibleAgents = agents.filter(
    (a) =>
      !ownerUserIds.includes(a._id as Id<"users">) &&
      !collaboratorAgentIds.has(a._id as Id<"users">)
  );

  const handleAdd = async () => {
    if (!selectedAgent) return;
    setBusy(true);
    try {
      await addCollaborator({
        propertyId,
        agentId: selectedAgent as Id<"users">,
      });
      toast.success("Collaborator added");
      setSelectedAgent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add collaborator");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (agentId: Id<"users">) => {
    setBusy(true);
    try {
      await removeCollaborator({ propertyId, agentId });
      toast.success("Collaborator removed");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to remove collaborator"
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePendingOwner = (id: Id<"users">) =>
    setPendingOwners((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleReassign = async () => {
    setBusy(true);
    try {
      await reassignOwnership({
        propertyId,
        ownerUserIds: ownershipMode === "company" ? [] : pendingOwners,
      });
      toast.success("Ownership updated");
      setReassigning(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reassign ownership");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ownership */}
      <div className="space-y-3 rounded-lg border border-border-strong bg-surface-2/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <Label className="m-0">Ownership</Label>
          </div>
          {isAdmin && !reassigning && (
            <Button
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={() => setReassigning(true)}
            >
              Reassign
            </Button>
          )}
        </div>

        {!reassigning ? (
          <p className="text-sm text-text">{ownerSummary}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOwnershipMode("company")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  ownershipMode === "company"
                    ? "border-primary bg-primary text-white"
                    : "border-border-strong bg-card-bg text-text-muted hover:border-primary/60"
                }`}
              >
                Company
              </button>
              <button
                type="button"
                onClick={() => setOwnershipMode("agents")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  ownershipMode === "agents"
                    ? "border-primary bg-primary text-white"
                    : "border-border-strong bg-card-bg text-text-muted hover:border-primary/60"
                }`}
              >
                Specific agent(s)
              </button>
            </div>
            {ownershipMode === "agents" && (
              <div className="flex flex-wrap gap-2">
                {agents.map((a) => {
                  const checked = pendingOwners.includes(a._id as Id<"users">);
                  return (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() => togglePendingOwner(a._id as Id<"users">)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        checked
                          ? "border-primary bg-primary text-white"
                          : "border-border-strong bg-card-bg text-text-muted hover:border-primary/60"
                      }`}
                    >
                      {checked ? "✓ " : ""}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => setReassigning(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                className="h-8 px-3 text-xs"
                onClick={handleReassign}
                disabled={
                  busy || (ownershipMode === "agents" && pendingOwners.length === 0)
                }
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Collaborators */}
      <div className="space-y-3 rounded-lg border border-border-strong bg-surface-2/30 p-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <Label className="m-0">Collaborators</Label>
        </div>
        <p className="text-xs text-text-muted">
          Collaborators can view this property&apos;s documents and mandate info
          without owning it.
        </p>

        {collaborators === undefined ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : collaborators.length === 0 ? (
          <p className="text-sm text-text-muted">No collaborators yet.</p>
        ) : (
          <ul className="space-y-2">
            {collaborators.map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between rounded-md border border-border bg-card-bg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {c.agentName}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    Granted by {c.grantedByName}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemove(c.agentId)}
                    disabled={busy}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    title="Remove collaborator"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Add collaborator</Label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="h-9 w-full rounded-md border border-border-strong bg-card-bg px-2 text-sm"
              >
                <option value="">Select an agent…</option>
                {eligibleAgents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="h-9 px-3 text-xs"
              onClick={handleAdd}
              disabled={busy || !selectedAgent}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
