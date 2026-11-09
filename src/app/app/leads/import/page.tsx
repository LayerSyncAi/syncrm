"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
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
import { generateCSV, downloadBlob } from "@/lib/csv";
import { Upload, AlertTriangle, CheckCircle, FileDown, UserCheck, UserX } from "lucide-react";
import { importToasts } from "@/lib/toast";
import type { CsvWorkerResult } from "@/workers/csv-parse.worker";
import { LEAD_SOURCE_OPTIONS, leadSourceLabel, type LeadSource } from "@/lib/lead-sources";
import {
  resolveImportSource,
  type ImportSourceMode,
} from "../../../../../convex/lib/leadSources";
import {
  parseInterestType,
  type AgentMatch,
  type ImportInterest,
} from "../../../../../convex/lib/leadImportMatching";

// The last mapping used is remembered per browser and re-applied to the next
// file whose headers include the same columns (the "mapping template").
const MAPPING_TEMPLATE_KEY = "syncrm.leadImport.mappingTemplate.v1";

function loadMappingTemplate(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MAPPING_TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveMappingTemplate(map: Record<string, string>) {
  try {
    localStorage.setItem(MAPPING_TEMPLATE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode): the auto-detected mapping still works.
  }
}

/** Template first (where its column exists in this file), then auto-detect. */
function applyMappingTemplate(headers: string[], autoMap: Record<string, string>) {
  const template = loadMappingTemplate();
  const merged: Record<string, string> = { ...autoMap };
  for (const [field, header] of Object.entries(template)) {
    if (header && headers.includes(header)) merged[field] = header;
  }
  return merged;
}

const INTEREST_LABEL: Record<ImportInterest, string> = { rent: "Renting", buy: "Buying" };
type InterestChoice = "flag" | ImportInterest;

const resultCardVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const resultItemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

// #35: Step transition variants
const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
} as const;

const LEAD_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "source", label: "Source (optional — see batch source)" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
  { key: "primaryAgent", label: "Primary Agent" },
];

type ImportMode = "create_only" | "upsert" | "skip_duplicates";

interface ImportRow {
  [key: string]: string;
}

interface MappedRow {
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  interestType?: string;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas?: string;
  notes?: string;
  primaryAgent?: string;
}

interface ImportResults {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  autoAssigned: number;
  unassigned: number;
  assignmentIssues: Array<{
    row: number;
    value: string;
    reason: "ambiguous" | "not_found";
    candidates: string[];
  }>;
  interestFlagged: number;
  interestIssues: Array<{ row: number; value: string }>;
}

interface DuplicateInfo {
  rowIndex: number;
  isDuplicate: boolean;
  reason: string;
  matchingLeadId: string | null;
  matchingLeadName: string | null;
}

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

