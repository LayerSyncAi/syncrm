"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Save, RefreshCw, Star, Check, X, Loader2 } from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { scoringToasts } from "@/lib/toast";

const cardItemTransition = { type: "spring" as const, stiffness: 300, damping: 24 };

/* ── Scoring weight slider with glow + floating value ── */
function GlowSlider({
  value,
  onChange,
  disabled,
  max = 100,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  max?: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const percent = Math.min((value / max) * 100, 100);

  return (
    <div className="relative flex items-center gap-3 w-full min-w-[180px]">
      {/* Floating weight bubble */}
      <motion.div
        className="absolute -top-7 pointer-events-none rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-white shadow-md"
        style={{ left: `calc(${percent}% - 16px)` }}
        animate={{
          scale: isDragging ? 1.15 : 1,
          y: isDragging ? -2 : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {value}
      </motion.div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
        className="slider-glow w-full h-[6px] appearance-none rounded-full bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          "--slider-percent": `${percent}%`,
          "--slider-glow": isDragging ? "1" : "0",
        } as React.CSSProperties}
      />
    </div>
  );
}

interface Criterion {
  key: string;
  label: string;
  type: "boolean" | "threshold";
  weight: number;
  enabled: boolean;
  threshold?: number;
}

export default function LeadScoringPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();
  const config = useQuery(api.leadScoring.getConfig);
  const saveConfig = useMutation(api.leadScoring.saveConfig);
  const recomputeAll = useMutation(api.leadScoring.recomputeAllScores);
  const leads = useQuery(api.leads.list, {});

  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");
  const [previewLeadId, setPreviewLeadId] = useState<Id<"leads"> | "">("");

  // Load config into local state
  useEffect(() => {
    if (config?.criteria) {
      setCriteria(config.criteria as Criterion[]);
    }
  }, [config]);

  // Real-time preview
  const previewResult = useQuery(
    api.leadScoring.computeScorePreview,
    previewLeadId
      ? {
          leadId: previewLeadId as Id<"leads">,
          criteria: criteria.map((c) => ({
            ...c,
            threshold: c.threshold ?? undefined,
          })),
        }
      : "skip"
  );

  const updateCriterion = (index: number, updates: Partial<Criterion>) => {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaveSuccess(false);
    try {
      await saveConfig({
        criteria: criteria.map((c) => ({
          ...c,
          threshold: c.threshold ?? undefined,
        })),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to save");
      scoringToasts.configSaveFailed(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    setError("");
    scoringToasts.recomputeStarted();
    try {
      const result = await recomputeAll();
      setError("");
      setSaveSuccess(false);
      scoringToasts.recomputeComplete();
    } catch (e: any) {
      setError(e.message || "Recompute failed");
      scoringToasts.recomputeFailed(e.message);
    } finally {
      setRecomputing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="mb-4 h-12 w-12 text-amber-500" />
        <h2 className="text-lg font-semibold">Admin Access Required</h2>
        <p className="mt-1 text-sm text-text-muted">
          Only administrators can configure lead scoring.
        </p>
      </div>
    );
  }

  const maxPossibleScore = criteria
    .filter((c) => c.enabled)
    .reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Lead Scoring</h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure scoring criteria and weights
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleRecompute}
            disabled={recomputing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${recomputing ? "animate-spin" : ""}`}
            />
            {recomputing ? "Recomputing..." : "Recompute All Scores"}
          </Button>
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {saveSuccess && (
                <motion.span
                  initial={{ opacity: 0, x: 12, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 12, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="flex items-center gap-1.5 text-sm font-medium text-green-600"
                >
                  <Check className="h-4 w-4" />
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Config"}
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline save indicator is shown next to the save button */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Criteria Configuration */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Scoring Criteria</h2>
                <p className="text-sm text-text-muted">
                  Max possible score: {maxPossibleScore}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {!config ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {criteria.map((criterion, i) => (
                    <motion.div
                      key={criterion.key}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...cardItemTransition, delay: i * 0.06 }}
                      className={`rounded-[10px] border p-4 transition ${
                        criterion.enabled
                          ? "border-border-strong bg-card-bg"
                          : "border-border bg-surface-2/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              updateCriterion(i, {
                                enabled: !criterion.enabled,
                              })
                            }
                            className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                              criterion.enabled
                                ? "border-primary-600 bg-primary-600 text-white"
                                : "border-border-strong text-transparent"
                            }`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <div>
                            <p className="text-sm font-medium text-text">
                              {criterion.label}
                            </p>
                            <p className="text-xs text-text-muted">
                              Type:{" "}
                              {criterion.type === "boolean"
                                ? "Yes/No"
                                : "Threshold"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {criterion.type === "threshold" && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-text-muted">
                                Threshold:
                              </label>
                              <Input
                                type="number"
                                value={criterion.threshold ?? 0}
                                onChange={(e) =>
                                  updateCriterion(i, {
                                    threshold: Number(e.target.value),
                                  })
                                }
                                className="h-8 w-24"
                                disabled={!criterion.enabled}
                              />
                            </div>
                          )}
                          <div className="relative pt-6">
                            <GlowSlider
                              value={criterion.weight}
                              onChange={(v) =>
                                updateCriterion(i, { weight: v })
                              }
                              disabled={!criterion.enabled}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Real-time Preview Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold">
                <Star className="mr-2 inline h-4 w-4 text-amber-500" />
                Live Score Preview
              </h2>
            </CardHeader>
            <CardContent>
              <Select
                value={previewLeadId}
                onChange={(e) =>
                  setPreviewLeadId(e.target.value as Id<"leads"> | "")
                }
                className="mb-4"
              >
                <option value="">Select a lead to preview...</option>
                {leads?.slice(0, 50).map((lead) => (
                  <option key={lead._id} value={lead._id}>
                    {lead.fullName} ({lead.phone})
                  </option>
                ))}
              </Select>

              {previewLeadId && !previewResult && (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}

              {previewResult && (
                <div>
                  {/* Score display */}
                  <div className="mb-4 rounded-[10px] border border-border-strong p-4 text-center">
                    <p className="text-3xl font-bold text-text">
                      {previewResult.totalScore}
                    </p>
                    <p className="text-sm text-text-muted">
                      out of {maxPossibleScore}
                    </p>
                    <div className="mx-auto mt-2 h-3 w-full max-w-[200px] rounded-full bg-border">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          previewResult.totalScore / maxPossibleScore > 0.7
                            ? "bg-green-500"
                            : previewResult.totalScore / maxPossibleScore > 0.4
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${Math.min((previewResult.totalScore / Math.max(maxPossibleScore, 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Score Breakdown
                    </p>
                    {previewResult.breakdown.map((item: { key: string; label: string; points: number; met: boolean }) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-[8px] border border-border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {item.met ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                          <span className={item.met ? "text-text" : "text-text-muted"}>
                            {item.label}
                          </span>
                        </div>
                        <span
                          className={`font-medium ${
                            item.met ? "text-green-600" : "text-text-muted"
                          }`}
                        >
                          {item.met ? `+${item.points}` : "0"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!previewLeadId && (
                <p className="py-8 text-center text-sm text-text-muted">
                  Select a lead above to see a live score preview. Adjusting
                  criteria will update the score in real time.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
