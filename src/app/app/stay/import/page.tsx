"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileDown, FileSpreadsheet, Lock, Upload, XCircle } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Section, StayPageHeader } from "@/components/stay/page-header";
import { IMPORT_COLUMNS, IMPORT_NOTES, batches, parseImportRows, type ImportError, type ImportProperty } from "@/lib/stay/import";
import { datePrefix } from "@/lib/stay/format";

type Result = { name: string; ok: boolean; error?: string; warnings: string[]; units: number; leases: number };

async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const example = IMPORT_COLUMNS.map((c) => c.example);
  const second = IMPORT_COLUMNS.map((c) =>
    c.key === "propertyName" ? "12 Kings Road" : c.key === "unit" ? "Flat 2" : c.key === "bedrooms" ? 1 : ""
  );
  const sheet = XLSX.utils.aoa_to_sheet([headers, example, second]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(32, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, sheet, "Units");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["How to fill in this template"], ...IMPORT_NOTES.map((n) => [n])]), "Notes");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${datePrefix()}Sync_Stay_import_template.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StayImportPage() {
  const hub = useQuery(api.hub.getContext);
  const importBatch = useMutation(api.stay.importer.importBatch);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<{ properties: ImportProperty[]; errors: ImportError[] } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [results, setResults] = React.useState<Result[] | null>(null);

  if (hub === undefined) return <ListSkeleton />;
  if (!hub?.isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Directors only"
        description="Ask a director to import properties, landlords, tenants and leases."
        action={
          <Link href="/app/stay/properties">
            <Button variant="secondary">Back to properties</Button>
          </Link>
        }
      />
    );
  }

  async function onFile(file: File) {
    setResults(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase() !== "notes") ?? wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      setParsed(parseImportRows(rows));
    } catch (e) {
      setParsed(null);
      animatedToast.error("Could not read the file", { description: getErrorMessage(e) });
    }
  }

  async function runImport() {
    if (!parsed?.properties.length) return;
    setRunning(true);
    setProgress(0);
    const all: Result[] = [];
    try {
      for (const batch of batches(parsed.properties, 10)) {
        const res = await importBatch({ properties: batch });
        all.push(...res);
        setProgress(all.length);
      }
      const ok = all.filter((r) => r.ok).length;
      animatedToast.success("Import finished", { description: `${ok} of ${all.length} properties imported` });
    } catch (e) {
      animatedToast.error("Import stopped", { description: getErrorMessage(e) });
    } finally {
      setResults(all);
      setRunning(false);
    }
  }

  const unitCount = parsed?.properties.reduce((s, p) => s + p.units.length, 0) ?? 0;
  const leaseCount = parsed?.properties.reduce((s, p) => s + p.units.filter((u) => u.lease).length, 0) ?? 0;
  const landlordCount = parsed ? new Set(parsed.properties.map((p) => p.landlord.name.trim().toLowerCase())).size : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <StayPageHeader
        title="Import from Excel"
        description="Bring in your existing landlords, properties, units, tenants and leases in one go."
        back={{ href: "/app/stay/properties", label: "Properties" }}
      />

      <Section title="1. Fill in the template">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-text-muted">
          {IMPORT_NOTES.slice(0, 3).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <Button variant="secondary" onClick={downloadTemplate} className="gap-2">
          <FileDown className="h-4 w-4" />
          Download template
        </Button>
      </Section>

      <Section title="2. Upload it">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={running} className="gap-2">
          <Upload className="h-4 w-4" />
          {fileName ? "Choose another file" : "Choose file"}
        </Button>
        {fileName && <p className="mt-2 flex items-center gap-2 text-sm text-text-muted"><FileSpreadsheet className="h-4 w-4" />{fileName}</p>}
      </Section>

      {parsed && (
        <Section title="3. Check and import">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Properties", parsed.properties.length],
                ["Units", unitCount],
                ["Leases", leaseCount],
                ["Landlords", landlordCount],
              ].map(([label, n]) => (
                <div key={label as string} className="rounded-[10px] bg-surface-2 p-3">
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className="text-lg font-semibold">{n}</p>
                </div>
              ))}
            </div>

            {parsed.errors.length > 0 && (
              <div className="rounded-lg bg-danger/10 p-3 text-sm">
                <p className="font-medium text-danger">
                  {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} will be left out. Fix them in the file and upload again, or import the rest now.
                </p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {parsed.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.properties.length > 0 && !results && (
              <Button onClick={runImport} disabled={running} className="h-12 w-full sm:h-10 sm:w-auto">
                {running ? `Importing ${progress} of ${parsed.properties.length}...` : `Import ${parsed.properties.length} propert${parsed.properties.length === 1 ? "y" : "ies"}`}
              </Button>
            )}
          </div>
        </Section>
      )}

      {results && (
        <Section title="Results">
          <ul className="divide-y divide-border text-sm">
            {results.map((r, i) => (
              <li key={i} className="py-2">
                <div className="flex items-start gap-2">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-text-muted">
                      {r.ok ? `${r.units} new unit${r.units === 1 ? "" : "s"}, ${r.leases} lease${r.leases === 1 ? "" : "s"}` : r.error}
                    </p>
                    {r.warnings.map((w, j) => (
                      <p key={j} className="text-[var(--status-warning-fg)]">
                        {w}
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Link href="/app/stay/properties">
              <Button variant="secondary">Go to properties</Button>
            </Link>
          </div>
        </Section>
      )}
    </div>
  );
}
