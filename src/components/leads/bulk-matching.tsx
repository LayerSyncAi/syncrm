"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { bulkMatchToasts } from "@/lib/toast";

// #30: Bulk matching animations
const bulkStatContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const bulkStatItemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const bulkResultContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const bulkResultItemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

interface BulkMatchingProps {
  open: boolean;
  onClose: () => void;
  selectedLeadIds?: Id<"leads">[];
}

type MatchResult = {
  lead: {
    _id: string;
    fullName: string;
    interestType: string;
    budgetMin?: number;
    budgetMax?: number;
    budgetCurrency?: string;
    preferredAreas: string[];
  };
  matchCount: number;
  topMatches: Array<{
    propertyId: string;
    propertyTitle: string;
    propertyLocation: string;
    propertyPrice: number;
    propertyCurrency: string;
    propertyType: string;
    listingType: string;
    totalScore: number;
    matchReasons: string[];
    warnings: string[];
  }>;
};

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-700 border-blue-200";
  if (score >= 40) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

export function BulkMatching({ open, onClose, selectedLeadIds }: BulkMatchingProps) {
  const [minScore, setMinScore] = useState(50);
  const [topN, setTopN] = useState(5);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<Map<string, Set<string>>>(new Map());
  const [isAttaching, setIsAttaching] = useState(false);

  const bulkMatchData = useQuery(
    api.matches.bulkMatchProperties,
    open ? { leadIds: selectedLeadIds, minScore, topN } : "skip"
  );

  const bulkAttach = useMutation(api.matches.bulkAttachSuggested);

  const togglePropertySelection = (leadId: string, propertyId: string) => {
    const newSelections = new Map(selectedAttachments);
    const leadSelections = newSelections.get(leadId) ?? new Set();

    if (leadSelections.has(propertyId)) {
      leadSelections.delete(propertyId);
    } else {
      leadSelections.add(propertyId);
    }

    if (leadSelections.size === 0) {
      newSelections.delete(leadId);
    } else {
      newSelections.set(leadId, leadSelections);
    }

    setSelectedAttachments(newSelections);
  };

  const selectAllForLead = (leadId: string, propertyIds: string[]) => {
    const newSelections = new Map(selectedAttachments);
    newSelections.set(leadId, new Set(propertyIds));
    setSelectedAttachments(newSelections);
  };

  const clearAllForLead = (leadId: string) => {
    const newSelections = new Map(selectedAttachments);
    newSelections.delete(leadId);
    setSelectedAttachments(newSelections);
  };

  const getTotalSelectedCount = () => {
    let count = 0;
    selectedAttachments.forEach((set) => {
      count += set.size;
    });
    return count;
  };

  const handleBulkAttach = async () => {
    const attachments: { leadId: Id<"leads">; propertyId: Id<"properties"> }[] = [];

    selectedAttachments.forEach((propertyIds, leadId) => {
      propertyIds.forEach((propertyId) => {
        attachments.push({
          leadId: leadId as Id<"leads">,
          propertyId: propertyId as Id<"properties">,
        });
      });
    });

    if (attachments.length === 0) return;

    setIsAttaching(true);
    try {
      const result = await bulkAttach({ attachments });
      if (result.successCount > 0) {
        bulkMatchToasts.attached(result.successCount);
        setSelectedAttachments(new Map());
      }
    } catch (error) {
      console.error("Failed to bulk attach:", error);
      bulkMatchToasts.attachFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsAttaching(false);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (!open) return null;

  const results = bulkMatchData?.results ?? [];
  const summary = bulkMatchData?.summary;

  return (
    <Modal
      open={open}
      title="Bulk Property Matching"
      description="Find matching properties for multiple leads at once"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-muted">
            {getTotalSelectedCount()} properties selected for suggestion
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={handleBulkAttach}
              disabled={isAttaching || getTotalSelectedCount() === 0}
            >
              {isAttaching ? "Suggesting..." : `Suggest All (${getTotalSelectedCount()})`}
            </Button>
          </div>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-card-bg/50 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">Min Score:</label>
          <StaggeredDropDown
            value={minScore.toString()}
            onChange={(val) => setMinScore(parseInt(val))}
            className="w-24"
            options={[
              { value: "30", label: "30%" },
              { value: "40", label: "40%" },
              { value: "50", label: "50%" },
              { value: "60", label: "60%" },
              { value: "70", label: "70%" },
              { value: "80", label: "80%" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">Top N per lead:</label>
          <StaggeredDropDown
            value={topN.toString()}
            onChange={(val) => setTopN(parseInt(val))}
            className="w-20"
            options={[
              { value: "3", label: "3" },
              { value: "5", label: "5" },
              { value: "10", label: "10" },
            ]}
          />
        </div>
      </div>

      {/* #30: Summary Stats with stagger entrance */}
      {summary && (
        <motion.div variants={bulkStatContainerVariants} initial="hidden" animate="show" className="grid grid-cols-4 gap-3 mb-4">
          <motion.div variants={bulkStatItemVariants}>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{summary.totalLeads}</p>
            <p className="text-xs text-text-muted">Leads Analyzed</p>
          </Card>
          </motion.div>
          <motion.div variants={bulkStatItemVariants}>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{summary.leadsWithMatches}</p>
            <p className="text-xs text-text-muted">With Matches</p>
          </Card>
          </motion.div>
          <motion.div variants={bulkStatItemVariants}>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{summary.avgMatchesPerLead}</p>
            <p className="text-xs text-text-muted">Avg Matches/Lead</p>
          </Card>
          </motion.div>
          <motion.div variants={bulkStatItemVariants}>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-text-muted">{summary.totalPropertiesAnalyzed}</p>
            <p className="text-xs text-text-muted">Properties Scanned</p>
          </Card>
          </motion.div>
        </motion.div>
      )}

      {/* Results */}
      {bulkMatchData === undefined ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : results.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">No leads to analyze. Select leads or adjust filters.</p>
        </Card>
      ) : (
        <motion.div variants={bulkResultContainerVariants} initial="hidden" animate="show" className="space-y-3 max-h-[400px] overflow-y-auto">
          {results.map((result: MatchResult) => (
            <motion.div key={result.lead._id} variants={bulkResultItemVariants}>
            <Card className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedLead(expandedLead === result.lead._id ? null : result.lead._id)}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-sm">{result.lead.fullName}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge className="text-[10px]">
                        {result.lead.interestType === "buy" ? "Buying" : "Renting"}
                      </Badge>
                      {result.lead.preferredAreas.slice(0, 2).map((area) => (
                        <Badge key={area} variant="secondary" className="text-[10px]">
                          {area}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      result.matchCount > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }
                  >
                    {result.matchCount} matches
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {expandedLead === result.lead._id ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {expandedLead === result.lead._id && result.topMatches.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-text-muted">Top matching properties:</p>
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllForLead(
                            result.lead._id,
                            result.topMatches.map((m) => m.propertyId)
                          );
                        }}
                      >
                        Select all
                      </button>
                      <button
                        className="text-xs text-text-muted hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAllForLead(result.lead._id);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {result.topMatches.map((match) => {
                    const isSelected = selectedAttachments.get(result.lead._id)?.has(match.propertyId);

                    return (
                      <label
                        key={match.propertyId}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-card-bg/50"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePropertySelection(result.lead._id, match.propertyId)}
                            className="rounded border-border"
                          />
                          <div>
                            <p className="text-sm font-medium">{match.propertyTitle}</p>
                            <p className="text-xs text-text-muted">
                              {match.propertyLocation} &middot;{" "}
                              {formatPrice(match.propertyPrice, match.propertyCurrency)} &middot;{" "}
                              {match.listingType === "sale" ? "For Sale" : "For Rent"}
                            </p>
                          </div>
                        </div>
                        <Badge className={getScoreBadgeClass(match.totalScore)}>
                          {match.totalScore}%
                        </Badge>
                      </label>
                    );
                  })}
                </div>
              )}

              {expandedLead === result.lead._id && result.matchCount === 0 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-xs text-amber-700">
                    No properties match this lead&apos;s criteria above {minScore}% score.
                  </p>
                </div>
              )}
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </Modal>
  );
}
