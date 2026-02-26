"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { propertyToasts } from "@/lib/toast";

// --- #26-28 animation variants ---

const suggestionContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const suggestionCardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

interface PropertySuggestionsProps {
  leadId: Id<"leads">;
  onPropertySelect?: (propertyId: Id<"properties">) => void;
  onCompareSelect?: (propertyIds: Id<"properties">[]) => void;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-700 border-blue-200";
  if (score >= 40) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

// #27: Score bar with spring fill
function ScoreBar({ label, score, maxScore }: { label: string; score: number; maxScore: number }) {
  const percentage = (score / maxScore) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className={getScoreColor(percentage)}>{score}/{maxScore}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <motion.div
          className={`h-1.5 rounded-full ${
            percentage >= 80 ? "bg-green-500" :
            percentage >= 60 ? "bg-blue-500" :
            percentage >= 40 ? "bg-amber-500" : "bg-red-500"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.1 }}
        />
      </div>
    </div>
  );
}

export function PropertySuggestions({
  leadId,
  onPropertySelect,
  onCompareSelect,
}: PropertySuggestionsProps) {
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState<string | null>(null);

  const suggestions = useQuery(api.matches.suggestPropertiesForLead, {
    leadId,
    limit: 10,
    minScore: 20,
  });

  const attachProperty = useMutation(api.matches.attachPropertyToLead);

  const handleAttachProperty = async (propertyId: Id<"properties">) => {
    setIsAttaching(propertyId);
    try {
      await attachProperty({
        leadId,
        propertyId,
        matchType: "suggested",
      });
      propertyToasts.suggested();
    } catch (error) {
      console.error("Failed to attach property:", error);
      propertyToasts.suggestFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsAttaching(null);
    }
  };

  const toggleCompareSelection = (propertyId: string) => {
    const newSelected = new Set(selectedForCompare);
    if (newSelected.has(propertyId)) {
      newSelected.delete(propertyId);
    } else if (newSelected.size < 5) {
      newSelected.add(propertyId);
    }
    setSelectedForCompare(newSelected);
  };

  const handleCompare = () => {
    if (selectedForCompare.size >= 2 && onCompareSelect) {
      onCompareSelect(Array.from(selectedForCompare) as Id<"properties">[]);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (suggestions === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const { lead, suggestions: propertySuggestions, matchedCount, totalAvailableProperties } = suggestions;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            AI-Suggested Properties
          </h3>
          <p className="text-xs text-text-muted mt-1">
            {matchedCount} matches from {totalAvailableProperties} available properties
          </p>
        </div>
        {selectedForCompare.size >= 2 && (
          <Button onClick={handleCompare} variant="secondary" className="h-8 text-xs">
            Compare ({selectedForCompare.size})
          </Button>
        )}
      </div>

      {/* Lead Preferences Summary */}
      <Card className="p-4 bg-info/5 border-info/20">
        <h4 className="text-xs font-semibold text-text-muted mb-2">Matching Criteria</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-text-muted">Interest:</span>
            <span className="ml-1 font-medium">{lead.interestType === "buy" ? "Buying" : "Renting"}</span>
          </div>
          <div>
            <span className="text-text-muted">Budget:</span>
            <span className="ml-1 font-medium">
              {lead.budgetMin || lead.budgetMax
                ? `${lead.budgetCurrency || "USD"} ${lead.budgetMin?.toLocaleString() || "0"} - ${lead.budgetMax?.toLocaleString() || "No max"}`
                : "Not specified"}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-text-muted">Areas:</span>
            <span className="ml-1 font-medium">
              {lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "Not specified"}
            </span>
          </div>
        </div>
      </Card>

      {/* Suggestions List */}
      {propertySuggestions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">No matching properties found based on lead preferences.</p>
          <p className="text-xs text-text-muted mt-2">
            Try adjusting the lead&apos;s budget or preferred areas to find more matches.
          </p>
        </Card>
      ) : (
        // #26: Suggestion card stagger + hover lift
        <motion.div variants={suggestionContainerVariants} initial="hidden" animate="show" className="space-y-3">
          {propertySuggestions.map((suggestion) => (
            <motion.div
              key={suggestion.property._id}
              variants={suggestionCardVariants}
              whileHover={{ y: -3, boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
            <Card
              className={`p-4 transition-all ${
                selectedForCompare.has(suggestion.property._id) ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex gap-4">
                {/* Property Image */}
                {suggestion.property.images.length > 0 && (
                  <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-border">
                    <img
                      src={suggestion.property.images[0]}
                      alt={suggestion.property.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Property Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium text-sm truncate">{suggestion.property.title}</h4>
                      <p className="text-xs text-text-muted">{suggestion.property.location}</p>
                    </div>
                    <Badge className={getScoreBadgeClass(suggestion.totalScore)}>
                      {suggestion.totalScore}% match
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-border px-2 py-0.5 rounded">
                      {formatPrice(suggestion.property.price, suggestion.property.currency)}
                    </span>
                    <span className="text-xs bg-border px-2 py-0.5 rounded capitalize">
                      {suggestion.property.type}
                    </span>
                    <span className="text-xs bg-border px-2 py-0.5 rounded">
                      {suggestion.property.listingType === "sale" ? "For Sale" : "For Rent"}
                    </span>
                    {suggestion.property.bedrooms && (
                      <span className="text-xs bg-border px-2 py-0.5 rounded">
                        {suggestion.property.bedrooms} bed
                      </span>
                    )}
                    {suggestion.property.area && (
                      <span className="text-xs bg-border px-2 py-0.5 rounded">
                        {suggestion.property.area} sqm
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      suggestion.property.status === "available"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {suggestion.property.status}
                    </span>
                  </div>

                  {/* Score Breakdown - Collapsible */}
                  <button
                    className="text-xs text-primary mt-2 hover:underline"
                    onClick={() => setExpandedCard(
                      expandedCard === suggestion.property._id ? null : suggestion.property._id
                    )}
                  >
                    {expandedCard === suggestion.property._id ? "Hide score details" : "Show score details"}
                  </button>

                  {/* #28: Score breakdown expand/collapse animation */}
                  <AnimatePresence>
                  {expandedCard === suggestion.property._id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                      className="overflow-hidden"
                    >
                    <div className="mt-3 space-y-2 p-3 bg-card-bg/50 rounded-lg border border-border">
                      <ScoreBar label="Interest Type" score={suggestion.interestTypeScore} maxScore={30} />
                      <ScoreBar label="Budget Fit" score={suggestion.budgetScore} maxScore={35} />
                      <ScoreBar label="Location" score={suggestion.locationScore} maxScore={25} />
                      <ScoreBar label="Availability" score={suggestion.availabilityScore} maxScore={10} />

                      {suggestion.matchReasons.length > 0 && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-text-muted mb-1">Match reasons:</p>
                          <ul className="text-xs text-green-600 space-y-0.5">
                            {suggestion.matchReasons.map((reason, i) => (
                              <li key={i}>+ {reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {suggestion.warnings.length > 0 && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-text-muted mb-1">Considerations:</p>
                          <ul className="text-xs text-amber-600 space-y-0.5">
                            {suggestion.warnings.map((warning, i) => (
                              <li key={i}>! {warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    variant="primary"
                    className="h-8 text-xs"
                    onClick={() => handleAttachProperty(suggestion.property._id)}
                    disabled={isAttaching === suggestion.property._id}
                  >
                    {isAttaching === suggestion.property._id ? "..." : "Suggest"}
                  </Button>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedForCompare.has(suggestion.property._id)}
                      onChange={() => toggleCompareSelection(suggestion.property._id)}
                      className="rounded border-border"
                    />
                    Compare
                  </label>
                </div>
              </div>
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
