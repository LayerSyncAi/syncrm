"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
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
import { parseCSV, generateCSV, downloadBlob } from "@/lib/csv";
import { Upload, AlertTriangle, CheckCircle, XCircle, FileDown } from "lucide-react";
import { importToasts } from "@/lib/toast";

const resultCardVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const resultItemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const LEAD_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
];

type ImportMode = "create_only" | "upsert" | "skip_duplicates";

interface ImportRow {
  [key: string]: string;
}

interface MappedRow {
  fullName: string;
  phone: string;
  email?: string;
  source: string;
  interestType: string;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas?: string;
  notes?: string;
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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [importResults, setImportResults] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFile = useCallback((file: File) => {
    setError("");
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setError("CSV must have a header row and at least one data row");
        return;
      }
      const headers = parsed[0].map((h) => h.trim());
      const dataRows = parsed.slice(1);
      setCsvHeaders(headers);
      setCsvRows(dataRows);

      // Auto-map columns by fuzzy matching
      const autoMap: Record<string, string> = {};
      for (const field of LEAD_FIELDS) {
        const match = headers.find(
          (h) =>
            h.toLowerCase().replace(/[_\s-]/g, "") ===
            field.key.toLowerCase().replace(/[_\s-]/g, "")
        );
        if (match) {
          autoMap[field.key] = match;
        } else {
          // Try label match
          const labelMatch = headers.find(
            (h) =>
              h.toLowerCase().replace(/[_\s-]/g, "") ===
              field.label.toLowerCase().replace(/[_\s-]/g, "")
          );
          if (labelMatch) autoMap[field.key] = labelMatch;
        }
      }
      setColumnMap(autoMap);
      setStep("mapping");
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
    setError("");
    setStep("preview");
  };

  const runImport = async () => {
    setStep("importing");
    setError("");
    importToasts.started(csvRows.length);
    try {
      const allMapped = getMappedRows(csvRows, csvHeaders, columnMap);
      const result = await bulkImport({
        mode: importMode,
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
    if (!importResults?.errors.length) return;
    const headers = ["Row", "Error"];
    const rows = importResults.errors.map((e) => [
      String(e.row + 1),
      e.message,
    ]);
    const csv = generateCSV(headers, rows);
    downloadBlob(new Blob([csv], { type: "text/csv" }), "import-errors.csv");
  };

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    setImportResults(null);
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
        <h1 className="text-xl font-semibold text-text">Lead Import</h1>
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

      {/* Step 1: Upload */}
      {step === "upload" && (
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
                Full Name (required), Phone (required), Email, Source, Interest
                Type, Budget Currency, Budget Min, Budget Max, Preferred Areas,
                Notes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === "mapping" && (
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
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
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
                        <TableCell>{row.source}</TableCell>
                        <TableCell>{row.interestType}</TableCell>
                        <TableCell>{row.budgetCurrency || ""}</TableCell>
                        <TableCell>{row.budgetMin ?? ""}</TableCell>
                        <TableCell>{row.budgetMax ?? ""}</TableCell>
                        <TableCell>{row.preferredAreas || ""}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {row.notes || ""}
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
          </CardContent>
        </Card>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
            <p className="mt-4 text-sm text-text-muted">
              Importing {csvRows.length} rows...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Results */}
      {step === "results" && importResults && (
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

            {importResults.errors.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text">
                    Errors ({importResults.errors.length})
                  </h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadErrorCSV}
                  >
                    <FileDown className="mr-1 h-4 w-4" />
                    Download Error CSV
                  </Button>
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
      )}
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
      source: getVal("source") || "other",
      interestType: getVal("interestType") || "buy",
      budgetCurrency: getVal("budgetCurrency") || undefined,
      budgetMin: getVal("budgetMin") ? Number(getVal("budgetMin")) : undefined,
      budgetMax: getVal("budgetMax") ? Number(getVal("budgetMax")) : undefined,
      preferredAreas: getVal("preferredAreas") || undefined,
      notes: getVal("notes") || undefined,
    };
  });
}