export default function LeadImportPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const bulkImport = useMutation(api.leadImport.bulkImport);

  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<ImportMode>("create_only");
  // Source for this upload. Deliberately has no default: the user must say
  // where the list came from so leads stop being filed under "Other".
  const [batchSource, setBatchSource] = useState<LeadSource | "">("");
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>("batch");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  // How to treat interest values the parser can't read, keyed by the
  // lower-cased cell value. Defaults to "flag" (import as needs-review).
  const [interestChoices, setInterestChoices] = useState<Record<string, InterestChoice>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker for CSV parsing (offloads heavy parsing from main thread)
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("@/workers/csv-parse.worker.ts", import.meta.url)
    );
    workerRef.current.onmessage = (e: MessageEvent<CsvWorkerResult>) => {
      const result = e.data;
      if (result.type === "parsed") {
        setCsvHeaders(result.headers);
        setCsvRows(result.rows);
        setColumnMap(applyMappingTemplate(result.headers, result.autoMap));
        setStep("mapping");
      } else if (result.type === "error") {
        setError(result.message);
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Duplicate check query
  const mappedPreviewRows = getMappedRows(csvRows.slice(0, 20), csvHeaders, columnMap);
  const duplicateCheckArgs = mappedPreviewRows.map((row, i) => ({
    email: row.email,
    phone: row.phone,
    rowIndex: i,
  }));
  const duplicateResults = useQuery(
    api.leadImport.checkDuplicates,
    step === "preview" && duplicateCheckArgs.length > 0
      ? { rows: duplicateCheckArgs }
      : "skip"
  );

  // ── Primary Agent preview ──
  const hasAgentColumn = !!columnMap.primaryAgent;
  const allMappedRows = useMemo(
    () => (step === "preview" ? getMappedRows(csvRows, csvHeaders, columnMap) : []),
    [step, csvRows, csvHeaders, columnMap]
  );
  const agentNames = useMemo(
    () =>
      hasAgentColumn
        ? Array.from(new Set(allMappedRows.map((r) => r.primaryAgent?.trim() ?? "").filter(Boolean)))
        : [],
    [allMappedRows, hasAgentColumn]
  );
  const agentPreview = useQuery(
    api.leadImport.previewAgentMatches,
    step === "preview" && agentNames.length > 0 ? { names: agentNames } : "skip"
  );
  const agentMatchFor = useMemo(() => {
    const map = new Map<string, AgentMatch>();
    for (const p of agentPreview ?? []) map.set(p.name, p.match as AgentMatch);
    return (raw?: string): AgentMatch | undefined => {
      const name = raw?.trim();
      if (!name) return { status: "empty" };
      return map.get(name);
    };
  }, [agentPreview]);
  const assignmentSummary = useMemo(() => {
    if (!hasAgentColumn || !agentPreview) return null;
    let assigned = 0;
    let unassigned = 0;
    let blank = 0;
    for (const r of allMappedRows) {
      const m = agentMatchFor(r.primaryAgent);
      if (!m || m.status === "empty") blank++;
      else if (m.status === "matched") assigned++;
      else unassigned++;
    }
    const unresolved = (agentPreview ?? []).filter(
      (p) => p.match.status === "ambiguous" || p.match.status === "not_found"
    );
    return { assigned, unassigned, blank, unresolved };
  }, [hasAgentColumn, agentPreview, allMappedRows, agentMatchFor]);

  // ── Interest type preview ──
  const unreadInterest = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of allMappedRows) {
      if (parseInterestType(r.interestType)) continue;
      const label = r.interestType?.trim() || "";
      const key = label.toLowerCase();
      const entry = counts.get(key) ?? { label, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
    return Array.from(counts.entries()).map(([key, v]) => ({ key, ...v }));
  }, [allMappedRows]);
  const interestFor = (raw?: string): ImportInterest | null => {
    const parsed = parseInterestType(raw);
    if (parsed) return parsed;
    const choice = interestChoices[(raw?.trim() || "").toLowerCase()];
    return choice && choice !== "flag" ? choice : null;
  };
  const flaggedInterestRows = unreadInterest
    .filter((u) => (interestChoices[u.key] ?? "flag") === "flag")
    .reduce((n, u) => n + u.count, 0);

  const handleFile = useCallback((file: File) => {
    setError("");
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "parse", text });
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const goToPreview = () => {
    // Validate required mappings
    const missing = LEAD_FIELDS.filter(
      (f) => f.required && !columnMap[f.key]
    );
    if (missing.length > 0) {
      setError(
        `Please map required fields: ${missing.map((f) => f.label).join(", ")}`
      );
      return;
    }
    if (!batchSource) {
      setError("Please choose the lead source for this batch");
      return;
    }
    setError("");
    setStep("preview");
  };

  const hasSourceColumn = !!columnMap.source;
  const effectiveSourceMode: ImportSourceMode =
    hasSourceColumn && sourceMode === "column" ? "column" : "batch";
  const resolvedSourceFor = (row: MappedRow): string =>
    batchSource
      ? leadSourceLabel(resolveImportSource(row.source, batchSource, effectiveSourceMode))
      : row.source || "";

  const runImport = async () => {
    setStep("importing");
    setError("");
    importToasts.started(csvRows.length);
    try {
      if (!batchSource) {
        throw new Error("Please choose the lead source for this batch");
      }
      saveMappingTemplate(columnMap);
      // Apply the user's choices for unreadable interest values; anything
      // left as "flag" goes through raw and the server flags it.
      const allMapped = getMappedRows(csvRows, csvHeaders, columnMap).map((row) => {
        if (parseInterestType(row.interestType)) return row;
        const choice = interestChoices[(row.interestType?.trim() || "").toLowerCase()];
        return choice && choice !== "flag" ? { ...row, interestType: choice } : row;
      });
      const result = await bulkImport({
        mode: importMode,
        batchSource,
        sourceMode: effectiveSourceMode,
        rows: allMapped,
      });
      setImportResults(result);
      importToasts.complete(result.created, result.updated, result.skipped, result.failed);
      setStep("results");
    } catch (e: any) {
      setError(e.message || "Import failed");
      importToasts.failed(e.message);
      setStep("preview");
    }
  };

  const downloadErrorCSV = () => {
    if (!importResults) return;
    const headers = ["Row", "Issue"];
    const rows = [
      ...importResults.errors.map((e) => [String(e.row + 1), e.message]),
      ...importResults.assignmentIssues.map((a) => [
        String(a.row + 1),
        a.reason === "ambiguous"
          ? `Primary Agent "${a.value}" matches several agents (${a.candidates.join(", ")}) — imported unassigned`
          : `Primary Agent "${a.value}" matches no agent — imported unassigned`,
      ]),
      ...importResults.interestIssues.map((x) => [
        String(x.row + 1),
        x.value
          ? `Interest type "${x.value}" not recognised — flagged for review`
          : "No interest type — flagged for review",
      ]),
    ].sort((a, b) => Number(a[0]) - Number(b[0]));
    if (rows.length === 0) return;
    const csv = generateCSV(headers, rows);
    downloadBlob(new Blob([csv], { type: "text/csv" }), "import-issues.csv");
  };

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    setBatchSource("");
    setSourceMode("batch");
    setImportResults(null);
    setInterestChoices({});
    setError("");
    setDuplicates([]);
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-text">Lead Import</h1>
        <p className="mt-1 text-sm text-text-muted">
          Import leads from a CSV file
        </p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      {/* #35: Step transitions */}
      <AnimatePresence mode="wait">
      {/* Step 1: Upload */}
      {step === "upload" && (
        <motion.div key="upload" variants={stepVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Upload CSV File</h2>
          </CardHeader>
          <CardContent>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed p-12 transition ${
                isDragging
                  ? "border-primary-600 bg-primary-600/5"
                  : "border-border-strong hover:border-primary-600/50"
              }`}
            >
              <Upload className="mb-3 h-10 w-10 text-text-muted" />
              <p className="text-sm font-medium text-text">
                Drag and drop your CSV file here
              </p>
              <p className="mt-1 text-xs text-text-muted">
                or click to browse files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            <div className="mt-4 text-xs text-text-muted">
              <p className="font-medium">Expected columns:</p>
              <p>
                Full Name (required), Phone (required), Email, Interest Type,
                Budget Currency, Budget Min, Budget Max, Preferred Areas, Notes,
                Primary Agent
              </p>
              <p className="mt-1">
                Primary Agent assigns each lead to the matching agent by name
                (&ldquo;J. Moyo&rdquo; and &ldquo;Moyo John&rdquo; both find John
                Moyo). Interest Type accepts portal wording such as &ldquo;To
                Let&rdquo;, &ldquo;For Rent&rdquo; or &ldquo;For Sale&rdquo;.
              </p>
              <p className="mt-1">
                You choose the lead source for the whole batch on the next step
                (e.g. PropertyBook or Property.co.zw). A Source column in the
                file is optional.
              </p>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Step 2: Column Mapping */}
      {step === "mapping" && (
        <motion.div key="mapping" variants={stepVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Map CSV Columns to Lead Fields
              </h2>
              <p className="text-sm text-text-muted">
                {csvRows.length} rows found
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {LEAD_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-4"
                >
                  <label className="w-40 text-sm font-medium text-text">
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </label>
                  <StaggeredDropDown
                    value={columnMap[field.key] || ""}
                    onChange={(val) =>
                      setColumnMap((m) => ({
                        ...m,
                        [field.key]: val,
                      }))
                    }
                    className="max-w-xs"
                    placeholder="-- Not mapped --"
                    options={[
                      { value: "", label: "-- Not mapped --" },
                      ...csvHeaders.map((h) => ({ value: h, label: h })),
                    ]}
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 rounded-[10px] border border-border bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <label className="w-40 text-sm font-medium text-text">
                  Lead source for this batch
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <StaggeredDropDown
                  value={batchSource}
                  onChange={(val) => setBatchSource(val as LeadSource | "")}
                  className="max-w-xs"
                  placeholder="Select source..."
                  options={[
                    { value: "", label: "Select source..." },
                    ...LEAD_SOURCE_OPTIONS,
                  ]}
                />
              </div>
              <p className="text-xs text-text-muted">
                Every lead in this upload is tagged with this source
                {hasSourceColumn ? " unless you use the file's Source column below." : "."}
              </p>
              {hasSourceColumn && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={sourceMode === "column"}
                    onChange={(e) =>
                      setSourceMode(e.target.checked ? "column" : "batch")
                    }
                  />
                  <span>
                    Use the mapped Source column where it names a known source
                    (e.g. &ldquo;Property Book&rdquo;, &ldquo;Property.co.zw&rdquo;).
                    Rows with an empty or unrecognised value fall back to the
                    batch source.
                  </span>
                </label>
              )}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <label className="text-sm font-medium text-text">
                Import Mode:
              </label>
              <StaggeredDropDown
                value={importMode}
                onChange={(val) => setImportMode(val as ImportMode)}
                className="max-w-xs"
                options={[
                  { value: "create_only", label: "Create only (fail on duplicates)" },
                  { value: "upsert", label: "Upsert by email/phone" },
                  { value: "skip_duplicates", label: "Skip duplicates" },
                ]}
              />
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" onClick={reset}>
                Back
              </Button>
              <Button onClick={goToPreview}>Preview Import</Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <motion.div key="preview" variants={stepVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Preview (first {Math.min(20, csvRows.length)} rows)
              </h2>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setStep("mapping")}>
                  Back
                </Button>
                <Button onClick={runImport}>
                  Import {csvRows.length} Rows
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {batchSource && (
              <p className="mb-3 text-sm text-text-muted">
                {effectiveSourceMode === "column" ? (
                  <>
                    Rows without a recognised source will be tagged{" "}
                    <span className="font-medium text-text">{leadSourceLabel(batchSource)}</span>.
                  </>
                ) : (
                  <>
                    All {csvRows.length} rows will be tagged{" "}
                    <span className="font-medium text-text">{leadSourceLabel(batchSource)}</span>.
                  </>
                )}
              </p>
            )}

            {hasAgentColumn && (
              <div className="mb-4 rounded-[10px] border border-border bg-surface-2 p-4 text-sm">
                <p className="font-medium text-text">Agent assignment</p>
                {!assignmentSummary ? (
                  <Skeleton className="mt-2 h-4 w-64" />
                ) : (
                  <>
                    <p className="mt-1 text-text-muted">
                      <span className="font-medium text-text">{assignmentSummary.assigned}</span> rows will be
                      assigned to the matching agent,{" "}
                      <span className="font-medium text-text">{assignmentSummary.unassigned}</span> will come in
                      unassigned (visible to everyone until someone takes them)
                      {assignmentSummary.blank > 0 && (
                        <>
                          , and <span className="font-medium text-text">{assignmentSummary.blank}</span> with no
                          Primary Agent will be owned by you as before
                        </>
                      )}
                      .
                    </p>
                    {assignmentSummary.unresolved.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-text-muted">
                        {assignmentSummary.unresolved.slice(0, 10).map((u) => (
                          <li key={u.name}>
                            <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />
                            &ldquo;{u.name}&rdquo;{" "}
                            {u.match.status === "ambiguous"
                              ? `matches more than one agent (${u.match.candidates.join(", ")})`
                              : "matches no agent in your organisation"}
                          </li>
                        ))}
                        {assignmentSummary.unresolved.length > 10 && (
                          <li>…and {assignmentSummary.unresolved.length - 10} more</li>
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {unreadInterest.length > 0 && (
              <div className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium text-amber-800">
                  Interest type not recognised on{" "}
                  {unreadInterest.reduce((n, u) => n + u.count, 0)} rows
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  These are not defaulted to Buying. Choose what each value means, or leave it
                  flagged: the lead is imported marked &ldquo;Interest type needs review&rdquo; so an
                  agent can set it from the lead&apos;s profile.
                </p>
                <div className="mt-3 space-y-2">
                  {unreadInterest.slice(0, 15).map((u) => (
                    <div key={u.key} className="flex flex-wrap items-center gap-3">
                      <span className="w-48 truncate text-text">
                        {u.label ? <>&ldquo;{u.label}&rdquo;</> : <em>(blank)</em>}{" "}
                        <span className="text-text-muted">× {u.count}</span>
                      </span>
                      <StaggeredDropDown
                        value={interestChoices[u.key] ?? "flag"}
                        onChange={(val) =>
                          setInterestChoices((c) => ({ ...c, [u.key]: val as InterestChoice }))
                        }
                        className="max-w-[220px]"
                        options={[
                          { value: "flag", label: "Flag for review" },
                          { value: "rent", label: "Renting" },
                          { value: "buy", label: "Buying" },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Status</TableHead>
                    {LEAD_FIELDS.map((f) => (
                      <TableHead key={f.key}>{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedPreviewRows.map((row, i) => {
                    const dup = duplicateResults?.find(
                      (d: DuplicateInfo) => d.rowIndex === i
                    );
                    return (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          {dup?.isDuplicate ? (
                            <Badge variant="warning" title={dup.reason}>
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Duplicate
                            </Badge>
                          ) : dup ? (
                            <Badge variant="success">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              New
                            </Badge>
                          ) : (
                            <Skeleton className="h-5 w-16" />
                          )}
                        </TableCell>
                        <TableCell>{row.fullName}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>{row.email || ""}</TableCell>
                        <TableCell>{resolvedSourceFor(row)}</TableCell>
                        <TableCell>
                          {(() => {
                            const interest = interestFor(row.interestType);
                            return interest ? (
                              INTEREST_LABEL[interest]
                            ) : (
                              <Badge variant="warning" title={row.interestType || "No value"}>
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Review{row.interestType ? `: ${row.interestType}` : ""}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{row.budgetCurrency || ""}</TableCell>
                        <TableCell>{row.budgetMin ?? ""}</TableCell>
                        <TableCell>{row.budgetMax ?? ""}</TableCell>
                        <TableCell>{row.preferredAreas || ""}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {row.notes || ""}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            if (!hasAgentColumn) return "";
                            const m = agentMatchFor(row.primaryAgent);
                            if (!m) return <Skeleton className="h-5 w-20" />;
                            if (m.status === "empty") return <span className="text-text-muted">You</span>;
                            if (m.status === "matched") {
                              return (
                                <span title={`From "${row.primaryAgent}"`}>
                                  <UserCheck className="mr-1 inline h-3 w-3 text-green-600" />
                                  {m.agentName}
                                </span>
                              );
                            }
                            return (
                              <Badge
                                variant="warning"
                                title={
                                  m.status === "ambiguous"
                                    ? `Matches ${m.candidates.join(", ")}`
                                    : "No agent with this name"
                                }
                              >
                                <UserX className="mr-1 h-3 w-3" />
                                Unassigned ({row.primaryAgent})
                              </Badge>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {duplicateResults && (
              <p className="mt-3 text-sm text-text-muted">
                {duplicateResults.filter((d: DuplicateInfo) => d.isDuplicate).length} potential
                duplicates found in preview.{" "}
                {importMode === "skip_duplicates"
                  ? "They will be skipped."
                  : importMode === "upsert"
                    ? "They will be updated."
                    : "They will cause errors."}
              </p>
            )}
            {flaggedInterestRows > 0 && (
              <p className="mt-1 text-sm text-text-muted">
                {flaggedInterestRows} lead{flaggedInterestRows === 1 ? "" : "s"} will be flagged for
                interest type review.
              </p>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <motion.div key="importing" variants={stepVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
            <p className="mt-4 text-sm text-text-muted">
              Importing {csvRows.length} rows...
            </p>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Step 5: Results */}
      {step === "results" && importResults && (
        <motion.div key="results" variants={stepVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Import Complete</h2>
          </CardHeader>
          <CardContent>
            <motion.div
              variants={resultCardVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            >
              <motion.div variants={resultItemVariants} className="rounded-[10px] border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">
                  {importResults.created}
                </p>
                <p className="text-xs text-green-600">Created</p>
              </motion.div>
              <motion.div variants={resultItemVariants} className="rounded-[10px] border border-blue-200 bg-blue-50 p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">
                  {importResults.updated}
                </p>
                <p className="text-xs text-blue-600">Updated</p>
              </motion.div>
              <motion.div variants={resultItemVariants} className="rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">
                  {importResults.skipped}
                </p>
                <p className="text-xs text-amber-600">Skipped</p>
              </motion.div>
              <motion.div variants={resultItemVariants} className="rounded-[10px] border border-red-200 bg-red-50 p-4 text-center">
                <p className="text-2xl font-bold text-red-700">
                  {importResults.failed}
                </p>
                <p className="text-xs text-red-600">Failed</p>
              </motion.div>
            </motion.div>

            {(importResults.autoAssigned > 0 || importResults.unassigned > 0) && (
              <motion.div
                variants={resultCardVariants}
                initial="hidden"
                animate="show"
                className="mt-4 grid grid-cols-2 gap-4"
              >
                <motion.div variants={resultItemVariants} className="rounded-[10px] border border-border bg-surface-2 p-4 text-center">
                  <p className="text-2xl font-bold text-text">{importResults.autoAssigned}</p>
                  <p className="text-xs text-text-muted">Auto-assigned to an agent</p>
                </motion.div>
                <motion.div variants={resultItemVariants} className="rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{importResults.unassigned}</p>
                  <p className="text-xs text-amber-600">Unassigned (visible to everyone)</p>
                </motion.div>
              </motion.div>
            )}

            {importResults.interestFlagged > 0 && (
              <p className="mt-4 text-sm text-amber-700">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                {importResults.interestFlagged} lead{importResults.interestFlagged === 1 ? "" : "s"} had
                no recognisable interest type and {importResults.interestFlagged === 1 ? "is" : "are"} flagged
                &ldquo;Interest type needs review&rdquo;. Set it from the lead&apos;s profile.
              </p>
            )}

            {importResults.assignmentIssues.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">
                  Primary Agent not matched ({importResults.assignmentIssues.length})
                </h3>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-[10px] border border-border-strong">
                  {importResults.assignmentIssues.slice(0, 20).map((a, i) => (
                    <div key={i} className="flex gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                      <span className="font-medium text-text-muted">Row {a.row + 1}</span>
                      <span className="text-amber-700">
                        &ldquo;{a.value}&rdquo;{" "}
                        {a.reason === "ambiguous"
                          ? `matches ${a.candidates.join(", ")}`
                          : "matches no agent"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(importResults.errors.length > 0 ||
              importResults.assignmentIssues.length > 0 ||
              importResults.interestIssues.length > 0) && (
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" size="sm" onClick={downloadErrorCSV}>
                  <FileDown className="mr-1 h-4 w-4" />
                  Download issues CSV
                </Button>
              </div>
            )}

            {importResults.errors.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text">
                    Errors ({importResults.errors.length})
                  </h3>
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-[10px] border border-border-strong">
                  {importResults.errors.slice(0, 20).map((err, i) => (
                    <div
                      key={i}
                      className="flex gap-3 border-b border-border px-3 py-2 text-sm last:border-0"
                    >
                      <span className="font-medium text-text-muted">
                        Row {err.row + 1}
                      </span>
                      <span className="text-red-600">{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <Button onClick={reset}>Import Another File</Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

/** Map raw CSV rows using the column mapping */
function getMappedRows(
  rows: string[][],
  headers: string[],
  columnMap: Record<string, string>
): MappedRow[] {
  return rows.map((row) => {
    const getVal = (fieldKey: string): string => {
      const csvHeader = columnMap[fieldKey];
      if (!csvHeader) return "";
      const idx = headers.indexOf(csvHeader);
      return idx >= 0 ? (row[idx] || "").trim() : "";
    };
    return {
      fullName: getVal("fullName"),
      phone: getVal("phone"),
      email: getVal("email") || undefined,
      source: getVal("source") || undefined,
      // No default: an empty or unreadable value is flagged, not made "buy".
      interestType: getVal("interestType") || undefined,
      budgetCurrency: getVal("budgetCurrency") || undefined,
      budgetMin: getVal("budgetMin") ? Number(getVal("budgetMin")) : undefined,
      budgetMax: getVal("budgetMax") ? Number(getVal("budgetMax")) : undefined,
      preferredAreas: getVal("preferredAreas") || undefined,
      notes: getVal("notes") || undefined,
      primaryAgent: getVal("primaryAgent") || undefined,
    };
  });
}
