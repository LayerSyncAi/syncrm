"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

interface ScoreBreakdownData {
  totalScore: number;
  maxPossible: number;
  breakdown: { key: string; label: string; met: boolean; points: number; maxPoints: number }[];
}

interface LeadHeroCardProps {
  lead: {
    fullName: string;
    phone: string;
    email?: string;
    interestType: string;
    preferredAreas: string[];
    stageId: Id<"pipelineStages">;
    closedAt?: number;
    createdAt: number;
  };
  stage: { terminalOutcome: "won" | "lost" | null; isTerminal: boolean; order: number } | null;
  owner: { fullName?: string; name?: string; email?: string } | null;
  stages: { _id: string; name: string; order: number; isTerminal: boolean; terminalOutcome: "won" | "lost" | null }[] | undefined;
  scoreBreakdown: ScoreBreakdownData | null | undefined;
  stageProgress: number;
  closeReason: string;
  onCloseReasonChange: (val: string) => void;
  dealValue: string;
  onDealValueChange: (val: string) => void;
  dealCurrency: string;
  onDealCurrencyChange: (val: string) => void;
  onStageChange: (stageId: Id<"pipelineStages">) => void;
  onViewDetails: () => void;
}

export const LeadHeroCard = React.memo(function LeadHeroCard({
  lead,
  stage,
  owner,
  stages,
  scoreBreakdown,
  stageProgress,
  closeReason,
  onCloseReasonChange,
  dealValue,
  onDealValueChange,
  dealCurrency,
  onDealCurrencyChange,
  onStageChange,
  onViewDetails,
}: LeadHeroCardProps) {
  const [scoreExpanded, setScoreExpanded] = React.useState(false);

  return (
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
                {lead.closedAt ? (stage?.terminalOutcome === "won" ? "Won" : "Lost") : "Open"}
              </Badge>
              <Badge
                className={
                  lead.interestType === "buy" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
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
              <Button variant="secondary" className="h-9 px-3 text-xs" onClick={onViewDetails}>
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
              <div className="mt-2 h-2 rounded-full bg-border overflow-hidden">
                <motion.div
                  className={`h-2 rounded-full relative overflow-hidden ${
                    lead.closedAt && stage?.terminalOutcome === "lost" ? "bg-danger" : "bg-primary"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${stageProgress}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.3 }}
                >
                  <div className="shimmer-overlay" />
                </motion.div>
              </div>
            </div>
            {scoreBreakdown && (
              <div>
                <button onClick={() => setScoreExpanded((p) => !p)} className="w-full text-left">
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
            onChange={(val) => onStageChange(val as Id<"pipelineStages">)}
            options={stages?.map((s) => ({ value: s._id, label: s.name })) ?? []}
          />
          {stages?.find((s) => s._id === lead.stageId)?.isTerminal && (
            <>
              <Input
                placeholder="Close reason"
                value={closeReason}
                onChange={(e) => onCloseReasonChange(e.target.value)}
                className="max-w-xs"
              />
              {stages?.find((s) => s._id === lead.stageId)?.terminalOutcome === "won" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Deal value"
                    value={dealValue}
                    onChange={(e) => onDealValueChange(e.target.value)}
                    className="max-w-[140px]"
                  />
                  <select
                    value={dealCurrency}
                    onChange={(e) => onDealCurrencyChange(e.target.value)}
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
  );
});
