"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { Merge, CheckCircle, AlertTriangle } from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";

const MERGEABLE_FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
];

export default function MergeLeadsPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const leadIdsParam = searchParams.get("ids") || "";
  const leadIds = leadIdsParam
    .split(",")
    .filter(Boolean) as Id<"leads">[];

  const [step, setStep] = useState<"select" | "resolve" | "done">(
    leadIds.length >= 2 ? "resolve" : "select"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Id<"leads">[]>(leadIds);
  const [primaryId, setPrimaryId] = useState<Id<"leads"> | null>(
    leadIds[0] || null
  );
  const [fieldResolutions, setFieldResolutions] = useState<
    Record<string, { value: string; sourceLeadId: Id<"leads"> }>
  >({});
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  const allLeads = useQuery(api.leads.list, {});
  const mergeLeads = useMutation(api.leadMerge.mergeLeads);

  // Fetch the selected leads for the merge UI
  const selectedLeads = useQuery(
    api.leadMerge.getLeadsForMerge,
    selectedIds.length >= 2 ? { leadIds: selectedIds } : "skip"
  );

  const filteredLeads = useMemo(() => {
    if (!allLeads || !searchQuery.trim()) return allLeads || [];
    const q = searchQuery.toLowerCase();
    return allLeads.filter(
      (l) =>
        l.fullName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email && l.email.toLowerCase().includes(q))
    );
  }, [allLeads, searchQuery]);

  const toggleSelect = (id: Id<"leads">) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const goToResolve = () => {
    if (selectedIds.length < 2) {
      setError("Select at least 2 leads to merge");
      return;
    }
    if (!primaryId || !selectedIds.includes(primaryId)) {
      setPrimaryId(selectedIds[0]);
    }
    setStep("resolve");
    setError("");
  };

  const setResolution = (
    field: string,
    value: string,
    sourceLeadId: Id<"leads">
  ) => {
    setFieldResolutions((prev) => ({
      ...prev,
      [field]: { value, sourceLeadId },
    }));
  };

  const doMerge = async () => {
    if (!primaryId) return;
    setMerging(true);
    setError("");
    try {
      const mergedIds = selectedIds.filter((id) => id !== primaryId);
      const resolutions = Object.entries(fieldResolutions).map(
        ([field, { value, sourceLeadId }]) => ({
          field,
          chosenValue: value,
          sourceLeadId,
        })
      );

      await mergeLeads({
        primaryLeadId: primaryId,
        mergedLeadIds: mergedIds,
        fieldResolutions: resolutions,
      });
      setStep("done");
    } catch (e: any) {
      setError(e.message || "Merge failed");
    } finally {
      setMerging(false);
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
          Only administrators can merge leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Merge Leads</h1>
        <p className="mt-1 text-sm text-text-muted">
          Select leads to merge, pick a primary, and resolve field conflicts
        </p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      {/* Step 1: Select leads */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Select Leads to Merge</h2>
              <Button
                onClick={goToResolve}
                disabled={selectedIds.length < 2}
              >
                <Merge className="mr-2 h-4 w-4" />
                Merge {selectedIds.length} Leads
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search leads by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            {!allLeads ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead className="w-16">Primary</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => (
                      <TableRow key={lead._id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(lead._id)}
                            onChange={() => toggleSelect(lead._id)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell>
                          {selectedIds.includes(lead._id) && (
                            <input
                              type="radio"
                              name="primary"
                              checked={primaryId === lead._id}
                              onChange={() => setPrimaryId(lead._id)}
                              className="h-4 w-4"
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {lead.fullName}
                        </TableCell>
                        <TableCell>{lead.phone}</TableCell>
                        <TableCell>{lead.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lead.source}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Field Resolution */}
      {step === "resolve" && selectedLeads && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Resolve Field Conflicts
              </h2>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setStep("select")}
                >
                  Back
                </Button>
                <Button onClick={doMerge} disabled={merging}>
                  {merging ? "Merging..." : "Confirm Merge"}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Primary lead:{" "}
              <strong>
                {selectedLeads.find((l) => l._id === primaryId)?.fullName}
              </strong>
              . Other leads will be archived.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {MERGEABLE_FIELDS.map((field) => {
                const values = selectedLeads.map((lead) => {
                  let val = "";
                  if (field.key === "preferredAreas") {
                    val = (lead as any).preferredAreas?.join(", ") || "";
                  } else if (
                    field.key === "budgetMin" ||
                    field.key === "budgetMax"
                  ) {
                    val = String((lead as any)[field.key] ?? "");
                  } else {
                    val = String((lead as any)[field.key] ?? "");
                  }
                  return { leadId: lead._id, leadName: lead.fullName, val };
                });

                // Get unique values
                const uniqueValues = [
                  ...new Set(values.map((v) => v.val)),
                ].filter((v) => v !== "" && v !== "undefined");
                const hasConflict = uniqueValues.length > 1;

                const currentResolution = fieldResolutions[field.key];
                const effectiveValue =
                  currentResolution?.value ??
                  (primaryId
                    ? values.find((v) => v.leadId === primaryId)?.val || ""
                    : "");

                return (
                  <div
                    key={field.key}
                    className={`rounded-[10px] border p-4 ${
                      hasConflict
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-border"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-text">
                        {field.label}
                      </span>
                      {hasConflict && (
                        <Badge variant="warning">Conflict</Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      {values.map((v) => (
                        <label
                          key={v.leadId}
                          className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 text-sm transition ${
                            effectiveValue === v.val &&
                            (currentResolution?.sourceLeadId === v.leadId ||
                              (!currentResolution && v.leadId === primaryId))
                              ? "border-primary-600 bg-primary-600/5"
                              : "border-border-strong hover:bg-row-hover"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`field-${field.key}`}
                            checked={
                              effectiveValue === v.val &&
                              (currentResolution?.sourceLeadId === v.leadId ||
                                (!currentResolution &&
                                  v.leadId === primaryId))
                            }
                            onChange={() =>
                              setResolution(field.key, v.val, v.leadId)
                            }
                            className="h-4 w-4"
                          />
                          <span className="text-text-muted">
                            {v.leadName}:
                          </span>
                          <span className="font-medium">
                            {v.val || "(empty)"}
                          </span>
                          {v.leadId === primaryId && (
                            <Badge variant="default">Primary</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-4 h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold text-text">Merge Complete</h2>
            <p className="mt-1 text-sm text-text-muted">
              Leads have been merged successfully. Related activities and
              properties have been moved to the primary lead.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push("/app/leads")}
              >
                Go to Leads
              </Button>
              {primaryId && (
                <Button
                  onClick={() => router.push(`/app/leads/${primaryId}`)}
                >
                  View Primary Lead
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
