"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { propertyShareToasts } from "@/lib/toast";
import { Loader2, Share2, X, CheckCircle, XCircle, Clock } from "lucide-react";

interface PropertyShareProps {
  propertyId: Id<"properties">;
  currentUserId: Id<"users">;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          <Clock className="h-3 w-3" /> Active
        </span>
      );
    case "closed_won":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle className="h-3 w-3" /> Won
        </span>
      );
    case "closed_lost":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          <XCircle className="h-3 w-3" /> Lost
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          <X className="h-3 w-3" /> Cancelled
        </span>
      );
    default:
      return <span className="text-xs text-text-muted">{status}</span>;
  }
};

export function PropertyShare({ propertyId, currentUserId }: PropertyShareProps) {
  const shares = useQuery(api.propertyShares.listForProperty, { propertyId });
  const agents = useQuery(api.users.listForAssignment);
  const leads = useQuery(api.leads.list, {});
  const shareProperty = useMutation(api.propertyShares.shareProperty);
  const cancelShare = useMutation(api.propertyShares.cancelShare);

  const [showForm, setShowForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedLead, setSelectedLead] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Filter agents to exclude current user
  const availableAgents = agents?.filter((a) => a._id !== currentUserId) ?? [];

  // Filter leads to show leads owned by the selected agent
  const agentLeads = leads?.filter((l) => l.ownerUserId === selectedAgent) ?? [];

  const handleShare = async () => {
    if (!selectedAgent || !selectedLead) {
      setError("Please select an agent and a lead");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await shareProperty({
        propertyId,
        leadId: selectedLead as Id<"leads">,
        sharedWithUserId: selectedAgent as Id<"users">,
        notes: notes.trim() || undefined,
      });
      const agentName = availableAgents.find((a) => a._id === selectedAgent)?.name || "agent";
      propertyShareToasts.shared("Property", agentName);
      setShowForm(false);
      setSelectedAgent("");
      setSelectedLead("");
      setNotes("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to share property";
      setError(msg);
      propertyShareToasts.shareFailed(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (shareId: Id<"propertyShares">) => {
    try {
      await cancelShare({ shareId });
      propertyShareToasts.cancelled();
    } catch (err) {
      propertyShareToasts.cancelFailed(err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Property Shares</h4>
        {!showForm && (
          <Button
            variant="secondary"
            className="h-8 px-3"
            onClick={() => setShowForm(true)}
          >
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            Share with Agent
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm text-text-muted">
            Share this property with an agent who has a matching lead. They will be responsible for closing the deal.
          </p>

          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}

          <div className="space-y-2">
            <Label>Select Agent *</Label>
            <Select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setSelectedLead("");
              }}
            >
              <option value="">Choose an agent...</option>
              {availableAgents.map((agent) => (
                <option key={agent._id} value={agent._id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedAgent && (
            <div className="space-y-2">
              <Label>Select Lead *</Label>
              {agentLeads.length === 0 ? (
                <p className="text-sm text-text-muted">
                  This agent has no active leads. Select a different agent.
                </p>
              ) : (
                <Select
                  value={selectedLead}
                  onChange={(e) => setSelectedLead(e.target.value)}
                >
                  <option value="">Choose a lead...</option>
                  {agentLeads.map((lead) => (
                    <option key={lead._id} value={lead._id}>
                      {lead.fullName} — {lead.interestType === "buy" ? "Buying" : "Renting"} ({lead.stageName})
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this share..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setError("");
                setSelectedAgent("");
                setSelectedLead("");
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Share Property
            </Button>
          </div>
        </div>
      )}

      {/* Existing shares */}
      {shares === undefined ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : shares.length === 0 ? (
        <p className="text-sm text-text-muted py-2">
          This property has not been shared with any agents yet.
        </p>
      ) : (
        <div className="space-y-2">
          {shares.map((share) => (
            <div
              key={share._id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {statusBadge(share.status)}
                  <span className="text-sm font-medium">
                    {share.sharedByName} → {share.sharedWithName}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  Lead: {share.leadName}
                </p>
                {share.notes && (
                  <p className="text-xs text-text-muted italic">{share.notes}</p>
                )}
              </div>
              {share.status === "active" && (share.sharedByUserId === currentUserId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => handleCancel(share._id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
